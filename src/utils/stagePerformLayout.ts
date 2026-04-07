import type { StageInteriorBounds } from '../pathfinding/GridPathfinder'
import { gridToScreen } from './isoGrid'
import { platformInsetContainsPixel } from './isoQuad'

/**
 * Integer tile indices whose centers lie on the raised platform (inset quad matches Stage.draw).
 * `gridToScreen(gx, gy)` is the tile center — do not add 0.5 (skewed iso would miss the deck).
 */
function collectPlatformTileCells(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
): { gx: number; gy: number }[] {
  const valid: { gx: number; gy: number }[] = []
  for (let gx = gridX - 1; gx <= gridX + gridW + 1; gx++) {
    for (let gy = gridY - 1; gy <= gridY + gridH + 1; gy++) {
      const p = gridToScreen(gx, gy)
      if (platformInsetContainsPixel(gridX, gridY, gridW, gridH, p.x, p.y)) {
        valid.push({ gx, gy })
      }
    }
  }
  valid.sort((a, b) => b.gy - a.gy || a.gx - b.gx)
  return valid
}

function flatRectFallback(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
): { gx: number; gy: number }[] {
  const out: { gx: number; gy: number }[] = []
  for (let gy = gridY; gy < gridY + gridH; gy++) {
    for (let gx = gridX; gx < gridX + gridW; gx++) out.push({ gx, gy })
  }
  out.sort((a, b) => b.gy - a.gy || a.gx - b.gx)
  return out
}

function boundsFromCells(cells: { gx: number; gy: number }[]): StageInteriorBounds {
  let minGX = Infinity
  let maxGX = -Infinity
  let minGY = Infinity
  let maxGY = -Infinity
  for (const c of cells) {
    minGX = Math.min(minGX, c.gx)
    maxGX = Math.max(maxGX, c.gx)
    minGY = Math.min(minGY, c.gy)
    maxGY = Math.max(maxGY, c.gy)
  }
  return { minGX, maxGX, minGY, maxGY }
}

function pickSpaced(cells: { gx: number; gy: number }[], n: number): { gx: number; gy: number }[] {
  if (n <= 0 || cells.length === 0) return []
  if (n === 1) return [cells[Math.floor(cells.length / 2)]!]
  const out: { gx: number; gy: number }[] = []
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * (cells.length - 1))
    out.push(cells[idx]!)
  }
  return out
}

export function computeStagePerformPlacement(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
  performerCount: number,
): { cells: { gx: number; gy: number }[]; interior: StageInteriorBounds } {
  const platformCells = collectPlatformTileCells(gridX, gridY, gridW, gridH)
  const valid = platformCells.length > 0 ? platformCells : flatRectFallback(gridX, gridY, gridW, gridH)
  const interior = boundsFromCells(valid)
  const n = Math.min(performerCount, valid.length)
  const cells = pickSpaced(valid, n)
  return { cells, interior }
}

export function computeStagePerformMarks(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
  performerCount: number,
): { x: number; y: number }[] {
  const { cells } = computeStagePerformPlacement(gridX, gridY, gridW, gridH, performerCount)
  return cells.map((c) => gridToScreen(c.gx, c.gy))
}

/**
 * Solo deck: one spot downstage-center on the raised area (not the entrance row, which reads as grass).
 * Interior is the full footprint so `resolveStagePerformGoal` never falls back to far-off grass tiles.
 */
export function computeSoloPlatformPerformPlacement(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
): { cells: { gx: number; gy: number }[]; interior: StageInteriorBounds } {
  const gx = gridX + Math.floor((gridW - 1) / 2)
  const gy = gridY + Math.max(0, gridH - 2) - 1
  const interior: StageInteriorBounds = {
    minGX: gridX,
    maxGX: gridX + gridW - 1,
    minGY: gridY,
    maxGY: gridY + gridH - 1,
  }
  return { cells: [{ gx, gy }], interior }
}

export function computeSoloPlatformPerformMarks(
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
): { x: number; y: number }[] {
  const { cells } = computeSoloPlatformPerformPlacement(gridX, gridY, gridW, gridH)
  return cells.map((c) => gridToScreen(c.gx, c.gy))
}
