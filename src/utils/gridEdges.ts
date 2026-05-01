import { GRID_COLS, GRID_ROWS } from '../config/world'
import { gridToTopLeft, screenToCell, TILE_H, TILE_W } from './isoGrid'

export type WallOrientation = 'h' | 'v'

export interface WallEdge {
  gx: number
  gy: number
  orientation: WallOrientation
}

export function wallEdgeKey(edge: WallEdge): string {
  return `${edge.orientation}:${edge.gx},${edge.gy}`
}

export function parseWallEdgeKey(key: string): WallEdge {
  const [orientation, coords] = key.split(':')
  const [gx, gy] = coords!.split(',').map(Number)
  return { orientation: orientation as WallOrientation, gx, gy }
}

export function normalizeWallEdge(edge: WallEdge): WallEdge {
  return {
    orientation: edge.orientation,
    gx: Math.floor(edge.gx),
    gy: Math.floor(edge.gy),
  }
}

export function isWallEdgeInBounds(edge: WallEdge, cols = GRID_COLS, rows = GRID_ROWS): boolean {
  if (edge.orientation === 'h') {
    return edge.gx >= 0 && edge.gx < cols && edge.gy >= 0 && edge.gy <= rows
  }
  return edge.gx >= 0 && edge.gx <= cols && edge.gy >= 0 && edge.gy < rows
}

export function wallEdgeBetweenCells(fromGX: number, fromGY: number, toGX: number, toGY: number): WallEdge | null {
  const dx = toGX - fromGX
  const dy = toGY - fromGY
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null
  if (dx === 1) return { orientation: 'v', gx: toGX, gy: fromGY }
  if (dx === -1) return { orientation: 'v', gx: fromGX, gy: fromGY }
  if (dy === 1) return { orientation: 'h', gx: fromGX, gy: toGY }
  return { orientation: 'h', gx: fromGX, gy: fromGY }
}

export function wallEdgeEndpoints(edge: WallEdge): { ax: number; ay: number; bx: number; by: number } {
  const a = gridToTopLeft(edge.gx, edge.gy)
  if (edge.orientation === 'h') {
    return { ax: a.x, ay: a.y, bx: a.x + TILE_W, by: a.y }
  }
  return { ax: a.x, ay: a.y, bx: a.x, by: a.y + TILE_H }
}

export function wallEdgeCenter(edge: WallEdge): { x: number; y: number } {
  const p = wallEdgeEndpoints(edge)
  return { x: (p.ax + p.bx) / 2, y: (p.ay + p.by) / 2 }
}

export function snapWorldToWallEdge(worldX: number, worldY: number): WallEdge | null {
  const cell = screenToCell(worldX, worldY)
  const candidates: WallEdge[] = [
    { orientation: 'h' as const, gx: cell.gx, gy: cell.gy },
    { orientation: 'h' as const, gx: cell.gx, gy: cell.gy + 1 },
    { orientation: 'v' as const, gx: cell.gx, gy: cell.gy },
    { orientation: 'v' as const, gx: cell.gx + 1, gy: cell.gy },
  ].filter(edge => isWallEdgeInBounds(edge))
  let best: { edge: WallEdge; distance: number } | null = null
  for (const edge of candidates) {
    const distance = distanceToEdge(worldX, worldY, edge)
    if (!best || distance < best.distance) best = { edge, distance }
  }
  return best?.edge ?? null
}

function distanceToEdge(x: number, y: number, edge: WallEdge): number {
  const p = wallEdgeEndpoints(edge)
  const minX = Math.min(p.ax, p.bx)
  const maxX = Math.max(p.ax, p.bx)
  const minY = Math.min(p.ay, p.by)
  const maxY = Math.max(p.ay, p.by)
  const cx = Math.max(minX, Math.min(maxX, x))
  const cy = Math.max(minY, Math.min(maxY, y))
  return Math.hypot(x - cx, y - cy)
}
