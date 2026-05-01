import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { ObjectType } from '../objects/objectTypes'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import type { CookingSystem, StoveState } from './CookingSystem'
import type { FoodStockStation } from './foodStockTypes'
import { RestaurantFridgeReservations } from './RestaurantFridgeReservations'
import type { CounterRecord, RestaurantSystem } from './RestaurantSystem'
import { pickDoneStove, pickIdleStove, pickStockedFridge } from './restaurantChefStations'
import { findStaffApproachPoint, staffNextToStation } from './RestaurantStaffMovement'

const CHEF_AUTO_RECIPE = 'sandwich'

export class RestaurantChefFlow {
  private heldRecipe = new Map<string, string>()
  private targetCounter = new Map<string, { x: number; y: number }>()
  private fridgeReservations = new RestaurantFridgeReservations()
  private stoves = new Map<string, StoveState>()

  constructor(
    private readonly restaurant: RestaurantSystem,
    private readonly cooking: CookingSystem,
    private readonly pathfinder: GridPathfinder,
    private readonly spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => boolean,
  ) {}

  releaseAllForBot(bot: BotNirv): void {
    this.heldRecipe.delete(bot.id)
    this.targetCounter.delete(bot.id)
    this.fridgeReservations.release(bot.id)
    const stove = this.stoves.get(bot.id)
    if (stove) this.cooking.releaseStoveReservation(stove, bot.id)
    this.stoves.delete(bot.id)
    this.cooking.releaseStoveReservationByBot(bot.id)
    this.restaurant.releaseCounterReservationForBot(bot.id)
  }

  tick(bot: BotNirv, building: Building): void {
    if (!isChefPipeline(bot.state)) {
      bot.enterChefIdle()
      return
    }
    if (bot.state === 'chef_idle') return this.startCookingTask(bot, building)
    if (bot.state === 'chef_to_stove') return this.tryStartCooking(bot, building)
    if (bot.state === 'chef_cooking') return this.tryCollectFinishedFood(bot, building)
    if (bot.state === 'chef_to_counter') this.tryDropOffFood(bot, building)
  }

