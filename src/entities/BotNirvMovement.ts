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

export function installBotNirvMovement(target: any): void { installMethods(target, BotNirvMovementMethods) }

class BotNirvMovementMethods {
  /** A* toward a station tile; when `interior` is set, goal is clamped inside the building footprint first. */
  private startRestaurantStaffWalk(screenX: number, screenY: number, interior: StageInteriorBounds | null): void {
    if (!interior) {
      this.restaurantInteriorBounds = null
      this.computePathToPixel(screenX, screenY)
      return
    }
    this.restaurantInteriorBounds = interior
    const g = screenToGrid(screenX, screenY)
    const endCell = { gx: Math.round(g.gx), gy: Math.round(g.gy) }
    this.computePathToPixel(screenX, screenY, endCell)
    if (this.path.length > 0) return
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = { x: screenX, y: screenY }
    this.computePathToPixel(screenX, screenY)
  }

  private computePathToWaypoint(): void {
    const target = this.waypoints[this.currentIndex]
    const sprite = this.nirv.sprite
    const start = screenToGrid(sprite.x, sprite.y)
    this.path = this.pathfinder.findPath(Math.round(start.gx), Math.round(start.gy), target.gridX, target.gridY) ?? []
    this.pathNodeIndex = 0
  }

  private computePathToPixel(
    px: number,
    py: number,
    endCell: { gx: number; gy: number } | null = null,
  ): void {
    const sprite = this.nirv.sprite
    const start = screenToGrid(sprite.x, sprite.y)
    let endGX: number
    let endGY: number

    if (endCell && this.restaurantInteriorBounds) {
      const r = this.pathfinder.resolveGoalInsideRect(
        endCell.gx, endCell.gy, this.restaurantInteriorBounds,
      )
      if (!r) {
        this.path = []
        this.pathNodeIndex = 0
        return
      }
      this.pathEndCell = r
      this.redirectTarget = gridToScreen(r.gx, r.gy)
      endGX = r.gx
      endGY = r.gy
    } else if (endCell && this.performInterior) {
      const r = this.pathfinder.resolveStagePerformGoal(
        endCell.gx, endCell.gy, this.performInterior,
      )
      if (!r) {
        this.path = []
        this.pathNodeIndex = 0
        return
      }
      this.pathEndCell = r
      this.redirectTarget = gridToScreen(r.gx, r.gy)
      endGX = r.gx
      endGY = r.gy
    } else if (endCell) {
      this.pathEndCell = endCell
      endGX = endCell.gx
      endGY = endCell.gy
    } else {
      this.pathEndCell = null
      const end = screenToGrid(px, py)
      endGX = Math.round(end.gx)
      endGY = Math.round(end.gy)
    }

    this.path = this.pathfinder.findPath(
      Math.round(start.gx),
      Math.round(start.gy),
      endGX,
      endGY,
    ) ?? []
    this.pathNodeIndex = 0
  }

  private followPath(): void {
    const sprite = this.nirv.sprite

    // Stuck detection: if barely moved, try recovery
    const moved = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.prevX, this.prevY)
    if (moved < 1) {
      this.stuckFrames++
    } else {
      this.stuckFrames = 0
    }
    this.prevX = sprite.x
    this.prevY = sprite.y

    if (this.stuckFrames > 15 && this.pathNodeIndex < this.path.length) {
      // Skip current node
      this.pathNodeIndex++
      this.stuckFrames = 0
    }
    if (this.stuckFrames > 45) {
      // Stuck too long — recompute entire path from current position
      this.stuckFrames = 0
      if (this._state === 'walking') {
        this.computePathToWaypoint()
      } else if ((isHouseState(this._state) || this._state === 'walking_to_chair' || this._state === 'walking_to_water' || this._state === 'walking_to_water_queue' || this._state === 'walking_to_toilet' || this._state === 'walking_to_toilet_queue' || this._state === 'walking_to_snack' || this._state === 'walking_to_snack_queue' || this._state === 'snack_wander' || this._state === 'walking_to_fruit' || this._state === 'walking_to_fruit_queue' || this._state === 'fruit_wander' || this._state === 'walking_to_bed' || this._state === 'walking_to_stage' || this._state === 'walking_to_perform' || this._state === 'chef_to_stove' || this._state === 'chef_to_counter' || this._state === 'waiter_to_counter' || this._state === 'waiter_to_table' || this._state === 'waiter_returning_plate' || this._state === 'farmer_to_crop' || this._state === 'stocker_to_station') && this.redirectTarget) {
        this.computePathToPixel(this.redirectTarget.x, this.redirectTarget.y, this.pathEndCell)
      }
    }

    if (this.pathNodeIndex >= this.path.length) {
      // Path exhausted — move directly toward final destination
      if (this._state === 'walking') {
        const target = this.waypoints[this.currentIndex]
        const dest = gridToScreen(target.gridX, target.gridY)
        this.moveToward(dest.x, dest.y)
      } else if ((isHouseState(this._state) || this._state === 'walking_to_chair' || this._state === 'walking_to_water' || this._state === 'walking_to_water_queue' || this._state === 'walking_to_toilet' || this._state === 'walking_to_toilet_queue' || this._state === 'walking_to_snack' || this._state === 'walking_to_snack_queue' || this._state === 'snack_wander' || this._state === 'walking_to_fruit' || this._state === 'walking_to_fruit_queue' || this._state === 'fruit_wander' || this._state === 'walking_to_bed' || this._state === 'walking_to_stage' || this._state === 'walking_to_perform' || this._state === 'chef_to_stove' || this._state === 'chef_to_counter' || this._state === 'waiter_to_counter' || this._state === 'waiter_to_table' || this._state === 'waiter_returning_plate' || this._state === 'farmer_to_crop' || this._state === 'stocker_to_station') && this.redirectTarget) {
        this.moveToward(this.redirectTarget.x, this.redirectTarget.y)
      }
      return
    }

    const node = this.path[this.pathNodeIndex]
    const nodePx = gridToScreen(node.gx, node.gy)
    const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, nodePx.x, nodePx.y)

    if (dist < ARRIVAL_THRESHOLD) {
      this.pathNodeIndex++
      this.stuckFrames = 0
      this.followPath()
      return
    }

    this.moveToward(nodePx.x, nodePx.y)
  }

  private moveToward(tx: number, ty: number): void {
    const sprite = this.nirv.sprite
    const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, tx, ty)
    sprite.setVelocity(Math.cos(angle) * BOT_SPEED, Math.sin(angle) * BOT_SPEED)
  }


}
