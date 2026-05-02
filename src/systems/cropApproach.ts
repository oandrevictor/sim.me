import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import { OBJECT_SIZE } from '../objects/objectTypes'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { gridToScreen, screenToCell, screenToGrid } from '../utils/isoGrid'
import type { CropPlot } from './farmingTypes'
import type { StationApproach } from './stationApproach'

const MAX_APPROACH_ITERATIONS = 1600
const MIN_APPROACH_RING = 2
const MAX_APPROACH_RING = 4
const CROP_FOOTPRINT_H = OBJECT_SIZE / 2
const CROP_PATH_CLEARANCE_CELLS = 1

interface CellBounds {
  minGX: number
  maxGX: number
  minGY: number
  maxGY: number
}

interface CellPoint {
  gx: number
  gy: number
}

interface CellRect {
  left: number
  right: number
  top: number
  bottom: number
}

export function resolveCropApproach(
  pathfinder: GridPathfinder,
  plot: CropPlot,
  bot: BotNirv,
): StationApproach | null {
  const footprint = cropFootprintBounds(plot)
  const candidates = cropApproachCandidates(footprint)
    .filter(c => !pathfinder.isBlocked(c.gx, c.gy))
    .sort((a, b) => distanceToCell(bot, a.gx, a.gy) - distanceToCell(bot, b.gx, b.gy))

  for (const c of candidates) {
    const approach = reachableCell(pathfinder, bot, c.gx, c.gy, footprint)
    if (approach) return approach
  }
  return null
}

