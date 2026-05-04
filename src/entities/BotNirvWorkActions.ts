// @ts-nocheck
import Phaser from 'phaser'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import { rollLeaveEarly } from '../systems/stageAffinity'
import { DEPTH_UI } from '../config/world'
import { EARLY_LEAVE_CHECK_INTERVAL_MS } from '../systems/stagePerformanceRuntime'
import { fruitSlotWorldPosition } from '../systems/fruitCrateLayout'
import { isFarmerState, isHouseState, isPerformerWorkState, isRestaurantStaffState, isStockerState } from './botStates'

const FUN_WATCH_TICK_MS = 10_000
const FUN_GAIN_MATCH = 10
const FUN_GAIN_NO_MATCH = 5
const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 24
const CHAIR_ARRIVAL_THRESHOLD = 32

function installMethods(target: any, source: any): void {
  for (const name of Object.getOwnPropertyNames(source.prototype)) {
    if (name === 'constructor') continue
    Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
  }
}

export function installBotNirvWorkActions(target: any): void { installMethods(target, BotNirvWorkActionMethods) }

class BotNirvWorkActionMethods {
  enterChefIdle(): void {
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'chef_idle'
    this.nirv.updateAnimation(0, 0)
  }

  enterWaiterIdle(): void {
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'waiter_idle'
    this.nirv.updateAnimation(0, 0)
  }

  enterChefWalkToStove(x: number, y: number, interior: StageInteriorBounds | null = null): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'chef_to_stove'
    this.nirv.sprite.setVelocity(0, 0)
    this.startRestaurantStaffWalk(x, y, interior)
  }

  enterChefCooking(): void {
    this.restaurantInteriorBounds = null
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'chef_cooking'
    this.nirv.updateAnimation(0, 0)
  }

  enterChefWalkToCounter(x: number, y: number, interior: StageInteriorBounds | null = null): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'chef_to_counter'
    this.nirv.sprite.setVelocity(0, 0)
    this.startRestaurantStaffWalk(x, y, interior)
  }

  enterWaiterWalkToCounter(x: number, y: number, interior: StageInteriorBounds | null = null): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'waiter_to_counter'
    this.nirv.sprite.setVelocity(0, 0)
    this.startRestaurantStaffWalk(x, y, interior)
  }

  enterWaiterWalkToTable(x: number, y: number, interior: StageInteriorBounds | null = null): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'waiter_to_table'
    this.nirv.sprite.setVelocity(0, 0)
    this.startRestaurantStaffWalk(x, y, interior)
  }

  enterWaiterReturnPlate(x?: number, y?: number, interior: StageInteriorBounds | null = null): void {
    this.performInterior = null
    this.pathEndCell = null
    this.restaurantInteriorBounds = null
    this.redirectTarget = x === undefined || y === undefined ? null : { x, y }
    this._state = 'waiter_returning_plate'
    this.nirv.sprite.setVelocity(0, 0)
    if (x !== undefined && y !== undefined) this.startRestaurantStaffWalk(x, y, interior)
    else {
      this.path = []
      this.nirv.updateAnimation(0, 0)
    }
  }

  enterFarmerIdle(): void {
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'farmer_idle'
    this.nirv.updateAnimation(0, 0)
  }

  enterFarmerWalkToCrop(x: number, y: number): void {
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'farmer_to_crop'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  enterFarmerWorking(): void {
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'farmer_working'
    this.nirv.updateAnimation(0, 0)
  }

  enterStockerIdle(): void {
    this.hideStatusIcon()
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'stocker_idle'
    this.nirv.updateAnimation(0, 0)
  }

  enterStockerWalkToStation(x: number, y: number): void {
    this.hideStatusIcon()
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'stocker_to_station'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  enterStockerRestocking(): void {
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'stocker_restocking'
    this.snackBubblePhase = 0
    this.showStatusIcon()
    this.nirv.updateAnimation(0, 0)
  }

  /** Hunger/thirst critical path: leave kitchen job and release stove reservation via GameScene listener. */
  abortRestaurantStaffDuty(): void {
    if (!isRestaurantStaffState(this._state)) return
    this.staffCarriedRecipeId = null
    this.hideStatusIcon()
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this._state = 'walking'
    this.nirv.sprite.setVelocity(0, 0)
    this.nirv.updateAnimation(0, 0)
    this.scene.events.emit('restaurant-staff-abort', this)
    this.computePathToWaypoint()
  }

  abortFarmerDuty(): void {
    if (!isFarmerState(this._state)) return
    this.hideStatusIcon()
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this._state = 'walking'
    this.nirv.sprite.setVelocity(0, 0)
    this.nirv.updateAnimation(0, 0)
    this.scene.events.emit('farmer-abort', this)
    this.computePathToWaypoint()
  }

  abortStockerDuty(): void {
    if (!isStockerState(this._state)) return
    this.hideStatusIcon()
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this._state = 'walking'
    this.nirv.sprite.setVelocity(0, 0)
    this.nirv.updateAnimation(0, 0)
    this.scene.events.emit('stocker-abort', this)
    this.computePathToWaypoint()
  }

  abortWorkDuty(): void {
    if (isRestaurantStaffState(this._state)) this.abortRestaurantStaffDuty()
    else if (isFarmerState(this._state)) this.abortFarmerDuty()
    else if (isStockerState(this._state)) this.abortStockerDuty()
    else if (this._state === 'walking_to_perform') this.abortStageApproach()
    else if (isPerformerWorkState(this._state)) this.leaveStage()
  }

  /** Start eating food */
  startEating(eatDurationMs: number, recipeColor: number): void {
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'eating'
    this.seatTimer = eatDurationMs
    this.eatingColor = recipeColor
    this.hideStatusIcon()
    this.showStatusIcon()
  }


}
