// @ts-nocheck
import Phaser from 'phaser'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import { rollLeaveEarly } from '../systems/stageAffinity'
import { DEPTH_UI } from '../config/world'
import { EARLY_LEAVE_CHECK_INTERVAL_MS } from '../systems/stagePerformanceRuntime'
import { fruitSlotWorldPosition } from '../systems/fruitCrateLayout'
import { isRedirectPathState } from './botNavigationStates'

const FUN_WATCH_TICK_MS = 10_000
const FUN_GAIN_MATCH = 10
const FUN_GAIN_NO_MATCH = 5
const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 12
const CHAIR_ARRIVAL_THRESHOLD = 20
/** How many no-movement frames before the first stuck recovery attempt. */
const STUCK_FRAME_THRESHOLD = 15
/** Pixels to nudge away from blockers when escaping a corner wedge. */
const CORNER_ESCAPE_PX = 20

function installMethods(target: any, source: any): void {
  for (const name of Object.getOwnPropertyNames(source.prototype)) {
    if (name === 'constructor') continue
    Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
  }
}

export function installBotNirvMovement(target: any): void { installMethods(target, BotNirvMovementMethods) }

class BotNirvMovementMethods {
  refreshNavigationPath(): void {
    if (this._state !== 'walking' && !isRedirectPathState(this._state)) return
    this.stuckFrames = 0
    this.recomputeActivePath()
  }

  /** A* toward a station tile; when `interior` is set, goal is clamped inside the building footprint first. */
  private startRestaurantStaffWalk(screenX: number, screenY: number, interior: StageInteriorBounds | null): void {
    if (!interior) {
      this.restaurantInteriorBounds = null
      this.computePathToPixel(screenX, screenY)
      return
    }
    this.restaurantInteriorBounds = interior
    const nav = screenToGrid(screenX, screenY)
    const endCell = { gx: Math.round(nav.gx), gy: Math.round(nav.gy) }
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
    this.pathEndCell = null
    // Waypoint coords are world-grid; convert to nav-grid
    const result = this.pathfinder.findPathResult(
      Math.round(start.gx), Math.round(start.gy), target.gridX, target.gridY
    )
    this.path = result?.path ?? []
    this.pathResolvedEndCell = result?.end ?? null
    this.pathFailed = result === null
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
        this.pathFailed = true
        this.pathResolvedEndCell = null
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
        this.pathFailed = true
        this.pathResolvedEndCell = null
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

    const result = this.pathfinder.findPathResult(
      Math.round(start.gx),
      Math.round(start.gy),
      endGX,
      endGY
    )
    this.path = result?.path ?? []
    this.pathResolvedEndCell = result?.end ?? null
    this.pathFailed = result === null
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

    if (this.stuckFrames > STUCK_FRAME_THRESHOLD) {
      this.stuckFrames = 0
      const now = this.scene.time.now
      const recent = this.lastStuckTickMs != null && now - this.lastStuckTickMs < 2000
      this.lastStuckTickMs = now
      this.stuckRecoveries = recent ? (this.stuckRecoveries ?? 0) + 1 : 1
      const body = sprite.body as Phaser.Physics.Arcade.Body | null
      const wedged = !!body && (
        body.blocked.up || body.blocked.down || body.blocked.left || body.blocked.right ||
        body.touching.up || body.touching.down || body.touching.left || body.touching.right
      )
      if (this.stuckRecoveries >= 2 || wedged) {
        this.escapeStuckBlocker()
        return
      }
      this.recomputeActivePath()
      return
    }

    if (this.pathNodeIndex >= this.path.length) {
      if (this.pathFailed || !this.canMoveDirectlyToRequestedTarget()) {
        this.handleUnreachableTarget()
        return
      }
      // Path exhausted — only close the final short leg when the requested cell is reachable or intentionally blocked.
      if (this._state === 'walking') {
        const target = this.waypoints[this.currentIndex]
        const dest = gridToScreen(target.gridX, target.gridY)
        this.moveToward(dest.x, dest.y)
      } else if (isRedirectPathState(this._state) && this.redirectTarget) {
        this.moveToward(this.redirectTarget.x, this.redirectTarget.y)
      }
      return
    }

    // Skip-ahead: if closer to a later node, jump the index forward (physics may have
    // pushed the bot past the current node at a corner).
    this.skipAheadOnPath(sprite)

    const node = this.path[this.pathNodeIndex]
    const nodePx = gridToScreen(node.gx, node.gy)
    const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, nodePx.x, nodePx.y)

    if (dist < ARRIVAL_THRESHOLD) {
      this.pathNodeIndex++
      this.stuckFrames = 0
      this.stuckRecoveries = 0
      this.lastNodeDist = null
      this.noProgressFrames = 0
      this.followPath()
      return
    }

    if (this.lastNodeDist != null && dist >= this.lastNodeDist - 0.5) {
      this.noProgressFrames = (this.noProgressFrames ?? 0) + 1
    } else {
      this.noProgressFrames = 0
    }
    this.lastNodeDist = dist

    if ((this.noProgressFrames ?? 0) > STUCK_FRAME_THRESHOLD) {
      this.noProgressFrames = 0
      this.lastNodeDist = null
      this.escapeStuckBlocker()
      return
    }

