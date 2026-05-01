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
export function installBotNirvUpdate(target: any): void { installMethods(target, BotNirvUpdateMethods) }
class BotNirvUpdateMethods {
  update(delta: number): void {
    switch (this._state) {
      case 'waiting':
        this.waitRemaining -= delta
        this.nirv.updateAnimation(0, 0)
        if (this.waitRemaining <= 0) {
          this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
          this._state = 'walking'
          this.computePathToWaypoint()
        }
        return
      case 'walking': {
        const target = this.waypoints[this.currentIndex]
        const dest = gridToScreen(target.gridX, target.gridY)
        this.followPath()
        const sprite = this.nirv.sprite
        this.nirv.updateAnimation(sprite.body!.velocity.x, sprite.body!.velocity.y)
        const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, dest.x, dest.y)
        if (dist < ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this._state = 'waiting'
          this.waitRemaining = target.duration
          this.path = []
        }
        return
      }
      case 'walking_to_chair': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const sprite = this.nirv.sprite
        this.nirv.updateAnimation(sprite.body!.velocity.x, sprite.body!.velocity.y)
        const dist = Phaser.Math.Distance.Between(
          sprite.x, sprite.y,
          this.redirectTarget.x, this.redirectTarget.y
        )
        if (dist < CHAIR_ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          sprite.setPosition(this.redirectTarget.x, this.redirectTarget.y)
          this.nirv.updateAnimation(0, 0)
          this.path = []
        }
        return
      }
      case 'walking_to_water': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const wSprite = this.nirv.sprite
        this.nirv.updateAnimation(wSprite.body!.velocity.x, wSprite.body!.velocity.y)
        return
      }
      case 'walking_to_bed': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const bedSprite = this.nirv.sprite
        this.nirv.updateAnimation(bedSprite.body!.velocity.x, bedSprite.body!.velocity.y)
        return
      }
      case 'walking_to_house_door':
      case 'walking_into_house':
      case 'walking_out_of_house': {
        if (!this.redirectTarget) {
          this.finishHouseFlow()
          return
        }
        this.followPath()
        const houseSprite = this.nirv.sprite
        this.nirv.updateAnimation(houseSprite.body!.velocity.x, houseSprite.body!.velocity.y)
        return
      }
      case 'ringing_house':
        this.nirv.updateAnimation(0, 0)
        this.nirv.syncChatBubblePosition()
        return
      case 'inside_house':
        this.nirv.updateAnimation(0, 0)
        return
      case 'sleeping':
        this.nirv.updateAnimation(0, 0)
        this.updateStatusIconPosition()
        return
      case 'walking_to_water_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const qSprite = this.nirv.sprite
        this.nirv.updateAnimation(qSprite.body!.velocity.x, qSprite.body!.velocity.y)
        return
      }
      case 'waiting_at_water_queue':
        this.nirv.updateAnimation(0, 0)
        return
      case 'drinking_water':
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.finishDrinkingWater()
        return
      case 'walking_to_toilet': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const toilSprite = this.nirv.sprite
        this.nirv.updateAnimation(toilSprite.body!.velocity.x, toilSprite.body!.velocity.y)
        return
      }
      case 'walking_to_toilet_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const tqSprite = this.nirv.sprite
        this.nirv.updateAnimation(tqSprite.body!.velocity.x, tqSprite.body!.velocity.y)
        return
      }
      case 'waiting_at_toilet_queue':
        this.nirv.updateAnimation(0, 0)
        return
      case 'using_toilet':
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        if (this.seatTimer <= 0) this.finishUsingToilet()
        return
      case 'walking_to_snack': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const snSprite = this.nirv.sprite
        this.nirv.updateAnimation(snSprite.body!.velocity.x, snSprite.body!.velocity.y)
        return
      }
      case 'walking_to_snack_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const sqSprite = this.nirv.sprite
        this.nirv.updateAnimation(sqSprite.body!.velocity.x, sqSprite.body!.velocity.y)
        return
      }
      case 'waiting_at_snack_queue':
        this.nirv.updateAnimation(0, 0)
        return
      case 'snack_interact':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.beginSatiationWander()
        return
      case 'fruit_interact':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.beginSatiationWander()
        return
      case 'walking_to_fruit': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const frSprite = this.nirv.sprite
        this.nirv.updateAnimation(frSprite.body!.velocity.x, frSprite.body!.velocity.y)
        return
      }
      case 'walking_to_fruit_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const fqSprite = this.nirv.sprite
        this.nirv.updateAnimation(fqSprite.body!.velocity.x, fqSprite.body!.velocity.y)
        return
      }
      case 'waiting_at_fruit_queue':
        this.nirv.updateAnimation(0, 0)
        return
      case 'snack_wander': {
        if (!this.redirectTarget) {
          this.abortSatiationMidFlow()
          return
        }
        this.followPath()
        const swSprite = this.nirv.sprite
        this.nirv.updateAnimation(swSprite.body!.velocity.x, swSprite.body!.velocity.y)
        const swd = Phaser.Math.Distance.Between(
          swSprite.x, swSprite.y,
          this.redirectTarget.x, this.redirectTarget.y,
        )
        if (swd < CHAIR_ARRIVAL_THRESHOLD) {
          swSprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          this.redirectTarget = null
          this._state = 'snack_eat'
          this.seatTimer = Phaser.Math.Between(1000, 4000)
          this.eatingColor = 0xcc8844
          this.showStatusIcon()
        }
        return
      }
      case 'fruit_wander': {
        if (!this.redirectTarget) {
          this.abortSatiationMidFlow()
          return
        }
        this.followPath()
        const fwSprite = this.nirv.sprite
        this.nirv.updateAnimation(fwSprite.body!.velocity.x, fwSprite.body!.velocity.y)
        const fwd = Phaser.Math.Distance.Between(
          fwSprite.x, fwSprite.y,
          this.redirectTarget.x, this.redirectTarget.y,
        )
        if (fwd < CHAIR_ARRIVAL_THRESHOLD) {
          fwSprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          this.redirectTarget = null
          this._state = 'fruit_eat'
          this.seatTimer = Phaser.Math.Between(1000, 4000)
          this.eatingColor = 0x66aa44
          this.showStatusIcon()
        }
        return
      }
      case 'snack_eat':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.finishSatiationEating()
        return
      case 'fruit_eat':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.finishSatiationEating()
        return
      case 'seated':
      case 'awaiting_service':
      case 'eating':
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) {
          this.unseat()
        }
        return
      case 'walking_to_stage':
      case 'walking_to_perform': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const sprite = this.nirv.sprite
        this.nirv.updateAnimation(sprite.body!.velocity.x, sprite.body!.velocity.y)
        const dist = Phaser.Math.Distance.Between(
          sprite.x, sprite.y,
          this.redirectTarget.x, this.redirectTarget.y,
        )
        if (dist < ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          if (this._state === 'walking_to_stage') {
            this._state = 'watching_stage'
            this.stageEarlyLeaveAccum = 0
          } else {
            sprite.setPosition(this.redirectTarget.x, this.redirectTarget.y)
            this._state = 'performing_on_stage'
          }
        }
        return
      }
      case 'performing_on_stage':
        this.nirv.updateAnimation(0, 0)
        return
      case 'watching_stage':
        this.nirv.updateAnimation(0, 0)
        this.funWatchAccumMs += delta
        while (this.funWatchAccumMs >= FUN_WATCH_TICK_MS) {
          this.funWatchAccumMs -= FUN_WATCH_TICK_MS
          this.nirv.addFun(this.watchInterestMatch ? FUN_GAIN_MATCH : FUN_GAIN_NO_MATCH)
        }
        this.stageEarlyLeaveAccum += delta
        if (this.stageEarlyLeaveAccum >= EARLY_LEAVE_CHECK_INTERVAL_MS) {
          this.stageEarlyLeaveAccum = 0
          if (rollLeaveEarly(this.stageWatchAffinity)) this.leaveStage()
        }
        return
      case 'chef_idle':
      case 'waiter_idle':
      case 'chef_cooking':
      case 'farmer_idle':
      case 'farmer_working':
      case 'stocker_idle':
        this.nirv.updateAnimation(0, 0)
        return
      case 'stocker_restocking':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.updateStatusIconPosition()
        return
      case 'waiter_returning_plate':
        if (!this.redirectTarget) {
          this.nirv.updateAnimation(0, 0)
          return
        }
      case 'chef_to_stove':
      case 'chef_to_counter':
      case 'waiter_to_counter':
      case 'waiter_to_table':
      case 'farmer_to_crop':
      case 'stocker_to_station': {
        if (!this.redirectTarget) {
          if (this._state === 'chef_to_stove' || this._state === 'chef_to_counter') this.enterChefIdle()
          else if (this._state === 'farmer_to_crop') this.enterFarmerIdle()
          else if (this._state === 'stocker_to_station') this.enterStockerIdle()
          else this.enterWaiterIdle()
          return
        }
        this.followPath()
        const jobSprite = this.nirv.sprite
        this.nirv.updateAnimation(jobSprite.body!.velocity.x, jobSprite.body!.velocity.y)
        const jobDist = Phaser.Math.Distance.Between(
          jobSprite.x, jobSprite.y,
          this.redirectTarget.x, this.redirectTarget.y,
        )
        if (jobDist < ARRIVAL_THRESHOLD) {
          jobSprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this.path = []
        }
        return
      }
    }
  }
}
