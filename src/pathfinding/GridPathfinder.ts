import type { WallSide } from '../storage/wallPersistence'
import { getGridRect } from '../utils/isoGrid'

interface Node {
  gx: number
  gy: number
  g: number
  h: number
  f: number
  parent: Node | null
}

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
  private cols: number
  private rows: number

  /** Cols / rows are in NAV-grid units (16 px cells). */
  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.blocked = Array.from({ length: cols }, () => Array(rows).fill(false))
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

  /**
   * If the ideal tile is blocked, pick the closest unblocked tile inside the stage interior
   * (Manhattan). Avoids `nearestUnblocked` ring picking the audience row (gy+1) first.
   */
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

  /** Walk goal clamped inside the rectangle only — avoids routing staff outside a building (cf. resolveStagePerformGoal). */
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
  //  A* pathfinding (all coords in nav-grid units)
  // -------------------------------------------------------------------

  findPath(
    startNX: number, startNY: number,
    endNX: number, endNY: number,
    maxIterations = 4000,
  ): { gx: number; gy: number }[] | null {
    return this.findPathResult(startNX, startNY, endNX, endNY, maxIterations)?.path ?? null
  }

  findPathResult(
    startNX: number, startNY: number,
    endNX: number, endNY: number,
    maxIterations = 4000,
  ): GridPathResult | null {
    startNX = Math.round(startNX)
    startNY = Math.round(startNY)
    endNX = Math.round(endNX)
    endNY = Math.round(endNY)

    if (!this.inBounds(startNX, startNY)) return null
    if (!this.inBounds(endNX, endNY)) return null

    for (const end of this.goalCandidates(startNX, startNY, endNX, endNY)) {
      const path = this.searchPath(startNX, startNY, end.gx, end.gy, maxIterations)
      if (path) {
        const fullPath = [{ gx: startNX, gy: startNY }, ...path]
        const smoothed = this.smoothPath(fullPath)
        smoothed.shift() // Remove start node to maintain API contract
        return { path: smoothed, end }
      }
    }
    return null
  }

  private searchPath(
    startGX: number,
    startGY: number,
    endGX: number,
    endGY: number,
    maxIterations: number,
  ): { gx: number; gy: number }[] | null {
    if (startGX === endGX && startGY === endGY) return []

    const openSet = new Map<string, Node>()
    const closedSet = new Set<string>()

    const startNode: Node = {
      gx: startGX, gy: startGY,
      g: 0,
      h: Math.abs(endGX - startGX) + Math.abs(endGY - startGY),
      f: 0,
      parent: null,
    }
    startNode.f = startNode.g + startNode.h
    const startKey = this.key(startGX, startGY)
    openSet.set(startKey, startNode)

    // 8-directional movement (cardinal + diagonal)
    const dirs = [
      { dx: 0, dy: -1, cost: 1 },
      { dx: 0, dy: 1, cost: 1 },
      { dx: -1, dy: 0, cost: 1 },
      { dx: 1, dy: 0, cost: 1 },
      { dx: -1, dy: -1, cost: 1.414 },
      { dx: 1, dy: -1, cost: 1.414 },
      { dx: -1, dy: 1, cost: 1.414 },
      { dx: 1, dy: 1, cost: 1.414 },
    ]

    let iterations = 0
    while (openSet.size > 0) {
      if (++iterations > maxIterations) return null

      // Find node with lowest f
      let current: Node | null = null
      for (const node of openSet.values()) {
        if (!current || node.f < current.f || (node.f === current.f && node.h < current.h)) {
          current = node
        }
      }
      if (!current) return null

      if (current.gx === endGX && current.gy === endGY) {
        return this.reconstructPath(current)
      }

      openSet.delete(this.key(current.gx, current.gy))
      closedSet.add(this.key(current.gx, current.gy))

      for (const { dx, dy, cost } of dirs) {
        const nx = current.gx + dx
        const ny = current.gy + dy
        const nKey = this.key(nx, ny)

        if (!this.inBounds(nx, ny)) continue
        if (this.blocked[nx][ny]) continue
        if (closedSet.has(nKey)) continue

        // Prevent corner-cutting: both adjacent cardinal cells must be open
        if (dx !== 0 && dy !== 0) {
          if (this.isBlocked(current.gx + dx, current.gy) ||
              this.isBlocked(current.gx, current.gy + dy)) continue
        }

        // Check cell walls block movement
        if (this.isCellWallBlocked(current.gx, current.gy, nx, ny)) continue

        // For diagonal moves, also check both intermediate cardinal steps
        if (dx !== 0 && dy !== 0) {
          if (this.isCellWallBlocked(current.gx, current.gy, current.gx + dx, current.gy) ||
              this.isCellWallBlocked(current.gx, current.gy, current.gx, current.gy + dy)) continue
        }

        const g = current.g + cost
        const existing = openSet.get(nKey)

        if (!existing) {
          // Chebyshev heuristic for 8-directional
          const hdx = Math.abs(endGX - nx)
          const hdy = Math.abs(endGY - ny)
          const h = Math.max(hdx, hdy) + 0.414 * Math.min(hdx, hdy)
          openSet.set(nKey, { gx: nx, gy: ny, g, h, f: g + h, parent: current })
        } else if (g < existing.g) {
          existing.g = g
          existing.f = g + existing.h
          existing.parent = current
        }
      }
    }

    return null
  }

  smoothPath(path: { gx: number; gy: number }[]): { gx: number; gy: number }[] {
    if (path.length <= 2) return path

    const smoothed: { gx: number; gy: number }[] = []
    smoothed.push(path[0])

    let currentIdx = 0
    while (currentIdx < path.length - 1) {
      let furthestVisibleIdx = currentIdx + 1
      for (let i = currentIdx + 2; i < path.length; i++) {
        if (this.hasLineOfSight(path[currentIdx].gx, path[currentIdx].gy, path[i].gx, path[i].gy)) {
          furthestVisibleIdx = i
        } else {
          break
        }
      }
      smoothed.push(path[furthestVisibleIdx])
      currentIdx = furthestVisibleIdx
    }

    return smoothed
  }

  private hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let dx = Math.abs(x1 - x0)
    let dy = Math.abs(y1 - y0)
    let sx = x0 < x1 ? 1 : -1
    let sy = y0 < y1 ? 1 : -1
    let err = dx - dy

    let x = x0
    let y = y0

    while (true) {
      if (this.isBlocked(x, y)) return false
      
      if (x === x1 && y === y1) break

      let e2 = 2 * err
      let nextX = x
      let nextY = y

      if (e2 > -dy) {
        err -= dy
        nextX += sx
      }
      if (e2 < dx) {
        err += dx
        nextY += sy
      }

      // Check corner cutting to match A* movement rules
      if (nextX !== x && nextY !== y) {
        if (this.isBlocked(nextX, y) || this.isBlocked(x, nextY)) return false
        if (this.isCellWallBlocked(x, y, nextX, nextY)) return false
        if (this.isCellWallBlocked(x, y, nextX, y) || this.isCellWallBlocked(x, y, x, nextY)) return false
      } else {
        if (this.isCellWallBlocked(x, y, nextX, nextY)) return false
      }

      x = nextX
      y = nextY
    }

    return true
  }

  /**
   * Check if movement from one cell to an adjacent cell is blocked by a
   * cell-internal wall on either side. Only handles cardinal (dx+dy=1) moves.
   */
  private isCellWallBlocked(fromGX: number, fromGY: number, toGX: number, toGY: number): boolean {
    const dx = toGX - fromGX
    const dy = toGY - fromGY
    if (dx === 1) return this.hasCellWall(fromGX, fromGY, 'e') || this.hasCellWall(toGX, toGY, 'w')
    if (dx === -1) return this.hasCellWall(fromGX, fromGY, 'w') || this.hasCellWall(toGX, toGY, 'e')
    if (dy === 1) return this.hasCellWall(fromGX, fromGY, 's') || this.hasCellWall(toGX, toGY, 'n')
    if (dy === -1) return this.hasCellWall(fromGX, fromGY, 'n') || this.hasCellWall(toGX, toGY, 's')
    return false
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
    // Wider fallback ring for nav grid (each world cell = 4 nav cells)
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
          if (this.inBounds(nx, ny) && !this.blocked[nx][ny]) {
            return { gx: nx, gy: ny }
          }
        }
      }
    }
    return null
  }

  private reconstructPath(node: Node): { gx: number; gy: number }[] {
    const path: { gx: number; gy: number }[] = []
    let current: Node | null = node
    while (current?.parent) {
      path.push({ gx: current.gx, gy: current.gy })
      current = current.parent
    }
    path.reverse()
    return path
  }

  debugDraw(graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear()
    
    // draw full blocks
    graphics.fillStyle(0xff0000, 0.4)
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        if (this.blocked[x][y]) {
          const rect = getGridRect(x, y)
          graphics.fillRect(rect.x, rect.y, rect.width, rect.height)
        }
      }
    }

    // draw cell walls
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

  private key(gx: number, gy: number): string {
    return `${gx},${gy}`
  }

}
