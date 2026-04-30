import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { FoodStockStation } from './foodStockTypes'
import { type CookingSystem, type StoveState } from './CookingSystem'
import { findStaffApproachPoint } from './RestaurantStaffMovement'

export function pickIdleStove(
  cooking: CookingSystem,
  pathfinder: GridPathfinder,
  bot: BotNirv,
  building: Building,
): StoveState | null {
  const stoves = approachableStoves(cooking, pathfinder, bot, building)
  return stoves.find(s => s.reservedChefBotId === bot.id && s.status === 'idle') ??
    stoves.find(s => s.status === 'idle' && s.reservedChefBotId === null) ?? null
}

export function pickDoneStove(
  cooking: CookingSystem,
  pathfinder: GridPathfinder,
  bot: BotNirv,
  building: Building,
): StoveState | null {
  return approachableStoves(cooking, pathfinder, bot, building)
    .find(s =>
      s.status === 'done' &&
      (s.reservedChefBotId === null || s.reservedChefBotId === bot.id),
    ) ?? null
}

export function pickStockedFridge(
  fridges: FoodStockStation[],
  pathfinder: GridPathfinder,
  bot: BotNirv,
  building: Building,
  availableStock: (fridge: FoodStockStation) => number,
): FoodStockStation | null {
  return fridges.find(f =>
    availableStock(f) > 0 &&
    findStaffApproachPoint(pathfinder, bot, building, f.x, f.y) !== null,
  ) ?? null
}

function approachableStoves(
  cooking: CookingSystem,
  pathfinder: GridPathfinder,
  bot: BotNirv,
  building: Building,
): StoveState[] {
  return cooking.getStovesInBuilding(building)
    .filter(s => findStaffApproachPoint(pathfinder, bot, building, s.x, s.y) !== null)
}