    this.moveToward(nodePx.x, nodePx.y)
  }

  private moveToward(tx: number, ty: number): void {
    const sprite = this.nirv.sprite
    const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, tx, ty)
    sprite.setVelocity(Math.cos(angle) * BOT_SPEED, Math.sin(angle) * BOT_SPEED)
  }

  private handleUnreachableTarget(): void {
    const state = this._state
    this.nirv.sprite.setVelocity(0, 0)
    if (state === 'walking') {
      this.finishWalkingAtResolvedFallback()
      return
    }
    if (state === 'walking_to_bed') { this.cancelSleep(); return }
    if (state === 'farmer_to_crop') { this.scene.events.emit('farmer-abort', this); this.enterFarmerIdle(); return }
    if (state === 'stocker_to_station') { this.scene.events.emit('stocker-abort', this); this.enterStockerIdle(); return }
    if (state === 'chef_to_stove' || state === 'chef_to_counter') { this.scene.events.emit('restaurant-staff-abort', this); this.enterChefIdle(); return }
    if (state === 'waiter_to_counter' || state === 'waiter_to_table' || state === 'waiter_returning_plate') { this.scene.events.emit('restaurant-staff-abort', this); this.enterWaiterIdle(); return }
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.pathResolvedEndCell = null
    this._state = 'walking'
    this.computePathToWaypoint()
  }

  private escapeStuckBlocker(): void {
    const sprite = this.nirv.sprite
    const g = screenToGrid(sprite.x, sprite.y)
    const gx = Math.round(g.gx)
    const gy = Math.round(g.gy)

    // Corner-aware nudge: push away from every blocked neighbor (cardinal + diagonal).
    let nudgeX = 0, nudgeY = 0
    const allDirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { dx: 1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 },
    ]
    for (const d of allDirs) {
      if (this.pathfinder.isBlocked(gx + d.dx, gy + d.dy)) {
        const w = (d.dx !== 0 && d.dy !== 0) ? 0.707 : 1
        nudgeX -= d.dx * w
        nudgeY -= d.dy * w
      }
    }
    const body = sprite.body as Phaser.Physics.Arcade.Body | null
    if ((nudgeX !== 0 || nudgeY !== 0) && !this.pathfinder.isBlocked(gx, gy)) {
      const len = Math.sqrt(nudgeX * nudgeX + nudgeY * nudgeY)
      const tx = sprite.x + (nudgeX / len) * CORNER_ESCAPE_PX
      const ty = sprite.y + (nudgeY / len) * CORNER_ESCAPE_PX
      if (body && typeof body.reset === 'function') body.reset(tx, ty)
      else { sprite.x = tx; sprite.y = ty; sprite.setVelocity(0, 0) }
    } else {
      const free = !this.pathfinder.isBlocked(gx, gy)
        ? { gx, gy }
        : this.pathfinder.findNearestUnblocked(gx, gy, 8)
      if (free) {
        const px = gridToScreen(free.gx, free.gy)
        if (body && typeof body.reset === 'function') body.reset(px.x, px.y)
        else { sprite.x = px.x; sprite.y = px.y; sprite.setVelocity(0, 0) }
      } else {
        sprite.setVelocity(0, 0)
      }
    }

    this.stuckFrames = 0
    this.stuckRecoveries = 0
    this.noProgressFrames = 0
    this.lastNodeDist = null
    this.path = []
    this.pathNodeIndex = 0
    this.recomputeActivePath()
  }

  private recomputeActivePath(): void {
    this.lastNodeDist = null
    this.noProgressFrames = 0
    if (this._state === 'walking') {
      this.computePathToWaypoint()
      return
    }
    if (isRedirectPathState(this._state) && this.redirectTarget) {
      this.computePathToPixel(this.redirectTarget.x, this.redirectTarget.y, this.pathEndCell)
      return
    }
    this.nirv.sprite.setVelocity(0, 0)
  }

  private canMoveDirectlyToRequestedTarget(): boolean {
    if (
      this._state === 'walking_to_bed' ||
      this._state === 'farmer_to_crop' ||
      this._state === 'stocker_to_station' ||
      this._state === 'chef_to_stove' ||
      this._state === 'chef_to_counter' ||
      this._state === 'waiter_to_counter' ||
      this._state === 'waiter_to_table' ||
      this._state === 'waiter_returning_plate'
    ) {
      return true
    }
    const end = this.expectedTargetCell()
    if (!end || !this.pathResolvedEndCell) return true
    if (this.pathResolvedEndCell.gx === end.gx && this.pathResolvedEndCell.gy === end.gy) return true
    return false
  }

  private finishWalkingAtResolvedFallback(): void {
    const target = this.waypoints[this.currentIndex]
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting'
    this.waitRemaining = target.duration
    this.path = []
    this.pathNodeIndex = 0
    this.pathEndCell = null
    this.pathResolvedEndCell = null
  }

  private expectedTargetCell(): { gx: number; gy: number } | null {
    if (this.pathEndCell) return this.pathEndCell
    if (this._state === 'walking') {
      const target = this.waypoints[this.currentIndex]
      return { gx: target.gridX, gy: target.gridY }
    }
    if (!this.redirectTarget) return null
    const g = screenToGrid(this.redirectTarget.x, this.redirectTarget.y)
    return { gx: Math.round(g.gx), gy: Math.round(g.gy) }
  }


  /**
   * If the sprite is closer to a later path node than the current one (e.g.
   * after physics pushed it sideways past a corner), skip ahead to avoid
   * backtracking.
   */
  private skipAheadOnPath(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (this.pathNodeIndex + 1 >= this.path.length) return
    const curNode = this.path[this.pathNodeIndex]
    const curPx = gridToScreen(curNode.gx, curNode.gy)
    const curDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, curPx.x, curPx.y)
    // Look up to 3 nodes ahead.
    const lookAhead = Math.min(this.pathNodeIndex + 3, this.path.length - 1)
    for (let i = this.pathNodeIndex + 1; i <= lookAhead; i++) {
      const n = this.path[i]
      const nPx = gridToScreen(n.gx, n.gy)
      const nDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, nPx.x, nPx.y)
      if (nDist < curDist && nDist < ARRIVAL_THRESHOLD * 2) {
        this.pathNodeIndex = i
        return
      }
    }
  }

}