  private startCookingTask(bot: BotNirv, building: Building): void {
    const doneStove = pickDoneStove(this.cooking, this.pathfinder, bot, building)
    if (doneStove) {
      // Lock done stove to this chef to avoid double-claim races.
      if (doneStove.reservedChefBotId === null) doneStove.reservedChefBotId = bot.id
      this.stoves.set(bot.id, doneStove)
      bot.enterChefCooking()
      return
    }
    const stove = pickIdleStove(this.cooking, this.pathfinder, bot, building)
    if (!stove || !this.cooking.tryReserveStoveForChef(stove, bot.id)) return
    const fridge = pickStockedFridge(
      this.cooking.getFridgesInBuilding(building),
      this.pathfinder,
      bot,
      building,
      f => this.fridgeReservations.availableStock(f),
    )
    if (!fridge) {
      this.cooking.releaseStoveReservation(stove, bot.id)
      return
    }
    const approach = findStaffApproachPoint(this.pathfinder, bot, building, fridge.x, fridge.y)
    if (!approach) {
      this.cooking.releaseStoveReservation(stove, bot.id)
      return
    }
    this.fridgeReservations.reserve(fridge, bot.id)
    this.stoves.set(bot.id, stove)
    bot.enterChefWalkToStove(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private tryStartCooking(bot: BotNirv, building: Building): void {
    const stove = this.stoves.get(bot.id)
    if (!stove || !bot.getWalkRedirectTarget()) return this.abort(bot)
    const fridge = this.fridgeReservations.getTarget(bot.id)
    if (fridge) return this.tryCollectIngredients(bot, building, stove, fridge)
    if (!staffNextToStation(this.restaurant, bot, stove.x, stove.y)) return
    if (stove.status !== 'idle') return this.abort(bot)
    this.cooking.startCooking(stove, CHEF_AUTO_RECIPE)
    bot.enterChefCooking()
  }

  private tryCollectFinishedFood(bot: BotNirv, building: Building): void {
    // If chef already holds a plate, keep progressing drop-off and don't re-enter stove logic.
    if (this.heldRecipe.has(bot.id)) {
      const target = this.targetCounter.get(bot.id)
      if (target && this.restaurant.canPlaceOnReservedCounter(bot.id, target.x, target.y)) {
        this.walkToCounter(bot, building, target.x, target.y)
        return
      }
      const counter = this.reserveCounter(bot, building)
      if (!counter) return
      this.walkToCounter(bot, building, counter.x, counter.y)
      return
    }

    const stove = this.stoves.get(bot.id)
    if (!stove) {
      bot.enterChefIdle()
      return
    }
    if (stove.status === 'idle') {
      this.stoves.delete(bot.id)
      bot.enterChefIdle()
      return
    }
    if (stove.status !== 'done') return
    const counter = this.reserveCounter(bot, building)
    if (!counter) return
    const recipeId = this.cooking.collectFood(stove)
    if (!recipeId) {
      this.restaurant.releaseCounterReservationForBot(bot.id)
      this.stoves.delete(bot.id)
      bot.enterChefIdle()
      return
    }
    this.heldRecipe.set(bot.id, recipeId)
    this.walkToCounter(bot, building, counter.x, counter.y)
  }

  private tryDropOffFood(bot: BotNirv, building: Building): void {
    const recipeId = this.heldRecipe.get(bot.id)
    const target = this.targetCounter.get(bot.id)
    if (!recipeId || !target) return this.abort(bot)
    if (!this.restaurant.canPlaceOnReservedCounter(bot.id, target.x, target.y)) {
      const next = this.reserveCounter(bot, building)
      if (next) this.walkToCounter(bot, building, next.x, next.y)
      return
    }
    if (!staffNextToStation(this.restaurant, bot, target.x, target.y)) return
    if (!this.spawnObject('food_plate', target.x, target.y, true, recipeId)) return
    this.restaurant.releaseCounterReservationForBot(bot.id)
    this.heldRecipe.delete(bot.id)
    this.targetCounter.delete(bot.id)
    this.stoves.delete(bot.id)
    bot.enterChefIdle()
  }

  private reserveCounter(bot: BotNirv, building: Building): CounterRecord | null {
    return this.restaurant.reserveChefCounter(
      building.id,
      bot.id,
      c => findStaffApproachPoint(this.pathfinder, bot, building, c.x, c.y) !== null,
    )
  }

  private walkToCounter(bot: BotNirv, building: Building, counterX: number, counterY: number): void {
    const approach = findStaffApproachPoint(this.pathfinder, bot, building, counterX, counterY)
    if (!approach) {
      this.restaurant.releaseCounterReservationForBot(bot.id)
      this.targetCounter.delete(bot.id)
      return
    }
    this.targetCounter.set(bot.id, { x: counterX, y: counterY })
    bot.enterChefWalkToCounter(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private tryCollectIngredients(
    bot: BotNirv,
    building: Building,
    stove: StoveState,
    fridge: FoodStockStation,
  ): void {
    if (!staffNextToStation(this.restaurant, bot, fridge.x, fridge.y)) return
    if (!this.cooking.tryConsumeFridgeStock(fridge)) return this.abort(bot)
    this.fridgeReservations.release(bot.id)
    const approach = findStaffApproachPoint(this.pathfinder, bot, building, stove.x, stove.y)
    if (!approach) return this.abort(bot)
    bot.enterChefWalkToStove(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private abort(bot: BotNirv): void {
    this.releaseAllForBot(bot)
    bot.enterChefIdle()
  }
}

function isChefPipeline(state: BotNirv['state']): boolean {
  return state === 'chef_idle' || state === 'chef_to_stove' ||
    state === 'chef_cooking' || state === 'chef_to_counter'
}
