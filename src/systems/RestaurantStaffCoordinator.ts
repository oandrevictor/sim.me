import Phaser from 'phaser'
import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import { removeObjectByType } from '../storage/persistence'
import type { ObjectType } from '../objects/objectTypes'
import type { CookingSystem, StoveState } from './CookingSystem'
import type { RestaurantSystem } from './RestaurantSystem'
import type { RestaurantStaffAssignments } from './RestaurantStaffAssignments'
import type { PlateEntry } from '../world/ObjectSpawner'

const CHEF_AUTO_RECIPE = 'sandwich'
/** Pixel proximity; grid adjacency (below) handles approach tiles from pathfinding. */
const STAFF_PIXEL_REACH = 56

export class RestaurantStaffCoordinator {
  private chefHeldRecipe = new Map<string, string>()
  private chefTargetCounter = new Map<string, { x: number; y: number }>()
  private chefStoves = new Map<string, StoveState>()
  /** Counter world position when starting a pickup walk (redirect is a nearby tile, not counter x/y). */
  private waiterCounterPickup = new Map<string, { x: number; y: number }>()

  constructor(
    private readonly buildings: Building[],
    private readonly bots: BotNirv[],
    private readonly assignments: RestaurantStaffAssignments,
    private readonly restaurant: RestaurantSystem,
    private readonly cooking: CookingSystem,
    private readonly spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => void,
    private readonly removePlateEntry: (entry: PlateEntry) => void,
    private readonly getPlateEntries: () => PlateEntry[],
  ) {}

  releaseAllForBot(bot: BotNirv): void {
    this.chefHeldRecipe.delete(bot.id)
    this.chefTargetCounter.delete(bot.id)
    this.waiterCounterPickup.delete(bot.id)
    const st = this.chefStoves.get(bot.id)
    if (st) this.cooking.releaseStoveReservation(st, bot.id)
    this.chefStoves.delete(bot.id)
    this.cooking.releaseStoveReservationByBot(bot.id)
  }

  update(): void {
    for (const building of this.buildings) {
      if (building.type !== 'restaurant') continue
      const staff = this.assignments.get(building.id)
      for (const id of staff.chefBotIds) {
        const bot = this.bots.find(b => b.id === id)
        if (bot) this.tickChef(bot, building)
      }
      for (const id of staff.waiterBotIds) {
        const bot = this.bots.find(b => b.id === id)
        if (bot) this.tickWaiter(bot, building)
      }
    }
  }

