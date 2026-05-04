import { getGridRect, TILE_H, TILE_W } from './isoGrid'

/** Point-in-convex-quad (stage platform inset; axis-aligned when projection is orthogonal). */
export function isInsideQuad(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const cross = (ox: number, oy: number, ax: number, ay: number, bx: number, by: number) =>
    (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
  const d1 = cross(px, py, a.x, a.y, b.x, b.y)
  const d2 = cross(px, py, b.x, b.y, c.x, c.y)
  const d3 = cross(px, py, c.x, c.y, d.x, d.y)
  const d4 = cross(px, py, d.x, d.y, a.x, a.y)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0 || d4 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0 || d4 > 0
  return !(hasNeg && hasPos)
}

/** Same inset as Stage raised platform fill (pi = 0.5 in grid space). */
export function platformInsetContainsPixel(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
  px: number,
  py: number,
): boolean {
  const r = getGridRect(gridX, gridY, gridW, gridH)
  const left = r.x + TILE_W / 2
  const top = r.y + TILE_H / 2
  const right = r.x + r.width - TILE_W / 2
  const bottom = r.y + r.height - TILE_H / 2
  return px >= left && px <= right && py >= top && py <= bottom
}
