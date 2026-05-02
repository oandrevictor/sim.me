import type { WallSide } from '../storage/wallPersistence'
import { getGridRect } from '../utils/isoGrid'
import { AStarSearch } from './AStarSearch'
import { NavMesh } from './NavMesh'

const PREFERRED_CELL_COST = 0.65

/** Stage platform tile range — used so blocked perform goals re-home inside the deck, not in front of it */
export type StageInteriorBounds = {
  minGX: number
  maxGX: number
  minGY: number
  maxGY: number
}

export interface GridPathResult {
  path: { gx: number; gy: number }[]
  end: { gx: number; gy: number }
}

export class GridPathfinder {
  private blocked: boolean[][]
  /** Per-cell wall sides: key = "nx,ny", value = set of sides with walls. */
  private cellWalls = new Map<string, Set<WallSide>>()
  private preferredCells = new Set<string>()
  private cols: number
  private rows: number
  private astar: AStarSearch
  private navMesh: NavMesh | null = null

  /** Cols / rows are in NAV-grid units (16 px cells). */
  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.blocked = Array.from({ length: cols }, () => Array(rows).fill(false))
    this.astar = new AStarSearch(
      this.blocked,
      cols,
      rows,
      this.cellWalls,
      (gx, gy) => this.cellCost(gx, gy),
      PREFERRED_CELL_COST,
    )
  }

  // -------------------------------------------------------------------
  //  Low-level nav-cell API
  // -------------------------------------------------------------------

  blockCell(nx: number, ny: number): void {
    if (this.inBounds(nx, ny)) this.blocked[nx][ny] = true
  }

  unblockCell(nx: number, ny: number): void {
    if (this.inBounds(nx, ny)) this.blocked[nx][ny] = false
  }

  isBlocked(nx: number, ny: number): boolean {
    if (!this.inBounds(nx, ny)) return true
    return this.blocked[nx][ny]
  }

  preferCell(nx: number, ny: number): void {
    if (this.inBounds(nx, ny)) this.preferredCells.add(this.key(nx, ny))
  }

  unpreferCell(nx: number, ny: number): void {
    this.preferredCells.delete(this.key(nx, ny))
  }

  isPreferredCell(nx: number, ny: number): boolean {
    return this.preferredCells.has(this.key(nx, ny))
  }

  // -------------------------------------------------------------------
  //  World-cell helpers (64 px → block/unblock the 4×4 nav cells)
  // -------------------------------------------------------------------

  /** @deprecated Alias — world grid = nav grid. Use blockCell. */
  blockWorldCell(gx: number, gy: number): void { this.blockCell(gx, gy) }
  /** @deprecated Alias — world grid = nav grid. Use unblockCell. */
  unblockWorldCell(gx: number, gy: number): void { this.unblockCell(gx, gy) }

  /** Block an NxN rect of cells centered on a position. */
  blockNavRect(centerNX: number, centerNY: number, halfW: number, halfH: number): void {
    for (let dx = -halfW; dx <= halfW; dx++) {
      for (let dy = -halfH; dy <= halfH; dy++) {
        this.blockCell(centerNX + dx, centerNY + dy)
      }
    }
  }

  unblockNavRect(centerNX: number, centerNY: number, halfW: number, halfH: number): void {
    for (let dx = -halfW; dx <= halfW; dx++) {
      for (let dy = -halfH; dy <= halfH; dy++) {
        this.unblockCell(centerNX + dx, centerNY + dy)
      }
    }
  }

  // -------------------------------------------------------------------
  //  Cell-wall API (replaces edge-based blocking)
  //  Wall coords are in NAV-grid units.
  // -------------------------------------------------------------------

  addCellWall(nx: number, ny: number, side: WallSide): void {
    const key = this.key(nx, ny)
    let set = this.cellWalls.get(key)
    if (!set) { set = new Set(); this.cellWalls.set(key, set) }
    set.add(side)
  }

  removeCellWall(nx: number, ny: number, side: WallSide): void {
    const set = this.cellWalls.get(this.key(nx, ny))
    if (set) {
      set.delete(side)
      if (set.size === 0) this.cellWalls.delete(this.key(nx, ny))
    }
  }

  hasCellWall(nx: number, ny: number, side: WallSide): boolean {
    return this.cellWalls.get(this.key(nx, ny))?.has(side) ?? false
  }

  /** @deprecated Alias — use addCellWall. */
  addWorldWall(gx: number, gy: number, side: WallSide): void { this.addCellWall(gx, gy, side) }
  /** @deprecated Alias — use removeCellWall. */
  removeWorldWall(gx: number, gy: number, side: WallSide): void { this.removeCellWall(gx, gy, side) }

  // -------------------------------------------------------------------
  //  Goal resolution helpers
  // -------------------------------------------------------------------

  resolveStagePerformGoal(
    goalGX: number,
    goalGY: number,
    interior: StageInteriorBounds,
  ): { gx: number; gy: number } | null {
    if (!this.isBlocked(goalGX, goalGY)) return { gx: goalGX, gy: goalGY }
    const inside = this.nearestUnblockedInRect(goalGX, goalGY, interior)
    if (inside) return inside
    return this.nearestUnblocked(goalGX, goalGY)
  }

  resolveGoalInsideRect(
    goalGX: number,
    goalGY: number,
    interior: StageInteriorBounds,
  ): { gx: number; gy: number } | null {
    const gx = Math.round(goalGX)
    const gy = Math.round(goalGY)
    if (this.inBounds(gx, gy) && !this.isBlocked(gx, gy)) return { gx, gy }
    return this.nearestUnblockedInRect(gx, gy, interior)
  }

  private nearestUnblockedInRect(
    gx: number,
    gy: number,
    b: StageInteriorBounds,
  ): { gx: number; gy: number } | null {
    let best: { gx: number; gy: number; d: number } | null = null
    for (let x = b.minGX; x <= b.maxGX; x++) {
      for (let y = b.minGY; y <= b.maxGY; y++) {
        if (this.isBlocked(x, y)) continue
        const d = Math.abs(x - gx) + Math.abs(y - gy)
        if (!best || d < best.d) best = { gx: x, gy: y, d }
      }
    }
    return best
  }

  // -------------------------------------------------------------------
  //  Pathfinding API
  // -------------------------------------------------------------------

  findPath(
    startNX: number, startNY: number,
    endNX: number, endNY: number,
    maxIterations = 20000,
  ): { gx: number; gy: number }[] | null {
    return this.findPathResult(startNX, startNY, endNX, endNY, maxIterations)?.path ?? null
  }

  findPathResult(
    startNX: number, startNY: number,
    endNX: number, endNY: number,
    maxIterations = 20000,
  ): GridPathResult | null {
    startNX = Math.round(startNX)
    startNY = Math.round(startNY)
    endNX = Math.round(endNX)
    endNY = Math.round(endNY)

    if (!this.inBounds(startNX, startNY)) return null
    if (!this.inBounds(endNX, endNY)) return null

    const los = this.astar.hasLineOfSight.bind(this.astar)
    const hasPreferredCells = this.preferredCells.size > 0

    for (const end of this.goalCandidates(startNX, startNY, endNX, endNY)) {
      if (hasPreferredCells) {
        const weightedPath = this.astar.search(startNX, startNY, end.gx, end.gy, maxIterations)
        if (weightedPath) return { path: weightedPath, end }
      }
      // NavMesh: fast long-range pathfinding via visibility graph
      if (this.navMesh) {
        const navPath = this.navMesh.findPath(startNX, startNY, end.gx, end.gy, los)
        if (navPath) return { path: navPath, end }
      }
      // Grid A* fallback: handles short/indoor paths and cases NavMesh can't resolve
      const gridPath = this.astar.search(startNX, startNY, end.gx, end.gy, maxIterations)
      if (gridPath) {
        const full = [{ gx: startNX, gy: startNY }, ...gridPath]
        const smoothed = hasPreferredCells ? full : this.astar.smoothPath(full)
        smoothed.shift()
        return { path: smoothed, end }
      }
    }
    return null
  }

  /**
   * Rebuild the visibility-graph NavMesh from the current blocked grid.
   * Pass door-threshold cells (or other key waypoints) as `extra` so
   * narrow building entrances are included in the graph.
   */
  rebuildNavMesh(extra: { gx: number; gy: number }[] = []): void {
    const los = this.astar.hasLineOfSight.bind(this.astar)
    const mesh = new NavMesh()
    mesh.build(this.blocked, this.cols, this.rows, los, extra)
    this.navMesh = mesh
  }

  findNearestUnblocked(nx: number, ny: number, maxRadius = 16): { gx: number; gy: number } | null {
    return this.nearestUnblocked(nx, ny, maxRadius)
  }

  private nearestUnblocked(gx: number, gy: number, maxRadius = 8): { gx: number; gy: number } | null {
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          const nx = gx + dx
          const ny = gy + dy
          if (this.inBounds(nx, ny) && !this.blocked[nx][ny]) return { gx: nx, gy: ny }
        }
      }
    }
    return null
  }

  private goalCandidates(
    startGX: number,
    startGY: number,
    endGX: number,
    endGY: number,
  ): { gx: number; gy: number }[] {
    const out: { gx: number; gy: number }[] = []
    const seen = new Set<string>()
    const add = (gx: number, gy: number) => {
      if (!this.inBounds(gx, gy) || this.isBlocked(gx, gy)) return
      const key = this.key(gx, gy)
      if (seen.has(key)) return
      seen.add(key)
      out.push({ gx, gy })
    }
    add(endGX, endGY)
    for (let r = 1; r <= 24; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          add(endGX + dx, endGY + dy)
        }
      }
    }
    out.sort((a, b) => {
      const ad = Math.abs(a.gx - endGX) + Math.abs(a.gy - endGY)
      const bd = Math.abs(b.gx - endGX) + Math.abs(b.gy - endGY)
      if (ad !== bd) return ad - bd
      const as = Math.abs(a.gx - startGX) + Math.abs(a.gy - startGY)
      const bs = Math.abs(b.gx - startGX) + Math.abs(b.gy - startGY)
      return as - bs
    })
    return out
  }

  debugDraw(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear()
    graphics.fillStyle(0xff0000, 0.4)
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        if (this.blocked[x][y]) {
          const rect = getGridRect(x, y)
          graphics.fillRect(rect.x, rect.y, rect.width, rect.height)
        }
      }
    }
    graphics.lineStyle(2, 0xffaa00, 0.8)
    for (const [key, sides] of this.cellWalls.entries()) {
      const [sx, sy] = key.split(',').map(Number)
      const rect = getGridRect(sx, sy)
      if (sides.has('n')) graphics.lineBetween(rect.x, rect.y, rect.x + rect.width, rect.y)
      if (sides.has('s')) graphics.lineBetween(rect.x, rect.y + rect.height, rect.x + rect.width, rect.y + rect.height)
      if (sides.has('e')) graphics.lineBetween(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height)
      if (sides.has('w')) graphics.lineBetween(rect.x, rect.y, rect.x, rect.y + rect.height)
    }
  }

  private inBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gy >= 0 && gx < this.cols && gy < this.rows
  }

  private cellCost(gx: number, gy: number): number {
    return this.isPreferredCell(gx, gy) ? PREFERRED_CELL_COST : 1
  }

  private key(gx: number, gy: number): string { return `${gx},${gy}` }
}