function cropApproachCandidates(footprint: CellBounds): CellPoint[] {
  const out: { gx: number; gy: number }[] = []
  const seen = new Set<string>()
  const add = (gx: number, gy: number) => {
    const key = `${gx},${gy}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ gx, gy })
  }

  for (let r = MIN_APPROACH_RING; r <= MAX_APPROACH_RING; r++) {
    const minGX = footprint.minGX - r
    const maxGX = footprint.maxGX + r
    const minGY = footprint.minGY - r
    const maxGY = footprint.maxGY + r

    for (let gy = minGY; gy <= maxGY; gy++) {
      add(minGX, gy)
      add(maxGX, gy)
    }
    for (let gx = minGX + 1; gx <= maxGX - 1; gx++) {
      add(gx, minGY)
      add(gx, maxGY)
    }
  }

  return out
}

function cropFootprintBounds(plot: CropPlot): CellBounds {
  // Match createFootprintBlocker for crops; render bounds grow upward and are not the blocker.
  const min = screenToCell(plot.x - OBJECT_SIZE / 2, plot.y - CROP_FOOTPRINT_H)
  const max = screenToCell(plot.x + OBJECT_SIZE / 2 - 0.01, plot.y - 0.01)
  return {
    minGX: min.gx,
    maxGX: max.gx,
    minGY: min.gy,
    maxGY: max.gy,
  }
}

function reachableCell(
  pathfinder: GridPathfinder,
  bot: BotNirv,
  gx: number,
  gy: number,
  cropFootprint: CellBounds,
): StationApproach | null {
  const sprite = bot.nirv.sprite
  const bodyOffset = bodyCenterOffset(sprite)
  const targetBody = gridToScreen(gx, gy)
  const targetSprite = { x: targetBody.x - bodyOffset.x, y: targetBody.y - bodyOffset.y }
  const target = screenToGrid(targetSprite.x, targetSprite.y)
  const targetCell = { gx: Math.round(target.gx), gy: Math.round(target.gy) }
  const start = screenToGrid(sprite.x, sprite.y)
  const startCell = { gx: Math.round(start.gx), gy: Math.round(start.gy) }
  const result = pathfinder.findPathResult(
    startCell.gx,
    startCell.gy,
    targetCell.gx,
    targetCell.gy,
    MAX_APPROACH_ITERATIONS,
  )
  if (!result || result.end.gx !== targetCell.gx || result.end.gy !== targetCell.gy) return null
  if (!pathAvoidsCropFootprint(sprite, bodyOffset, result.path, { gx, gy }, cropFootprint)) return null
  return { gx: targetCell.gx, gy: targetCell.gy, x: targetSprite.x, y: targetSprite.y }
}

function bodyCenterOffset(sprite: Phaser.Physics.Arcade.Sprite): { x: number; y: number } {
  const body = sprite.body as Phaser.Physics.Arcade.Body | null
  if (!body) return { x: 0, y: 0 }
  return {
    x: body.x + body.width / 2 - sprite.x,
    y: body.y + body.height / 2 - sprite.y,
  }
}

function pathAvoidsCropFootprint(
  sprite: Phaser.Physics.Arcade.Sprite,
  bodyOffset: { x: number; y: number },
  path: CellPoint[],
  targetBodyCell: CellPoint,
  cropFootprint: CellBounds,
): boolean {
  const core = boundsToRect(cropFootprint)
  const inflated = boundsToRect(cropFootprint, CROP_PATH_CLEARANCE_CELLS)
  const points = [bodyCenterGrid(sprite.x, sprite.y, bodyOffset), ...path.map(p => bodyCenterGridForCell(p, bodyOffset)), targetBodyCell]

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    if (!segmentIntersectsRect(a, b, inflated)) continue
    // If recovery starts near the crop, allow paths that move away without crossing the blocker itself.
    if ((pointInRect(a, inflated) || pointInRect(b, inflated)) && !segmentIntersectsRect(a, b, core)) continue
    return false
  }
  return true
}

function bodyCenterGrid(spriteX: number, spriteY: number, bodyOffset: { x: number; y: number }): CellPoint {
  const g = screenToGrid(spriteX + bodyOffset.x, spriteY + bodyOffset.y)
  return { gx: g.gx, gy: g.gy }
}

function bodyCenterGridForCell(cell: CellPoint, bodyOffset: { x: number; y: number }): CellPoint {
  const p = gridToScreen(cell.gx, cell.gy)
  return bodyCenterGrid(p.x, p.y, bodyOffset)
}

function boundsToRect(bounds: CellBounds, inflate = 0): CellRect {
  return {
    left: bounds.minGX - 0.5 - inflate,
    right: bounds.maxGX + 0.5 + inflate,
    top: bounds.minGY - 0.5 - inflate,
    bottom: bounds.maxGY + 0.5 + inflate,
  }
}

function pointInRect(point: CellPoint, rect: CellRect): boolean {
  return point.gx >= rect.left && point.gx <= rect.right && point.gy >= rect.top && point.gy <= rect.bottom
}

function segmentIntersectsRect(a: CellPoint, b: CellPoint, rect: CellRect): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true
  return (
    segmentsIntersect(a, b, { gx: rect.left, gy: rect.top }, { gx: rect.right, gy: rect.top }) ||
    segmentsIntersect(a, b, { gx: rect.right, gy: rect.top }, { gx: rect.right, gy: rect.bottom }) ||
    segmentsIntersect(a, b, { gx: rect.right, gy: rect.bottom }, { gx: rect.left, gy: rect.bottom }) ||
    segmentsIntersect(a, b, { gx: rect.left, gy: rect.bottom }, { gx: rect.left, gy: rect.top })
  )
}

function segmentsIntersect(a: CellPoint, b: CellPoint, c: CellPoint, d: CellPoint): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)

  if (abC === 0 && onSegment(a, c, b)) return true
  if (abD === 0 && onSegment(a, d, b)) return true
  if (cdA === 0 && onSegment(c, a, d)) return true
  if (cdB === 0 && onSegment(c, b, d)) return true
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)
}

function orientation(a: CellPoint, b: CellPoint, c: CellPoint): number {
  const v = (b.gx - a.gx) * (c.gy - a.gy) - (b.gy - a.gy) * (c.gx - a.gx)
  return Math.abs(v) < 0.0001 ? 0 : v
}

function onSegment(a: CellPoint, b: CellPoint, c: CellPoint): boolean {
  return (
    b.gx >= Math.min(a.gx, c.gx) &&
    b.gx <= Math.max(a.gx, c.gx) &&
    b.gy >= Math.min(a.gy, c.gy) &&
    b.gy <= Math.max(a.gy, c.gy)
  )
}

function distanceToCell(bot: BotNirv, gx: number, gy: number): number {
  const p = gridToScreen(gx, gy)
  return Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, p.x, p.y)
}
