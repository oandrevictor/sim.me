import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'

/** Stable tie-break when two cardinals tie for longest primary run. */
const CARDINAL_DIRS: { dx: number; dy: number }[] = [
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
]

const MAX_QUEUE_SLOTS = 24

function walkPrimaryLength(
  pf: GridPathfinder,
  sgx: number,
  sgy: number,
  dx: number,
  dy: number,
): number {
  let len = 0
  let gx = sgx + dx
  let gy = sgy + dy
  while (!pf.isBlocked(gx, gy) && len < MAX_QUEUE_SLOTS) {
    len++
    gx += dx
    gy += dy
  }
  return len
}

/** How many steps we can take along `dir` starting from the first cell past `corner`. */
function walkRayLength(
  pf: GridPathfinder,
  startGx: number,
  startGy: number,
  dx: number,
  dy: number,
): number {
  let len = 0
  let gx = startGx + dx
  let gy = startGy + dy
  while (!pf.isBlocked(gx, gy) && len < MAX_QUEUE_SLOTS) {
    len++
    gx += dx
    gy += dy
  }
  return len
}

function pickPrimaryDir(
  pf: GridPathfinder,
  sgx: number,
  sgy: number,
): { dx: number; dy: number; len: number } {
  let best = { dx: 0, dy: 1, len: -1 }
  for (const { dx, dy } of CARDINAL_DIRS) {
    const len = walkPrimaryLength(pf, sgx, sgy, dx, dy)
    if (len > best.len) best = { dx, dy, len }
  }
  return best
}

function perpendicularsForPrimary(dx: number): { dx: number; dy: number }[] {
  if (dx === 0) return [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }]
  return [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }]
}

function pickSecondaryDir(
  pf: GridPathfinder,
  sgx: number,
  sgy: number,
  pdx: number,
  pdy: number,
  primaryLen: number,
): { dx: number; dy: number } {
  const cornerGx = sgx + pdx * primaryLen
  const cornerGy = sgy + pdy * primaryLen
  const perps = perpendicularsForPrimary(pdx)
  let best = perps[0]
  let bestScore = -1
  for (const p of perps) {
    const score = walkRayLength(pf, cornerGx, cornerGy, p.dx, p.dy)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

function nearestUnblockedRing(pf: GridPathfinder, sgx: number, sgy: number): { gx: number; gy: number } | null {
  for (let r = 1; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        const gx = sgx + dx
        const gy = sgy + dy
        if (!pf.isBlocked(gx, gy)) return { gx, gy }
      }
    }
  }
  return null
}

function slotGridForIndex(
  pf: GridPathfinder,
  sgx: number,
  sgy: number,
  k: number,
): { gx: number; gy: number } {
  const { dx: pdx, dy: pdy, len: primaryLen } = pickPrimaryDir(pf, sgx, sgy)
  if (primaryLen === 0) {
    const fb = nearestUnblockedRing(pf, sgx, sgy)
    return fb ?? { gx: sgx, gy: sgy }
  }
  const { dx: sdx, dy: sdy } = pickSecondaryDir(pf, sgx, sgy, pdx, pdy, primaryLen)
  let gx: number
  let gy: number
  if (k < primaryLen) {
    gx = sgx + (k + 1) * pdx
    gy = sgy + (k + 1) * pdy
  } else {
    gx = sgx + primaryLen * pdx + (k - primaryLen + 1) * sdx
    gy = sgy + primaryLen * pdy + (k - primaryLen + 1) * sdy
  }
  if (pf.isBlocked(gx, gy)) {
    const fb = nearestUnblockedRing(pf, gx, gy) ?? nearestUnblockedRing(pf, sgx, sgy)
    if (fb) return fb
  }
  return { gx, gy }
}

/**
 * Pixel center of the `lineIndex` queue slot (0 = first behind the station).
 * Follows cardinal grid steps from the station tile; bends in an L when the primary run hits a wall.
 */
export function queueSlotBehindStation(
  pathfinder: GridPathfinder,
  stationX: number,
  stationY: number,
  lineIndex: number,
): { x: number; y: number } {
  const k = Math.min(Math.max(0, lineIndex), MAX_QUEUE_SLOTS - 1)
  const { gx, gy } = screenToGrid(stationX, stationY)
  const sgxi = Math.round(gx)
  const sgyi = Math.round(gy)
  const cell = slotGridForIndex(pathfinder, sgxi, sgyi, k)
  return gridToScreen(cell.gx, cell.gy)
}
