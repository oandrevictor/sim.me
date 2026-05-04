import type { WallSide } from '../storage/wallPersistence'

interface Node {
  gx: number
  gy: number
  g: number
  h: number
  f: number
  parent: Node | null
}

type CellCostProvider = (gx: number, gy: number) => number

class MinHeap {
  private data: Node[] = []

  push(node: Node): void {
    this.data.push(node)
    this.siftUp(this.data.length - 1)
  }

  pop(): Node | undefined {
    const top = this.data[0]
    const last = this.data.pop()!
    if (this.data.length > 0) {
      this.data[0] = last
      this.siftDown(0)
    }
    return top
  }

  get size(): number { return this.data.length }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.cmp(this.data[i], this.data[parent]) < 0) {
        ;[this.data[i], this.data[parent]] = [this.data[parent], this.data[i]]
        i = parent
      } else break
    }
  }

  private siftDown(i: number): void {
    const n = this.data.length
    while (true) {
      let s = i
      const l = 2 * i + 1, r = 2 * i + 2
      if (l < n && this.cmp(this.data[l], this.data[s]) < 0) s = l
      if (r < n && this.cmp(this.data[r], this.data[s]) < 0) s = r
      if (s === i) break
      ;[this.data[i], this.data[s]] = [this.data[s], this.data[i]]
      i = s
    }
  }

  private cmp(a: Node, b: Node): number {
    return a.f !== b.f ? a.f - b.f : a.h - b.h
  }
}

/** A* search and path-smoothing — holds references to the shared blocked/cellWalls data. */
export class AStarSearch {
  private readonly blocked: boolean[][]
  private readonly cols: number
  private readonly rows: number
  private readonly cellWalls: Map<string, Set<WallSide>>
  private readonly cellCost: CellCostProvider
  private readonly minCellCost: number

  constructor(
    blocked: boolean[][],
    cols: number,
    rows: number,
    cellWalls: Map<string, Set<WallSide>>,
    cellCost: CellCostProvider = () => 1,
    minCellCost = 1,
  ) {
    this.blocked = blocked
    this.cols = cols
    this.rows = rows
    this.cellWalls = cellWalls
    this.cellCost = cellCost
    this.minCellCost = minCellCost
  }

  search(
    startGX: number,
    startGY: number,
    endGX: number,
    endGY: number,
    maxIterations: number,
  ): { gx: number; gy: number }[] | null {
    if (startGX === endGX && startGY === endGY) return []

    const openMap = new Map<string, Node>()
    const closedSet = new Set<string>()
    const heap = new MinHeap()

    const startNode: Node = {
      gx: startGX, gy: startGY, g: 0,
      h: this.heuristic(startGX, startGY, endGX, endGY),
      f: 0, parent: null,
    }
    startNode.f = startNode.h
    heap.push(startNode)
    openMap.set(this.key(startGX, startGY), startNode)

    const dirs = [
      { dx: 0, dy: -1, cost: 1 }, { dx: 0, dy: 1, cost: 1 },
      { dx: -1, dy: 0, cost: 1 }, { dx: 1, dy: 0, cost: 1 },
      { dx: -1, dy: -1, cost: 1.414 }, { dx: 1, dy: -1, cost: 1.414 },
      { dx: -1, dy: 1, cost: 1.414 }, { dx: 1, dy: 1, cost: 1.414 },
    ]

    let iterations = 0
    while (heap.size > 0) {
      if (++iterations > maxIterations) return null
      const current = heap.pop()!
      const currentKey = this.key(current.gx, current.gy)
      if (closedSet.has(currentKey)) continue
      const mapEntry = openMap.get(currentKey)
      if (mapEntry && current.g > mapEntry.g) continue
      openMap.delete(currentKey)
      closedSet.add(currentKey)

      if (current.gx === endGX && current.gy === endGY) {
        return this.reconstructPath(current)
      }

      for (const { dx, dy, cost } of dirs) {
        const nx = current.gx + dx
        const ny = current.gy + dy
        const nKey = this.key(nx, ny)
        if (!this.inBounds(nx, ny)) continue
        if (this.blocked[nx][ny]) continue
        if (closedSet.has(nKey)) continue
        if (dx !== 0 && dy !== 0) {
          if (this.isBlocked(current.gx + dx, current.gy) || this.isBlocked(current.gx, current.gy + dy)) continue
        }
        if (this.isCellWallBlocked(current.gx, current.gy, nx, ny)) continue
        if (dx !== 0 && dy !== 0) {
          if (this.isCellWallBlocked(current.gx, current.gy, current.gx + dx, current.gy) ||
              this.isCellWallBlocked(current.gx, current.gy, current.gx, current.gy + dy)) continue
        }

        const g = current.g + cost * Math.max(this.minCellCost, this.cellCost(nx, ny))
        const existing = openMap.get(nKey)
        if (!existing || g < existing.g) {
          const h = this.heuristic(nx, ny, endGX, endGY)
          const node: Node = { gx: nx, gy: ny, g, h, f: g + h, parent: current }
          openMap.set(nKey, node)
          heap.push(node)
        }
      }
    }
    return null
  }

