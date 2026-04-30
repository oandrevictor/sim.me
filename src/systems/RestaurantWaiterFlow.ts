import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { removeObjectByType } from '../storage/persistence'
import type { ObjectType } from '../objects/objectTypes'
import type { PlateEntry } from '../world/ObjectSpawner'
import type { RestaurantSystem, WaiterServiceClaim } from './RestaurantSystem'
import { findStaffApproachPoint, staffNextToStation } from './RestaurantStaffMovement'

export class RestaurantWaiterFlow {
  private returnCounters = new Map<string, { x: number; y: number }>()

  constructor(
    private readonly restaurant: RestaurantSystem,
    private readonly pathfinder: GridPathfinder,
    private readonly spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => void,
    private readonly removePlateEntry: (entry: PlateEntry) => void,
    private readonly getPlateEntries: () => PlateEntry[],
  ) {}

  releaseAllForBot(bot: BotNirv): void {
    this.returnCounters.delete(bot.id)
    this.restaurant.releaseWaiterClaim(bot.id)
    this.restaurant.releaseCounterReservationForBot(bot.id)
  }

  tick(bot: BotNirv, building: Building): void {
    if (!isWaiterPipeline(bot.state)) {
      bot.enterWaiterIdle()
      return
    }
    if (bot.state === 'waiter_idle') return this.startWaiterTask(bot, building)
    if (bot.state === 'waiter_to_counter') return this.tryPickupPlate(bot, building)
    if (bot.state === 'waiter_to_table') return this.tryDeliverPlate(bot, building)
    if (bot.state === 'waiter_returning_plate') this.tryReturnPlate(bot, building)
  }

  private startWaiterTask(bot: BotNirv, building: Building): void {
    if (bot.getStaffCarriedRecipeId()) {
      this.startReturningPlate(bot, building)
      return
    }
    const claim = this.restaurant.claimWaiterService(
      building.id,
      bot.id,
      c => findStaffApproachPoint(this.pathfinder, bot, building, c.x, c.y) !== null,
      t => findStaffApproachPoint(this.pathfinder, bot, building, t.x, t.y) !== null,
    )
    if (!claim) return
    const approach = findStaffApproachPoint(this.pathfinder, bot, building, claim.counter.x, claim.counter.y)
    if (!approach) {
      this.restaurant.releaseWaiterClaim(bot.id)
      return
    }
    bot.enterWaiterWalkToCounter(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private tryPickupPlate(bot: BotNirv, building: Building): void {
    const claim = this.restaurant.getWaiterClaim(bot.id)
    if (!claim) {
      bot.enterWaiterIdle()
      return
    }
    if (!this.restaurant.canDeliverWaiterClaim(bot.id)) {
      this.restaurant.releaseWaiterClaim(bot.id)
      bot.enterWaiterIdle()
      return
    }
    const plate = claim.counter.plate
    if (!plate) {
      this.restaurant.releaseWaiterClaim(bot.id)
      bot.enterWaiterIdle()
      return
    }
    if (!staffNextToStation(this.restaurant, bot, claim.counter.x, claim.counter.y)) return
    this.pickupCounterPlate(bot, claim)
    this.walkToClaimedTableOrReturn(bot, building, claim)
  }

  private tryDeliverPlate(bot: BotNirv, building: Building): void {
    const recipeId = bot.getStaffCarriedRecipeId()
    const claim = this.restaurant.getWaiterClaim(bot.id)
    if (!recipeId) {
      this.restaurant.releaseWaiterClaim(bot.id)
      bot.enterWaiterIdle()
      return
    }
    if (!claim || !this.restaurant.canDeliverWaiterClaim(bot.id)) {
      this.startReturningPlate(bot, building)
      return
    }
    if (!staffNextToStation(this.restaurant, bot, claim.table.x, claim.table.y)) return
    this.restaurant.releaseWaiterClaim(bot.id)
    this.spawnObject('food_plate', claim.table.x, claim.table.y, true, recipeId)
    bot.setStaffCarriedRecipeId(null)
    bot.enterWaiterIdle()
  }

  private tryReturnPlate(bot: BotNirv, building: Building): void {
    const recipeId = bot.getStaffCarriedRecipeId()
    if (!recipeId) {
      this.returnCounters.delete(bot.id)
      this.restaurant.releaseCounterReservationForBot(bot.id)
      bot.enterWaiterIdle()
      return
    }
    const target = this.ensureReturnCounter(bot, building)
    if (!target) {
      bot.enterWaiterReturnPlate()
      return
    }
    if (!staffNextToStation(this.restaurant, bot, target.x, target.y)) return
    if (!this.restaurant.canPlaceOnReservedCounter(bot.id, target.x, target.y)) {
      this.returnCounters.delete(bot.id)
      this.restaurant.releaseCounterReservationForBot(bot.id)
      return
    }
    this.spawnObject('food_plate', target.x, target.y, true, recipeId)
    this.returnCounters.delete(bot.id)
    this.restaurant.releaseCounterReservationForBot(bot.id)
    bot.setStaffCarriedRecipeId(null)
    bot.enterWaiterIdle()
  }

  private pickupCounterPlate(bot: BotNirv, claim: WaiterServiceClaim): void {
    const plate = claim.counter.plate!
    this.restaurant.removePlateFromCounterBySprite(plate.sprite)
    removeObjectByType(claim.counter.x, claim.counter.y, 'food_plate')
    const entry = this.getPlateEntries().find(p => p.sprite === plate.sprite)
    if (entry) this.removePlateEntry(entry)
    plate.sprite.destroy()
    this.restaurant.markWaiterPickedUp(bot.id)
    bot.setStaffCarriedRecipeId(plate.recipeId)
  }

  private walkToClaimedTableOrReturn(bot: BotNirv, building: Building, claim: WaiterServiceClaim): void {
    if (!this.restaurant.canDeliverWaiterClaim(bot.id)) {
      this.startReturningPlate(bot, building)
      return
    }
    const approach = findStaffApproachPoint(this.pathfinder, bot, building, claim.table.x, claim.table.y)
    if (!approach) {
      this.startReturningPlate(bot, building)
      return
    }
    bot.enterWaiterWalkToTable(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private startReturningPlate(bot: BotNirv, building: Building): void {
    this.restaurant.releaseWaiterClaim(bot.id)
    const counter = this.ensureReturnCounter(bot, building)
    if (!counter) {
      bot.enterWaiterReturnPlate()
      return
    }
    const approach = findStaffApproachPoint(this.pathfinder, bot, building, counter.x, counter.y)
    if (!approach) {
      this.returnCounters.delete(bot.id)
      this.restaurant.releaseCounterReservationForBot(bot.id)
      bot.enterWaiterReturnPlate()
      return
    }
    bot.enterWaiterReturnPlate(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private ensureReturnCounter(bot: BotNirv, building: Building): { x: number; y: number } | null {
    const current = this.returnCounters.get(bot.id)
    if (current && this.restaurant.canPlaceOnReservedCounter(bot.id, current.x, current.y)) return current
    const counter = this.restaurant.reserveReturnCounter(
      building.id,
      bot.id,
      c => findStaffApproachPoint(this.pathfinder, bot, building, c.x, c.y) !== null,
    )
    if (!counter) {
      this.returnCounters.delete(bot.id)
      return null
    }
    this.returnCounters.set(bot.id, { x: counter.x, y: counter.y })
    return counter
  }
}

function isWaiterPipeline(state: BotNirv['state']): boolean {
  return state === 'waiter_idle' || state === 'waiter_to_counter' ||
    state === 'waiter_to_table' || state === 'waiter_returning_plate'
}
