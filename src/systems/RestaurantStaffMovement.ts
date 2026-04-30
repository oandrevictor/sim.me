import Phaser from 'phaser'
import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import type { RestaurantSystem } from './RestaurantSystem'

const STAFF_PIXEL_REACH = 56

export function staffNextToStation(
  restaurant: RestaurantSystem,
  bot: BotNirv,
  worldX: number,
  worldY: number,
): boolean {
  const sx = bot.nirv.sprite.x
  const sy = bot.nirv.sprite.y
  if (Phaser.Math.Distance.Between(sx, sy, worldX, worldY) < STAFF_PIXEL_REACH) return true
  return restaurant.isGridAdjacent(sx, sy, worldX, worldY)
}

export function findStaffApproachPoint(
  pathfinder: GridPathfinder,
  bot: BotNirv,
  building: Building,
  worldX: number,
  worldY: number,
): { x: number; y: number } | null {
  if (staffNextToStationPlaceholder(bot, worldX, worldY)) return { x: bot.nirv.sprite.x, y: bot.nirv.sprite.y }
  const bounds = building.getInteriorPathBounds(GRID_COLS, GRID_ROWS)
  const station = screenToGrid(worldX, worldY)
  const start = screenToGrid(bot.nirv.sprite.x, bot.nirv.sprite.y)
  const candidates = [
    { gx: Math.round(station.gx) - 1, gy: Math.round(station.gy) },
    { gx: Math.round(station.gx) + 1, gy: Math.round(station.gy) },
    { gx: Math.round(station.gx), gy: Math.round(station.gy) - 1 },
    { gx: Math.round(station.gx), gy: Math.round(station.gy) + 1 },
  ].filter(c =>
    c.gx >= bounds.minGX && c.gx <= bounds.maxGX &&
    c.gy >= bounds.minGY && c.gy <= bounds.maxGY &&
    !pathfinder.isBlocked(c.gx, c.gy),
  )
  candidates.sort((a, b) => {
    const da = Math.abs(a.gx - Math.round(start.gx)) + Math.abs(a.gy - Math.round(start.gy))
    const db = Math.abs(b.gx - Math.round(start.gx)) + Math.abs(b.gy - Math.round(start.gy))
    return da - db
  })

  for (const c of candidates) {
    const path = pathfinder.findPath(Math.round(start.gx), Math.round(start.gy), c.gx, c.gy, 800)
    if (path) return gridToScreen(c.gx, c.gy)
  }
  return null
}

function staffNextToStationPlaceholder(bot: BotNirv, worldX: number, worldY: number): boolean {
  return Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, worldX, worldY) < STAFF_PIXEL_REACH
}
