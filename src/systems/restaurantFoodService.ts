import Phaser from 'phaser'
import { getRecipe } from '../data/recipes'
import type { ChairRecord, TableRecord } from './restaurantTypes'

export function checkFoodService(
  tables: TableRecord[],
  chairs: ChairRecord[],
  isGridAdjacent: (ax: number, ay: number, bx: number, by: number) => boolean,
  onPlateConsumed: ((tableX: number, tableY: number, sprite: Phaser.GameObjects.Sprite) => void) | null,
): void {
  for (const table of tables) {
    const foodSlot = table.slots.find(s => s.plate !== null)
    if (!foodSlot?.plate) continue

    for (const chair of chairs) {
      if (!chair.occupiedBy || chair.occupiedBy.state !== 'awaiting_service') continue
      if (!isGridAdjacent(chair.x, chair.y, table.x, table.y)) continue

      const recipe = getRecipe(foodSlot.plate.recipeId)
      chair.occupiedBy.startEating(recipe?.eatTimeMs ?? 5000, recipe?.color ?? 0xffffff)

      const consumedSprite = foodSlot.plate.sprite
      foodSlot.plate.sprite.destroy()
      foodSlot.plate = null
      onPlateConsumed?.(table.x, table.y, consumedSprite)
      break
    }
  }
}
