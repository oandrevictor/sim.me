interface Node {
  gx: number
  gy: number
  g: number
  h: number
  f: number
  parent: Node | null
}

export class GridPathfinder {
  private blocked: boolean[][]
  private cols: number
  private rows: number

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.blocked = Array.from({ length: cols }, () => Array(rows).fill(false))
  }

  blockCell(gx: number, gy: number): void {
    if (this.inBounds(gx, gy)) this.blocked[gx][gy] = true
  }

  unblockCell(gx: number, gy: number): void {
    if (this.inBounds(gx, gy)) this.blocked[gx][gy] = false
  }

  isBlocked(gx: number, gy: number): boolean {
    if (!this.inBounds(gx, gy)) return true
    return this.blocked[gx][gy]
  }

  /**
   * A* pathfinding. Returns array of grid cells from start to end (excluding start),
   * or null if no path found.
   */
  findPath(
    startGX: number, startGY: number,
    endGX: number, endGY: number,
    maxIterations = 2000,
  ): { gx: number; gy: number }[] | null {
    startGX = Math.round(startGX)
    startGY = Math.round(startGY)
    endGX = Math.round(endGX)
    endGY = Math.round(endGY)

    if (!this.inBounds(endGX, endGY)) return null
    // If end cell is blocked, try to find nearest unblocked neighbor
    if (this.blocked[endGX]?.[endGY]) {
      const alt = this.nearestUnblocked(endGX, endGY)
      if (!alt) return null
      endGX = alt.gx
      endGY = alt.gy
    }

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

  private nearestUnblocked(gx: number, gy: number): { gx: number; gy: number } | null {
    for (let r = 1; r <= 3; r++) {
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

  private inBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gy >= 0 && gx < this.cols && gy < this.rows
  }

  private key(gx: number, gy: number): string {
    return `${gx},${gy}`
  }
}
