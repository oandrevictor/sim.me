import type Phaser from 'phaser'
import { getFramedObjectDisplaySize, type ObjectType } from './objectTypes'

export type StockablePropType = Extract<ObjectType, 'snack_machine' | 'fruit_crate' | 'fridge'>

const DISPLAY_SCALE: Record<StockablePropType, number> = {
  snack_machine: 2.5,
  fruit_crate: 2.5,
  fridge: 2.4,
}

const FOOTPRINT_RATIO: Record<StockablePropType, number> = {
  snack_machine: 0.62,
  fruit_crate: 0.52,
  fridge: 0.55,
}

export function isStockablePropType(type: ObjectType): type is StockablePropType {
  return type === 'snack_machine' || type === 'fruit_crate' || type === 'fridge'
}

export function applyStockablePropDisplay(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  type: StockablePropType,
): { w: number; h: number } {
  const size = getFramedObjectDisplaySize(type, DISPLAY_SCALE[type])
  sprite.setDisplaySize(size.w, size.h)
  sprite.setOrigin(0.5, 1)
  return size
}

export function stockablePropFootWidth(type: StockablePropType, displayW: number): number {
  return Math.round(displayW * FOOTPRINT_RATIO[type])
}
