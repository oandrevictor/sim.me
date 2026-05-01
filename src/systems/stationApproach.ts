import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import { queueSlotCellBehindStation } from './waterQueueLayout'

const APPROACH_OFFSETS = [
  { dx: 0, dy: 1 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
]

export interface StationApproach {
  gx: number
  gy: number
  x: number
  y: number
}

export function resolveStationApproach(
  pathfinder: GridPathfinder,
  stationX: number,
  stationY: number,
  bot: BotNirv,
): StationApproach | null {
  const station = screenToGrid(stationX, stationY)
  const sgx = Math.round(station.gx)
  const sgy = Math.round(station.gy)
  const candidates = APPROACH_OFFSETS
    .map(o => ({ gx: sgx + o.dx, gy: sgy + o.dy }))
    .filter(c => !pathfinder.isBlocked(c.gx, c.gy))
    .sort((a, b) => distanceToCell(bot, a.gx, a.gy) - distanceToCell(bot, b.gx, b.gy))

  for (const c of candidates) {
    const approach = reachableCell(pathfinder, bot, c.gx, c.gy)
    if (approach) return approach
  }
  return null
}

export function resolveReachableQueueSlot(
  pathfinder: GridPathfinder,
  stationX: number,
  stationY: number,
  bot: BotNirv,
  lineIndex: number,
): StationApproach | null {
  const desired = queueSlotCellBehindStation(pathfinder, stationX, stationY, lineIndex)
  const direct = reachableCell(pathfinder, bot, desired.gx, desired.gy)
  if (direct) return direct

  for (let r = 1; r <= 4; r++) {
    const candidates: { gx: number; gy: number }[] = []
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        const gx = desired.gx + dx
        const gy = desired.gy + dy
        if (!pathfinder.isBlocked(gx, gy)) candidates.push({ gx, gy })
      }
    }
    candidates.sort((a, b) => distanceToCell(bot, a.gx, a.gy) - distanceToCell(bot, b.gx, b.gy))
    for (const c of candidates) {
      const approach = reachableCell(pathfinder, bot, c.gx, c.gy)
      if (approach) return approach
    }
  }
  return null
}

export function resolveReachablePoint(
  pathfinder: GridPathfinder,
  bot: BotNirv,
  x: number,
  y: number,
): StationApproach | null {
  const g = screenToGrid(x, y)
  return reachableCell(pathfinder, bot, Math.round(g.gx), Math.round(g.gy))
}

function reachableCell(
  pathfinder: GridPathfinder,
  bot: BotNirv,
  gx: number,
  gy: number,
): StationApproach | null {
  const start = screenToGrid(bot.nirv.sprite.x, bot.nirv.sprite.y)
  const result = pathfinder.findPathResult(Math.round(start.gx), Math.round(start.gy), gx, gy, 1600)
  if (!result || result.end.gx !== gx || result.end.gy !== gy) return null
  const p = gridToScreen(gx, gy)
  return { gx, gy, x: p.x, y: p.y }
}

function distanceToCell(bot: BotNirv, gx: number, gy: number): number {
  const p = gridToScreen(gx, gy)
  return Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, p.x, p.y)
}
