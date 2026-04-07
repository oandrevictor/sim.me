import { gridToScreen } from './isoGrid'

/** Point-in-parallelogram (iso footprint quads). */
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
  const pi = 0.5
  const ptl = gridToScreen(gridX + pi, gridY + pi)
  const ptr = gridToScreen(gridX + gridW - pi, gridY + pi)
  const pbr = gridToScreen(gridX + gridW - pi, gridY + gridH - pi)
  const pbl = gridToScreen(gridX + pi, gridY + gridH - pi)
  return isInsideQuad(px, py, ptl, ptr, pbr, pbl)
}
