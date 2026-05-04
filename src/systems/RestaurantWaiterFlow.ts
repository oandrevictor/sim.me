import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { removeObjectByType } from '../storage/persistence'
import type { ObjectType } from '../objects/objectTypes'
import type { PlateEntry } from '../world/ObjectSpawner'
import type { RestaurantSystem, WaiterServiceClaim } from './RestaurantSystem'
import { findRestaurantIdlePoint, findStaffApproachPoint, staffNextToStation } from './RestaurantStaffMovement'
import { WaiterPlateState } from './WaiterPlateState'

export class RestaurantWaiterFlow {
  private readonly plates: WaiterPlateState

  constructor(
    private readonly restaurant: RestaurantSystem,
    private readonly pathfinder: GridPathfinder,
    private readonly spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => boolean,
    private readonly removePlateEntry: (entry: PlateEntry) => void,
    private readonly getPlateEntries: () => PlateEntry[],
  ) {
    this.plates = new WaiterPlateState(restaurant, spawnObject)
  }

  releaseAllForBot(bot: BotNirv, building: Building | null = null): void {
    this.plates.releaseAllForBot(bot.id, building?.id ?? null, () => true)
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
    if (this.plates.getCarried(bot.id)) {
      this.startReturningPlate(bot, building)
      return
    }
    const claim = this.claimService(bot, building)
    if (!claim) {
      this.startJoiningRestaurant(bot, building)
      return
    }
    this.walkToClaimedCounter(bot, building, claim)
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
    const recipeId = this.plates.getCarried(bot.id)
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
    if (this.spawnObject('food_plate', claim.table.x, claim.table.y, true, recipeId)) {
      this.plates.setCarried(bot.id, null)
      bot.enterWaiterIdle()
    } else this.startReturningPlate(bot, building)
  }

  private tryReturnPlate(bot: BotNirv, building: Building): void {
    const idleTarget = this.plates.getIdleTarget(bot.id)
    const recipeId = this.plates.getCarried(bot.id)
    if (!recipeId) {
      const claim = this.claimService(bot, building)
      if (claim) {
        this.plates.clearIdleTarget(bot.id)
        this.walkToClaimedCounter(bot, building, claim)
        return
      }
      if (idleTarget && !staffNextToStation(this.restaurant, bot, idleTarget.x, idleTarget.y)) return
      this.plates.clearIdleTarget(bot.id)
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
      this.plates.clearReturnCounter(bot.id)
      this.restaurant.releaseCounterReservationForBot(bot.id)
      return
    }
    if (this.plates.tryPlaceOnReturnCounter(bot.id, target)) bot.enterWaiterIdle()
  }

  private pickupCounterPlate(bot: BotNirv, claim: WaiterServiceClaim): void {
    const plate = claim.counter.plate!
    this.restaurant.removePlateFromCounterBySprite(plate.sprite)
    removeObjectByType(claim.counter.x, claim.counter.y, 'food_plate')
    const entry = this.getPlateEntries().find(p => p.sprite === plate.sprite)
    if (entry) this.removePlateEntry(entry)
    plate.sprite.destroy()
    this.restaurant.markWaiterPickedUp(bot.id)
    this.plates.setCarried(bot.id, plate.recipeId)
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
      this.plates.clearReturnCounter(bot.id)
      this.restaurant.releaseCounterReservationForBot(bot.id)
      bot.enterWaiterReturnPlate()
      return
    }
    bot.enterWaiterReturnPlate(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private ensureReturnCounter(bot: BotNirv, building: Building): { x: number; y: number } | null {
    return this.plates.ensureReturnCounter(
      building.id,
      bot.id,
      c => findStaffApproachPoint(this.pathfinder, bot, building, c.x, c.y) !== null,
    )
  }

  private startJoiningRestaurant(bot: BotNirv, building: Building): void {
    const sprite = bot.nirv.sprite
    if (building.containsPixel(sprite.x, sprite.y)) return
    const target = findRestaurantIdlePoint(this.pathfinder, bot, building)
    if (!target) return
    this.plates.setIdleTarget(bot.id, target)
    bot.enterWaiterReturnPlate(target.x, target.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }

  private claimService(bot: BotNirv, building: Building): WaiterServiceClaim | null {
    return this.restaurant.claimWaiterService(building.id, bot.id,
      c => findStaffApproachPoint(this.pathfinder, bot, building, c.x, c.y) !== null,
      t => findStaffApproachPoint(this.pathfinder, bot, building, t.x, t.y) !== null)
  }

  private walkToClaimedCounter(bot: BotNirv, building: Building, claim: WaiterServiceClaim): void {
    const approach = findStaffApproachPoint(this.pathfinder, bot, building, claim.counter.x, claim.counter.y)
    if (!approach) this.restaurant.releaseWaiterClaim(bot.id)
    else bot.enterWaiterWalkToCounter(approach.x, approach.y, building.getInteriorPathBounds(GRID_COLS, GRID_ROWS))
  }
}

function isWaiterPipeline(state: BotNirv['state']): boolean {
  return state === 'waiter_idle' || state === 'waiter_to_counter' || state === 'waiter_to_table' || state === 'waiter_returning_plate'
}
