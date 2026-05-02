import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, type ObjectType } from '../objects/objectTypes'
import { isBedType } from '../objects/bedTypes'
import { isStockablePropType } from '../objects/stockablePropDisplay'
import type { PlacementManager } from '../placement/PlacementManager'
import { addToInventory } from '../storage/inventoryPersistence'
import { removeObjectAt } from '../storage/persistence'
import type { BladderSystem } from '../systems/BladderSystem'
import type { CookingSystem } from '../systems/CookingSystem'
import type { FarmingSystem } from '../systems/FarmingSystem'
import type { HydrationSystem } from '../systems/HydrationSystem'
import type { HungerSystem } from '../systems/HungerSystem'
import type { LightSystem } from '../systems/LightSystem'
import type { RestaurantSystem } from '../systems/RestaurantSystem'
import type { SleepSystem } from '../systems/SleepSystem'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { screenToGrid } from '../utils/isoGrid'
import type { FloorTileLayer } from './FloorTileLayer'
import type { SpawnerState } from './ObjectSpawner'
import { findPlacedObjectAt } from './placedObjectHitTest'
import { removeStockableProp } from './stockablePropPlacement'
import { unblockNavCellsForArcadeBody } from './footprintBlocker'

interface ObjectRemovalContext {
  state: SpawnerState
  pathfinder: GridPathfinder
  restaurantSystem: RestaurantSystem
  hydrationSystem: HydrationSystem
  sleepSystem: SleepSystem
  hungerSystem: HungerSystem
  cookingSystem: CookingSystem
  bladderSystem: BladderSystem
  farmingSystem: FarmingSystem
  lightSystem?: LightSystem
  getFloorLayer: () => FloorTileLayer
  spawnObject: (type: ObjectType, x: number, y: number, rotation?: number) => boolean
}

export function removePlacedObjectAt(
  context: ObjectRemovalContext,
  pointer: { worldX: number; worldY: number },
  menuRefreshInventory: () => void,
  placementManager: PlacementManager,
): void {
  const entry = findPlacedObjectAt(context.state.placedSprites, pointer.worldX, pointer.worldY)
  if (!entry) return
  const idx = context.state.placedSprites.indexOf(entry)
  if (idx === -1) return
  const { sprite, type, x, y, rotation } = entry
  entry.footprintBlocker?.destroy()
  sprite.destroy()
  context.state.placedSprites.splice(idx, 1)
  context.state.interactableSprites = context.state.interactableSprites.filter(s => s !== sprite)
  context.state.backgroundSprites = context.state.backgroundSprites.filter(s => s !== sprite)
  context.state.tableSprites = context.state.tableSprites.filter(t => t.sprite !== sprite)
  context.state.counterSprites = context.state.counterSprites.filter(c => c.sprite !== sprite)
  removeDependentPlates(context, type, x, y)
  unregisterObject(context, sprite, type, x, y)
  removeObjectAt(x, y)

  if (entry.footprintBlocker?.body) {
    unblockNavCellsForArcadeBody(context.pathfinder, entry.footprintBlocker.body as any)
  } else if (OBJECT_TYPE_REGISTRY[type].hasPhysicsBody && sprite.body) {
    unblockNavCellsForArcadeBody(context.pathfinder, sprite.body as any)
  }

  placementManager.enterReposition(type, x, y, rotation, {
    restore: () => { context.spawnObject(type, x, y, rotation) },
    store: () => {
      addToInventory(type)
      menuRefreshInventory()
    },
  })
}

function removeDependentPlates(context: ObjectRemovalContext, type: ObjectType, x: number, y: number): void {
  if (type !== 'table2' && type !== 'table4' && type !== 'counter') return
  const orphaned = context.state.plateSprites.filter(p => p.tableX === x && p.tableY === y)
  for (const plate of orphaned) {
    plate.sprite.destroy()
    removeObjectAt(plate.tableX, plate.tableY)
  }
  context.state.plateSprites = context.state.plateSprites.filter(p => p.tableX !== x || p.tableY !== y)
}

function unregisterObject(
  context: ObjectRemovalContext,
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  type: ObjectType,
  x: number,
  y: number,
): void {
  if (type === 'floor_yellow') removeFloorTile(context, x, y)
  else if (type === 'chair') context.restaurantSystem.unregisterChair(sprite as Phaser.GameObjects.Sprite)
  else if (type === 'drinking_water') {
    context.hydrationSystem.unregisterStation(sprite as Phaser.Physics.Arcade.Sprite)
  } else if (isStockablePropType(type)) {
    removeStockableProp(context, type, sprite)
  } else if (type === 'portable_toilet') {
    context.bladderSystem.unregisterStation(sprite as Phaser.Physics.Arcade.Sprite)
  } else if (type === 'crop') {
    context.farmingSystem.unregisterCrop(sprite)
  } else if (isBedType(type)) {
    context.sleepSystem.unregisterBed(sprite as Phaser.GameObjects.Sprite)
  } else if (type === 'lamp_post') {
    context.lightSystem?.unregisterLamp(sprite as Phaser.GameObjects.Sprite)
  } else if (type === 'table2' || type === 'table4') {
    context.restaurantSystem.unregisterTable(sprite)
  } else if (type === 'counter') {
    context.restaurantSystem.unregisterCounter(sprite as Phaser.Physics.Arcade.Sprite)
    context.state.plateSprites = context.state.plateSprites.filter(p =>
      Math.abs(p.tableX - x) >= 2 || Math.abs(p.tableY - y) >= 2,
    )
  }
}

function removeFloorTile(context: ObjectRemovalContext, x: number, y: number): void {
  const g = screenToGrid(x, y)
  context.getFloorLayer().remove(Math.round(g.gx), Math.round(g.gy))
}