  private tickChef(bot: BotNirv, building: Building): void {
    if (!isChefPipeline(bot.state)) {
      bot.enterChefIdle()
      return
    }

    if (bot.state === 'chef_idle') {
      const stove = this.pickIdleReservedOrFreeStove(building, bot.id)
      if (!stove) return
      if (!this.cooking.tryReserveStoveForChef(stove, bot.id)) return
      this.chefStoves.set(bot.id, stove)
      bot.enterChefWalkToStove(stove.x, stove.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
      return
    }

    if (bot.state === 'chef_to_stove') {
      const stove = this.chefStoves.get(bot.id)
      if (!stove || !bot.getWalkRedirectTarget()) {
        this.abortChef(bot)
        return
      }
      if (this.staffNextToStation(bot, stove.x, stove.y)) {
        if (stove.status !== 'idle') {
          this.abortChef(bot)
          return
        }
        this.cooking.startCooking(stove, CHEF_AUTO_RECIPE)
        bot.enterChefCooking()
      }
      return
    }

    if (bot.state === 'chef_cooking') {
      const stove = this.chefStoves.get(bot.id)
      if (!stove) {
        bot.enterChefIdle()
        return
      }
      if (stove.status !== 'done') return
      const free = this.restaurant.countFreeCounterSlotsInBuilding(building.id)
      if (free === 0) return
      const recipeId = this.cooking.collectFood(stove)
      if (!recipeId) {
        bot.enterChefIdle()
        this.chefStoves.delete(bot.id)
        return
      }
      this.chefHeldRecipe.set(bot.id, recipeId)
      const counter = this.restaurant.findFreeCounterInBuilding(building.id)
      if (!counter) {
        this.chefHeldRecipe.delete(bot.id)
        bot.enterChefIdle()
        this.chefStoves.delete(bot.id)
        return
      }
      this.chefTargetCounter.set(bot.id, { x: counter.x, y: counter.y })
      bot.enterChefWalkToCounter(counter.x, counter.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
      return
    }

    if (bot.state === 'chef_to_counter') {
      const recipeId = this.chefHeldRecipe.get(bot.id)
      const counterPos = this.chefTargetCounter.get(bot.id)
      if (!recipeId || !counterPos) {
        this.abortChef(bot)
        return
      }
      if (this.staffNextToStation(bot, counterPos.x, counterPos.y)) {
        this.spawnObject('food_plate', counterPos.x, counterPos.y, true, recipeId)
        this.chefHeldRecipe.delete(bot.id)
        this.chefTargetCounter.delete(bot.id)
        this.chefStoves.delete(bot.id)
        bot.enterChefIdle()
      }
    }
  }

  private tickWaiter(bot: BotNirv, building: Building): void {
    if (!isWaiterPipeline(bot.state)) {
      bot.enterWaiterIdle()
      return
    }

    if (bot.state === 'waiter_idle') {
      if (!this.restaurant.hasFoodOnCounterInBuilding(building.id)) return
      if (!this.restaurant.buildingHasAwaitingCustomer(building.id)) return
      const table = this.restaurant.findWaiterServiceTable(building.id)
      if (!table) return
      const c = this.restaurant.getFirstCounterWithFoodInBuilding(building.id)
      if (!c?.plate) return
      this.waiterCounterPickup.set(bot.id, { x: c.x, y: c.y })
      bot.enterWaiterWalkToCounter(c.x, c.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
      return
    }

    if (bot.state === 'waiter_to_counter') {
      const goal = this.waiterCounterPickup.get(bot.id)
      if (!goal) {
        bot.enterWaiterIdle()
        return
      }
      const c = this.restaurant.getCounterAt(goal.x, goal.y)
      if (!c?.plate) {
        this.waiterCounterPickup.delete(bot.id)
        bot.enterWaiterIdle()
        return
      }
      if (!this.staffNextToStation(bot, c.x, c.y)) return
      const sprite = c.plate.sprite
      const recipeId = c.plate.recipeId
      this.restaurant.removePlateFromCounterBySprite(sprite)
      removeObjectByType(c.x, c.y, 'food_plate')
      const entry = this.getPlateEntries().find(p => p.sprite === sprite)
      if (entry) {
        sprite.destroy()
        this.removePlateEntry(entry)
      } else {
        sprite.destroy()
      }
      bot.setStaffCarriedRecipeId(recipeId)
      const dest = this.restaurant.findWaiterServiceTable(building.id)
      if (!dest) {
        bot.setStaffCarriedRecipeId(null)
        bot.enterWaiterIdle()
        return
      }
      this.waiterCounterPickup.delete(bot.id)
      bot.enterWaiterWalkToTable(dest.tableX, dest.tableY, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
      return
    }

    if (bot.state === 'waiter_to_table') {
      const recipeId = bot.getStaffCarriedRecipeId()
      const rt = bot.getWalkRedirectTarget()
      if (!recipeId || !rt) {
        bot.setStaffCarriedRecipeId(null)
        bot.enterWaiterIdle()
        return
      }
      const { x: tableX, y: tableY } = rt
      if (this.staffNextToStation(bot, tableX, tableY)) {
        this.spawnObject('food_plate', tableX, tableY, true, recipeId)
        bot.setStaffCarriedRecipeId(null)
        bot.enterWaiterIdle()
      }
    }
  }

  private pickIdleReservedOrFreeStove(building: Building, botId: string): StoveState | null {
    const stoves = this.cooking.getStovesInBuilding(building)
    const mine = stoves.find(s => s.reservedChefBotId === botId && s.status === 'idle')
    if (mine) return mine
    return stoves.find(s => s.status === 'idle' && s.reservedChefBotId === null) ?? null
  }

  /** True when close enough to interact: same rule as chairs↔tables (1 grid step) or tight pixel radius. */
  private staffNextToStation(bot: BotNirv, worldX: number, worldY: number): boolean {
    const sx = bot.nirv.sprite.x
    const sy = bot.nirv.sprite.y
    if (Phaser.Math.Distance.Between(sx, sy, worldX, worldY) < STAFF_PIXEL_REACH) return true
    return this.restaurant.isGridAdjacent(sx, sy, worldX, worldY)
  }

  private abortChef(bot: BotNirv): void {
    this.chefHeldRecipe.delete(bot.id)
    this.chefTargetCounter.delete(bot.id)
    const st = this.chefStoves.get(bot.id)
    if (st) this.cooking.releaseStoveReservation(st, bot.id)
    this.chefStoves.delete(bot.id)
    bot.enterChefIdle()
  }
}

function isChefPipeline(s: BotNirv['state']): boolean {
  return s === 'chef_idle' || s === 'chef_to_stove' || s === 'chef_cooking' || s === 'chef_to_counter'
}

function isWaiterPipeline(s: BotNirv['state']): boolean {
  return s === 'waiter_idle' || s === 'waiter_to_counter' || s === 'waiter_to_table'
}
