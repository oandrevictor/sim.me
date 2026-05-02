// @ts-nocheck
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import type { StageInteriorBounds } from '../pathfinding/GridPathfinder'
import { debugLog } from '../debug/DebugLogger'
import { botDebugFields } from '../debug/debugActor'
import { isRedirectPathState } from './botNavigationStates'

function installMethods(target: any, source: any): void {
  for (const name of Object.getOwnPropertyNames(source.prototype)) {
    if (name === 'constructor') continue
    Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
  }
}

export function installBotNirvPathPlanning(target: any): void { installMethods(target, BotNirvPathPlanningMethods) }

class BotNirvPathPlanningMethods {
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
    debugLog.log('nirv.path_staff_fallback', {
      ...botDebugFields(this),
      targetX: round(screenX),
      targetY: round(screenY),
      requestedEndGX: endCell.gx,
      requestedEndGY: endCell.gy,
    }, 'warn')
    this.restaurantInteriorBounds = null
    this.pathEndCell = null
    this.redirectTarget = { x: screenX, y: screenY }
    this.computePathToPixel(screenX, screenY)
  }

  private computePathToWaypoint(): void {
    const target = this.waypoints[this.currentIndex]
    this.ensureFreshStuckCells(`${target.gridX},${target.gridY}`)
    const sprite = this.nirv.sprite
    const start = screenToGrid(sprite.x, sprite.y)
    const startGX = Math.round(start.gx)
    const startGY = Math.round(start.gy)
    this.pathEndCell = null
    debugLog.log('nirv.path_attempt', {
      ...botDebugFields(this),
      mode: 'waypoint',
      fromGX: startGX,
      fromGY: startGY,
      toGX: target.gridX,
      toGY: target.gridY,
      waypointIndex: this.currentIndex,
    })
    const result = this.pathfinder.findPathResult(startGX, startGY, target.gridX, target.gridY)
    this.path = result?.path ?? []
    this.pathResolvedEndCell = result?.end ?? null
    this.pathFailed = result === null
    this.pathNodeIndex = 0
    this.logPathResult('waypoint', startGX, startGY, target.gridX, target.gridY, result)
  }

  private computePathToPixel(
    px: number,
    py: number,
    endCell: { gx: number; gy: number } | null = null,
  ): void {
    const sprite = this.nirv.sprite
    const start = screenToGrid(sprite.x, sprite.y)
    const startGX = Math.round(start.gx)
    const startGY = Math.round(start.gy)
    let endGX: number
    let endGY: number

    if (endCell && this.restaurantInteriorBounds) {
      const r = this.pathfinder.resolveGoalInsideRect(endCell.gx, endCell.gy, this.restaurantInteriorBounds)
      if (!r) {
        this.failPathResolution('restaurant_goal_resolution_failed', startGX, startGY, endCell, px, py)
        return
      }
      this.pathEndCell = r
      this.redirectTarget = gridToScreen(r.gx, r.gy)
      endGX = r.gx
      endGY = r.gy
    } else if (endCell && this.performInterior) {
      const r = this.pathfinder.resolveStagePerformGoal(endCell.gx, endCell.gy, this.performInterior)
      if (!r) {
        this.failPathResolution('stage_goal_resolution_failed', startGX, startGY, endCell, px, py)
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

    this.ensureFreshStuckCells(`${endGX},${endGY}`)
    debugLog.log('nirv.path_attempt', {
      ...botDebugFields(this),
      mode: 'pixel',
      fromGX: startGX,
      fromGY: startGY,
      toGX: endGX,
      toGY: endGY,
      targetX: round(px),
      targetY: round(py),
      requestedEndGX: endCell?.gx,
      requestedEndGY: endCell?.gy,
    })
    const result = this.pathfinder.findPathResult(startGX, startGY, endGX, endGY)
    this.path = result?.path ?? []
    this.pathResolvedEndCell = result?.end ?? null
    this.pathFailed = result === null
    this.pathNodeIndex = 0
    this.logPathResult('pixel', startGX, startGY, endGX, endGY, result)
  }

  private recomputeActivePath(): void {
    this.lastNodeDist = null
    this.noProgressFrames = 0
    debugLog.log('nirv.path_recompute', botDebugFields(this))
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
    return this.pathResolvedEndCell.gx === end.gx && this.pathResolvedEndCell.gy === end.gy
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

  private failPathResolution(
    reason: string,
    startGX: number,
    startGY: number,
    endCell: { gx: number; gy: number },
    px: number,
    py: number,
  ): void {
    this.path = []
    this.pathFailed = true
    this.pathResolvedEndCell = null
    this.pathNodeIndex = 0
    debugLog.log('nirv.path_result', {
      ...botDebugFields(this),
      mode: 'pixel',
      success: false,
      reason,
      fromGX: startGX,
      fromGY: startGY,
      toGX: endCell.gx,
      toGY: endCell.gy,
      targetX: round(px),
      targetY: round(py),
    }, 'warn')
  }

  private logPathResult(
    mode: string,
    startGX: number,
    startGY: number,
    endGX: number,
    endGY: number,
    result: { path: { gx: number; gy: number }[]; end: { gx: number; gy: number } } | null,
  ): void {
    debugLog.log('nirv.path_result', {
      ...botDebugFields(this),
      mode,
      success: result !== null,
      fromGX: startGX,
      fromGY: startGY,
      toGX: endGX,
      toGY: endGY,
      resolvedEndGX: result?.end.gx,
      resolvedEndGY: result?.end.gy,
      pathLength: result?.path.length ?? 0,
    }, result ? 'debug' : 'warn')
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
