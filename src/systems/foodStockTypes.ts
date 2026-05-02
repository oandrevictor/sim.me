import Phaser from 'phaser'
import type { ObjectType } from '../objects/objectTypes'
import type { BotNirv } from '../entities/BotNirv'

export type FoodStockType = Extract<ObjectType, 'snack_machine' | 'fruit_crate' | 'fridge'>

export interface FoodStockStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  type: FoodStockType
  x: number
  y: number
  stock: number
  maxStock: number
  reservedByStockerBotId: string | null
}

export interface StockStationView {
  type: FoodStockType
  label: string
  stock: number
  maxStock: number
}

export interface StockWorkView {
  totalStations: number
  foodCount: number
  stockerBotIds: string[]
  bots: BotNirv[]
  stations: StockStationView[]
}

const FOOD_STOCK_MAX: Record<FoodStockType, number> = {
  snack_machine: 10,
  fruit_crate: 15,
  fridge: 15,
}

const FOOD_STOCK_LABEL: Record<FoodStockType, string> = {
  snack_machine: 'Snack',
  fruit_crate: 'Fruit',
  fridge: 'Fridge',
}

const FOOD_STOCK_TITLE: Record<FoodStockType, string> = {
  snack_machine: 'Snack machine',
  fruit_crate: 'Fruit stand',
  fridge: 'Fridge',
}

export function isFoodStockType(type: ObjectType): type is FoodStockType {
  return type === 'snack_machine' || type === 'fruit_crate' || type === 'fridge'
}

export function createFoodStockStation(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  type: FoodStockType,
  x: number,
  y: number,
  stock?: number,
): FoodStockStation {
  return {
    sprite,
    type,
    x,
    y,
    stock: clampFoodStock(type, stock),
    maxStock: maxStockForFoodType(type),
    reservedByStockerBotId: null,
  }
}

export function maxStockForFoodType(type: FoodStockType): number {
  return FOOD_STOCK_MAX[type]
}

export function clampFoodStock(type: FoodStockType, stock: number | undefined): number {
  const max = maxStockForFoodType(type)
  if (stock === undefined) return max
  return Phaser.Math.Clamp(Math.floor(stock), 0, max)
}

export function foodStockLabel(type: FoodStockType): string {
  return FOOD_STOCK_LABEL[type]
}

export function foodStockTitle(type: FoodStockType): string {
  return FOOD_STOCK_TITLE[type]
}

export function stockerApproachPoint(station: FoodStockStation): { x: number; y: number } {
  return { x: station.x, y: station.y + 52 }
}