  smoothPath(path: { gx: number; gy: number }[]): { gx: number; gy: number }[] {
    if (path.length <= 2) return path
    const smoothed: { gx: number; gy: number }[] = [path[0]]
    let currentIdx = 0
    while (currentIdx < path.length - 1) {
      let furthestIdx = currentIdx + 1
      for (let i = currentIdx + 2; i < path.length; i++) {
        if (this.hasLineOfSight(path[currentIdx].gx, path[currentIdx].gy, path[i].gx, path[i].gy)) {
          furthestIdx = i
        } else break
      }
      smoothed.push(path[furthestIdx])
      currentIdx = furthestIdx
    }
    return smoothed
  }

  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx - dy, x = x0, y = y0
    while (true) {
      if (this.isBlocked(x, y)) return false
      if (x === x1 && y === y1) break
      const e2 = 2 * err
      let nx = x, ny = y
      if (e2 > -dy) { err -= dy; nx += sx }
      if (e2 < dx) { err += dx; ny += sy }
      if (nx !== x && ny !== y) {
        if (this.isBlocked(nx, y) || this.isBlocked(x, ny)) return false
        if (this.isCellWallBlocked(x, y, nx, ny)) return false
        if (this.isCellWallBlocked(x, y, nx, y) || this.isCellWallBlocked(x, y, x, ny)) return false
      } else {
        if (this.isCellWallBlocked(x, y, nx, ny)) return false
      }
      x = nx; y = ny
    }
    return true
  }

  isCellWallBlocked(fromGX: number, fromGY: number, toGX: number, toGY: number): boolean {
    const dx = toGX - fromGX, dy = toGY - fromGY
    if (dx === 1)  return this.hasCellWall(fromGX, fromGY, 'e') || this.hasCellWall(toGX, toGY, 'w')
    if (dx === -1) return this.hasCellWall(fromGX, fromGY, 'w') || this.hasCellWall(toGX, toGY, 'e')
    if (dy === 1)  return this.hasCellWall(fromGX, fromGY, 's') || this.hasCellWall(toGX, toGY, 'n')
    if (dy === -1) return this.hasCellWall(fromGX, fromGY, 'n') || this.hasCellWall(toGX, toGY, 's')
    return false
  }

  private hasCellWall(gx: number, gy: number, side: WallSide): boolean {
    return this.cellWalls.get(this.key(gx, gy))?.has(side) ?? false
  }

  isBlocked(gx: number, gy: number): boolean {
    if (!this.inBounds(gx, gy)) return true
    return this.blocked[gx][gy]
  }

  private inBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gy >= 0 && gx < this.cols && gy < this.rows
  }

  private key(gx: number, gy: number): string { return `${gx},${gy}` }

  private heuristic(fromGX: number, fromGY: number, toGX: number, toGY: number): number {
    const hdx = Math.abs(toGX - fromGX)
    const hdy = Math.abs(toGY - fromGY)
    return (Math.max(hdx, hdy) + 0.414 * Math.min(hdx, hdy)) * this.minCellCost
  }

  private reconstructPath(node: Node): { gx: number; gy: number }[] {
    const path: { gx: number; gy: number }[] = []
    let current: Node | null = node
    while (current?.parent) { path.push({ gx: current.gx, gy: current.gy }); current = current.parent }
    path.reverse()
    return path
  }
}
