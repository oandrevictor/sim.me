import type Phaser from 'phaser'
import {
  applyStockablePropDisplay,
  stockablePropFootWidth,
  type StockablePropType,
} from '../objects/stockablePropDisplay'
import { createFoodStockStation } from '../systems/foodStockTypes'
import type { CookingSystem } from '../systems/CookingSystem'
import type { HungerSystem } from '../systems/HungerSystem'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { createFootprintBlocker, unblockCellAt } from './footprintBlocker'

export interface StockablePlacementContext {
  obstacleGroup: Phaser.Physics.Arcade.StaticGroup
  pathfinder: GridPathfinder
  hungerSystem: HungerSystem
  cookingSystem: CookingSystem
}

interface StockableRemovalContext {
  pathfinder: GridPathfinder
  hungerSystem: HungerSystem
  cookingSystem: CookingSystem
}

export function placeStockableProp(
  context: StockablePlacementContext,
  type: StockablePropType,
  sprite: Phaser.GameObjects.Sprite,
  x: number,
  y: number,
  stock?: number,
): Phaser.Physics.Arcade.Sprite {
  const { w } = applyStockablePropDisplay(sprite, type)
  const blocker = createFootprintBlocker(
    context.obstacleGroup,
    context.pathfinder,
    x,
    y,
    stockablePropFootWidth(type, w),
  )

  if (type === 'snack_machine') {
    context.hungerSystem.registerStation(sprite, x, y, stock)
  } else if (type === 'fruit_crate') {
    context.hungerSystem.registerFruitCrate(sprite, x, y, stock)
  } else {
    const station = createFoodStockStation(sprite, type, x, y, stock)
    context.hungerSystem.registerStockOnlyStation(station)
    context.cookingSystem.registerFridge(station)
  }

  return blocker
}

export function removeStockableProp(
  context: StockableRemovalContext,
  type: StockablePropType,
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  x: number,
  y: number,
): void {
  if (type === 'snack_machine') context.hungerSystem.unregisterStation(sprite)
  else if (type === 'fruit_crate') context.hungerSystem.unregisterFruitCrate(sprite)
  else {
    context.hungerSystem.unregisterStockOnlyStation(sprite)
    context.cookingSystem.unregisterFridge(sprite)
  }
  unblockCellAt(context.pathfinder, x, y)
}
