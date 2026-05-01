// @ts-nocheck
import Phaser from 'phaser'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import { rollLeaveEarly } from '../systems/stageAffinity'
import { DEPTH_UI } from '../config/world'
import { EARLY_LEAVE_CHECK_INTERVAL_MS } from '../systems/stagePerformanceRuntime'
import { fruitSlotWorldPosition } from '../systems/fruitCrateLayout'
import { isFarmerState, isHouseState, isRestaurantStaffState, isStockerState } from './botStates'
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
export function installBotNirvFoodActions(target: any): void { installMethods(target, BotNirvFoodActionMethods) }
class BotNirvFoodActionMethods {
  redirectToFruit(stationX: number, stationY: number, slotIndex: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.satiationAnchor = { x: stationX, y: stationY }
    const p = fruitSlotWorldPosition(stationX, stationY, slotIndex)
    this.redirectTarget = { x: p.x, y: p.y }
    this._state = 'walking_to_fruit'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(p.x, p.y)
  }
  redirectToFruitQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_fruit_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  arriveAtFruitQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_fruit_queue'
  }
  arriveAtFruitStation(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'fruit_interact'
    this.seatTimer = Phaser.Math.Between(1000, 2000)
    this.showStatusIcon()
  }
  arriveAtSnackStation(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'snack_interact'
    this.seatTimer = Phaser.Math.Between(1000, 2000)
    this.showStatusIcon()
  }
  redirectToChair(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_chair'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  seat(nextToTable: boolean): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.seatTimer = Phaser.Math.Between(5000, 10000)
    this.redirectTarget = null
    this.path = []
    if (nextToTable) {
      this._state = 'awaiting_service'
      this.showStatusIcon()
    } else {
      this._state = 'seated'
    }
  }
  unseat(): void {
    this._state = 'walking'
    this.hideStatusIcon()
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
    this.computePathToWaypoint()
  }
  getStaffCarriedRecipeId(): string | null {
    return this.staffCarriedRecipeId
  }
  setStaffCarriedRecipeId(id: string | null): void {
    this.staffCarriedRecipeId = id
  }
}
