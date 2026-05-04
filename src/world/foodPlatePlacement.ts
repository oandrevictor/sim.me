import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY } from '../objects/objectTypes'
import { DEPTH_UI } from '../config/world'
import type { RestaurantSystem } from '../systems/RestaurantSystem'
import type { PlateEntry, SpawnerState } from './ObjectSpawner'

interface FoodPlateContext {
  scene: Phaser.Scene
  restaurantSystem: RestaurantSystem
  state: SpawnerState
  onPlateClicked: (entry: PlateEntry) => void
}

export function spawnFoodPlate(
  context: FoodPlateContext,
  x: number,
  y: number,
  frame: number,
  recipeId?: string,
): boolean {
  if (!recipeId) return false
  const sprite = context.scene.add.sprite(x, y, OBJECT_TYPE_REGISTRY.food_plate.textureKey, frame)
  sprite.setDepth(DEPTH_UI + 5)

  const placed =
    context.restaurantSystem.placeFoodOnCounter(x, y, recipeId, sprite) ||
    context.restaurantSystem.placeFoodOnTable(x, y, recipeId, sprite)
  if (!placed) {
    sprite.destroy()
    return false
  }

  const plateEntry: PlateEntry = { sprite, tableX: x, tableY: y, recipeId }
  context.state.plateSprites.push(plateEntry)
  sprite.setInteractive({ useHandCursor: true, pixelPerfect: false })
  sprite.on('pointerdown', () => context.onPlateClicked(plateEntry))
  return true
}
