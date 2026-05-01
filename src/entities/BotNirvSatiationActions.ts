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

export function installBotNirvSatiationActions(target: any): void { installMethods(target, BotNirvSatiationActionMethods) }

class BotNirvSatiationActionMethods {
  private finishDrinkingWater(): void {
    this.nirv.addHydration(30)
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  private finishUsingToilet(): void {
    this.nirv.resetBladderAfterUse()
    this.nirv.exitToilet()
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  private beginSatiationWander(): void {
    if (!this.satiationAnchor) {
      this.abortSatiationMidFlow()
      return
    }
    this.hideStatusIcon()
    const sx = this.satiationAnchor.x
    const sy = this.satiationAnchor.y
    const tx = sx + Phaser.Math.Between(-70, 70)
    const ty = sy + Phaser.Math.Between(45, 110)
    this.redirectTarget = { x: tx, y: ty }
    if (this._state === 'snack_interact') this._state = 'snack_wander'
    else if (this._state === 'fruit_interact') this._state = 'fruit_wander'
    this.computePathToPixel(tx, ty)
  }

  private finishSatiationEating(): void {
    this.nirv.addSatiation(20)
    this.hideStatusIcon()
    this.satiationAnchor = null
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  /** Satiation flow broke (no station ref); no reward. */
  private abortSatiationMidFlow(): void {
    this.hideStatusIcon()
    this.satiationAnchor = null
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
}
