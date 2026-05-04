// @ts-nocheck
import Phaser from 'phaser'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import { debugLog } from '../debug/DebugLogger'
import { botDebugFields } from '../debug/debugActor'
import { isRedirectPathState } from './botNavigationStates'

const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 12
/** How many no-movement frames before the first stuck recovery attempt. */
const STUCK_FRAME_THRESHOLD = 15
/** Pixels to nudge away from blockers when escaping a corner wedge. */
const CORNER_ESCAPE_PX = 48

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

  private ensureFreshStuckCells(targetKey: string): void {
    if (this.stuckAtCellsTarget !== targetKey) {
      this.stuckAtCells = []
      this.stuckAtCellsTarget = targetKey
    }
  }

  private pushStuckCell(c: { gx: number; gy: number }): void {
    if (!this.stuckAtCells) this.stuckAtCells = []
    const key = `${c.gx},${c.gy}`
    if (!this.stuckAtCells.some((x: any) => `${x.gx},${x.gy}` === key)) {
      this.stuckAtCells.push({ gx: c.gx, gy: c.gy })
      if (this.stuckAtCells.length > 8) this.stuckAtCells.shift()
    }
  }

  /** Records bot position + the current path node (the cell that couldn't be reached). */
  private recordStuckAtNode(): void {
    const sprite = this.nirv.sprite
    const sg = screenToGrid(sprite.x, sprite.y)
    this.pushStuckCell({ gx: Math.round(sg.gx), gy: Math.round(sg.gy) })
    if (this.pathNodeIndex < this.path.length) {
      this.pushStuckCell(this.path[this.pathNodeIndex])
    }
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
      this.recordStuckAtNode()
      debugLog.log('nirv.path_stuck', {
        ...botDebugFields(this),
        reason: 'no_movement',
        stuckRecoveries: this.stuckRecoveries,
        pathNodeIndex: this.pathNodeIndex,
      }, 'warn')

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
      this.recordStuckAtNode()
      debugLog.log('nirv.path_stuck', {
        ...botDebugFields(this),
        reason: 'no_progress',
        pathNodeIndex: this.pathNodeIndex,
        nodeDistance: dist,
      }, 'warn')
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
    debugLog.log('nirv.path_unreachable', {
      ...botDebugFields(this),
      pathFailed: this.pathFailed,
      pathNodeIndex: this.pathNodeIndex,
      pathLength: this.path.length,
    }, 'warn')
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
      debugLog.log('nirv.path_recovery', {
        ...botDebugFields(this),
        method: 'nudge',
        fromGX: gx,
        fromGY: gy,
        toX: Math.round(tx * 100) / 100,
        toY: Math.round(ty * 100) / 100,
      }, 'warn')
    } else {
      const free = !this.pathfinder.isBlocked(gx, gy)
        ? { gx, gy }
        : this.pathfinder.findNearestUnblocked(gx, gy, 8)
      if (free) {
        const px = gridToScreen(free.gx, free.gy)
        if (body && typeof body.reset === 'function') body.reset(px.x, px.y)
        else { sprite.x = px.x; sprite.y = px.y; sprite.setVelocity(0, 0) }
        debugLog.log('nirv.path_recovery', {
          ...botDebugFields(this),
          method: 'nearest_unblocked',
          fromGX: gx,
          fromGY: gy,
          toGX: free.gx,
          toGY: free.gy,
        }, 'warn')
      } else {
        sprite.setVelocity(0, 0)
        debugLog.log('nirv.path_recovery_failed', {
          ...botDebugFields(this),
          fromGX: gx,
          fromGY: gy,
        }, 'error')
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
