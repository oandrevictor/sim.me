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
export function installBotNirvNeedActions(target: any): void { installMethods(target, BotNirvNeedActionMethods) }
class BotNirvNeedActionMethods {
  redirectToStage(x: number, y: number, stageId: string): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this.stageId = stageId
    this._state = 'walking_to_stage'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  redirectToPerformSpot(
    x: number,
    y: number,
    stageId: string,
    pathEndCell: { gx: number; gy: number },
    stageInterior: StageInteriorBounds,
  ): void {
    this.performInterior = stageInterior
    this.pathEndCell = pathEndCell
    this.redirectTarget = { x, y }
    this.stageId = stageId
    this._state = 'walking_to_perform'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y, pathEndCell)
  }
  setStageWatchAffinity(affinity: number): void {
    this.stageWatchAffinity = affinity
  }
  setStageWatchInterestMatch(match: boolean): void {
    this.watchInterestMatch = match
    this.funWatchAccumMs = 0
  }
  leaveStage(): void {
    this._state = 'walking'
    this.stageId = null
    this.redirectTarget = null
    this.pathEndCell = null
    this.performInterior = null
    this.path = []
    this.stageEarlyLeaveAccum = 0
    this.watchInterestMatch = false
    this.funWatchAccumMs = 0
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
    this.computePathToWaypoint()
  }
  redirectToBed(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_bed'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  arriveAtBed(bedX: number, bedY: number, bedRotation: 0 | 1): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this._state = 'sleeping'
    this.nirv.snapToBedSleepPose(bedX, bedY, bedRotation)
    this.showStatusIcon()
  }
  cancelSleep(): void {
    if (this._state !== 'walking_to_bed' && this._state !== 'sleeping') return
    if (this._state === 'sleeping') this.nirv.setLyingDown(false)
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.performInterior = null
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
  finishSleeping(): void {
    this.nirv.setLyingDown(false)
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
  redirectToHouseDoor(
    x: number,
    y: number,
    houseId: string,
    mode: 'claim' | 'owner' | 'visitor',
    hostBotId: string | null = null,
  ): void {
    this.performInterior = null
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this.houseId = houseId
    this.houseMode = mode
    this.houseHostBotId = hostBotId
    this._state = 'walking_to_house_door'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  startRingingHouse(): void {
    if (this._state !== 'walking_to_house_door' || this.houseMode !== 'visitor') return
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.nirv.updateAnimation(0, 0)
    this._state = 'ringing_house'
    this.nirv.showChatBubble('Ding dong')
  }
  redirectIntoHouse(x: number, y: number): void {
    if (!this.houseId || !this.houseMode) return
    this.nirv.hideChatBubble()
    this.redirectTarget = { x, y }
    this._state = 'walking_into_house'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  arriveInsideHouse(): void {
    if (this._state !== 'walking_into_house') return
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.nirv.updateAnimation(0, 0)
    this._state = 'inside_house'
  }
  redirectOutOfHouse(x: number, y: number): void {
    if (this._state !== 'inside_house') return
    this.redirectTarget = { x, y }
    this._state = 'walking_out_of_house'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  finishHouseFlow(): void {
    if (!isHouseState(this._state)) return
    this.nirv.hideChatBubble()
    this.houseId = null
    this.houseMode = null
    this.houseHostBotId = null
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'walking'
    this.computePathToWaypoint()
  }
  cancelHouseFlow(): void {
    if (!isHouseState(this._state)) return
    this.finishHouseFlow()
  }
  redirectToWater(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_water'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  redirectToWaterQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_water_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  arriveAtWaterQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_water_queue'
  }
  cancelWaterQueue(): void {
    if (
      this._state !== 'walking_to_water' &&
      this._state !== 'drinking_water' &&
      this._state !== 'walking_to_water_queue' &&
      this._state !== 'waiting_at_water_queue'
    ) return
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
  arriveAtWaterStation(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'drinking_water'
    this.seatTimer = 3000
    this.showStatusIcon()
  }
  redirectToToilet(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_toilet'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  redirectToToiletQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_toilet_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  arriveAtToiletQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_toilet_queue'
  }
  cancelToiletQueue(): void {
    if (
      this._state !== 'walking_to_toilet' &&
      this._state !== 'using_toilet' &&
      this._state !== 'walking_to_toilet_queue' &&
      this._state !== 'waiting_at_toilet_queue'
    ) return
    this.hideStatusIcon()
    if (this._state === 'using_toilet') this.nirv.exitToilet()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
  arriveAtToiletStation(stationX: number, stationY: number): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this.hideStatusIcon()
    this._state = 'using_toilet'
    this.seatTimer = 3000
    this.nirv.enterToiletInterior(stationX, stationY)
  }
  abortWalkingToChair(): void {
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.performInterior = null
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'walking'
    this.computePathToWaypoint()
  }
  abortStageApproach(): void {
    this._state = 'walking'
    this.stageId = null
    this.redirectTarget = null
    this.pathEndCell = null
    this.performInterior = null
    this.path = []
    this.stageEarlyLeaveAccum = 0
    this.watchInterestMatch = false
    this.funWatchAccumMs = 0
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
  interruptSeatForHydration(): void {
    this.hideStatusIcon()
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'walking'
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
    this.computePathToWaypoint()
  }
  interruptSeatForFood(): void {
    this.hideStatusIcon()
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'walking'
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
    this.computePathToWaypoint()
  }
  redirectToSnack(stationX: number, stationY: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.satiationAnchor = { x: stationX, y: stationY }
    this.redirectTarget = { x: stationX, y: stationY }
    this._state = 'walking_to_snack'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(stationX, stationY)
  }
  redirectToSnackQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_snack_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }
  arriveAtSnackQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_snack_queue'
  }
  cancelSatiationQueue(): void {
    if (
      this._state !== 'walking_to_snack' &&
      this._state !== 'snack_interact' &&
      this._state !== 'snack_wander' &&
      this._state !== 'snack_eat' &&
      this._state !== 'walking_to_snack_queue' &&
      this._state !== 'waiting_at_snack_queue' &&
      this._state !== 'walking_to_fruit' &&
      this._state !== 'fruit_interact' &&
      this._state !== 'fruit_wander' &&
      this._state !== 'fruit_eat' &&
      this._state !== 'walking_to_fruit_queue' &&
      this._state !== 'waiting_at_fruit_queue'
    ) {
      return
    }
    this.hideStatusIcon()
    this.satiationAnchor = null
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
}
