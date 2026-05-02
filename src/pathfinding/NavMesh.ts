export type LOSFn = (x0: number, y0: number, x1: number, y1: number) => boolean

interface NavNode { gx: number; gy: number }

/**
 * Visibility-graph NavMesh for outdoor/long-range pathfinding.
 * Nodes are convex obstacle corners; edges are mutually visible node pairs.
 * Door-threshold waypoints are injected externally so narrow building
 * entrances are also reachable through the graph.
 */
export class NavMesh {
  private nodes: NavNode[] = []
  private edges: Map<number, number[]> = new Map()

  build(
    blocked: boolean[][],
    cols: number,
    rows: number,
    los: LOSFn,
    extra: NavNode[] = [],
  ): void {
    const seen = new Set<string>()
    const all: NavNode[] = []
    const add = (gx: number, gy: number) => {
      if (blocked[gx]?.[gy]) return
      const k = `${gx},${gy}`
      if (seen.has(k)) return
      seen.add(k)
      all.push({ gx, gy })
    }
    for (const c of this.extractCorners(blocked, cols, rows)) add(c.gx, c.gy)
    for (const e of extra) add(e.gx, e.gy)

    this.nodes = all
    const n = all.length
    this.edges.clear()
    for (let i = 0; i < n; i++) this.edges.set(i, [])
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (los(all[i].gx, all[i].gy, all[j].gx, all[j].gy)) {
          this.edges.get(i)!.push(j)
          this.edges.get(j)!.push(i)
        }
      }
    }
  }

  findPath(
    startGX: number,
    startGY: number,
    endGX: number,
    endGY: number,
    los: LOSFn,
  ): { gx: number; gy: number }[] | null {
    if (los(startGX, startGY, endGX, endGY)) return [{ gx: endGX, gy: endGY }]

    const n = this.nodes.length
    if (n === 0) return null

    const startVis: number[] = []
    const endVis = new Set<number>()
    for (let i = 0; i < n; i++) {
      if (los(startGX, startGY, this.nodes[i].gx, this.nodes[i].gy)) startVis.push(i)
      if (los(endGX, endGY, this.nodes[i].gx, this.nodes[i].gy)) endVis.add(i)
    }
    if (startVis.length === 0 || endVis.size === 0) return null

    // A* on visibility graph. Virtual IDs: n = start, n+1 = end.
    const START = n, END = n + 1
    const getPos = (id: number): NavNode => {
      if (id === START) return { gx: startGX, gy: startGY }
      if (id === END) return { gx: endGX, gy: endGY }
      return this.nodes[id]
    }
    const dist = (a: number, b: number): number => {
      const pa = getPos(a), pb = getPos(b)
      return Math.sqrt((pa.gx - pb.gx) ** 2 + (pa.gy - pb.gy) ** 2)
    }

    const gScore = new Map<number, number>([[START, 0]])
    const fScore = new Map<number, number>([[START, dist(START, END)]])
    const parent = new Map<number, number>()
    const closed = new Set<number>()
    const open = new Set<number>([START])

    while (open.size > 0) {
      let current = -1, bestF = Infinity
      for (const id of open) {
        const f = fScore.get(id) ?? Infinity
        if (f < bestF) { bestF = f; current = id }
      }

      if (current === END) {
        const path: NavNode[] = []
        let node = END
        while (node !== START) { path.unshift(getPos(node)); node = parent.get(node)! }
        return path
      }

      open.delete(current)
      closed.add(current)

      const neighbors: number[] = current === START ? [...startVis] : [...(this.edges.get(current) ?? [])]
      if (current === START && los(startGX, startGY, endGX, endGY)) neighbors.push(END)
      if (current !== START && endVis.has(current)) neighbors.push(END)

      for (const nb of neighbors) {
        if (closed.has(nb)) continue
        const g = (gScore.get(current) ?? Infinity) + dist(current, nb)
        if (g < (gScore.get(nb) ?? Infinity)) {
          parent.set(nb, current)
          gScore.set(nb, g)
          fScore.set(nb, g + dist(nb, END))
          open.add(nb)
        }
      }
    }
    return null
  }

  get nodeCount(): number { return this.nodes.length }

  /**
   * Convex-corner extraction: a walkable cell (x,y) is a corner waypoint if
   * there is a diagonal direction where the diagonal cell is blocked and BOTH
   * cardinal cells between them are walkable.  This identifies exactly the
   * outer corners of rectangular obstacles.
   */
  private extractCorners(blocked: boolean[][], cols: number, rows: number): NavNode[] {
    const corners: NavNode[] = []
    const diags: [number, number][] = [[-1,-1],[1,-1],[-1,1],[1,1]]
    for (let x = 1; x < cols - 1; x++) {
      for (let y = 1; y < rows - 1; y++) {
        if (blocked[x]?.[y]) continue
        for (const [dx, dy] of diags) {
          if (!blocked[x + dx]?.[y + dy]) continue
          if (blocked[x + dx]?.[y]) continue
          if (blocked[x]?.[y + dy]) continue
          corners.push({ gx: x, gy: y })
          break
        }
      }
    }
    return corners
  }
}
