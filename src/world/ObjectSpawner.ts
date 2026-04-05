import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, OBJECT_SIZE, getFramedObjectDisplaySize, type ObjectType } from '../objects/objectTypes'
import { screenToGrid } from '../utils/isoGrid'
import { savePlacedObject } from '../storage/persistence'
import { removeObjectAt } from '../storage/persistence'
import { addToInventory } from '../storage/inventoryPersistence'
import type { RestaurantSystem } from '../systems/RestaurantSystem'
import type { CookingSystem } from '../systems/CookingSystem'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { PlacementManager } from '../placement/PlacementManager'

export type PlateEntry = { sprite: Phaser.GameObjects.Sprite; tableX: number; tableY: number; recipeId: string }
export type PlacedSpriteEntry = { sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite; type: ObjectType; x: number; y: number; rotation?: number }

export interface SpawnerState {
  placedSprites: PlacedSpriteEntry[]
  tableSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[]
  counterSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[]
  interactableSprites: Phaser.GameObjects.Sprite[]
  backgroundSprites: Phaser.GameObjects.Sprite[]
  plateSprites: PlateEntry[]
}

export class ObjectSpawner {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
    private readonly pathfinder: GridPathfinder,
    private readonly restaurantSystem: RestaurantSystem,
    private readonly cookingSystem: CookingSystem,
    private readonly state: SpawnerState,
    private readonly onStoveClicked: (sprite: Phaser.Physics.Arcade.Sprite) => void,
    private readonly onTrashClicked: (sprite: Phaser.Physics.Arcade.Sprite) => void,
    private readonly onInteractableClicked: (sprite: Phaser.GameObjects.Sprite) => void,
    private readonly onPlateClicked: (entry: PlateEntry) => void,
  ) {}

  spawn(type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string, rotation?: number): void {
    const config = OBJECT_TYPE_REGISTRY[type]
    const frame = config.frame !== undefined ? config.frame + (rotation ?? 0) : 0

    if (config.hasPhysicsBody) {
      const sprite = this.obstacleGroup.create(x, y, config.textureKey, frame) as Phaser.Physics.Arcade.Sprite
      sprite.setDepth(config.depth)
      if (config.frame !== undefined) {
        const { w, h } = getFramedObjectDisplaySize(type, 1.6)
        sprite.setDisplaySize(w, h)
        sprite.body!.setSize(OBJECT_SIZE, OBJECT_SIZE)
        sprite.body!.setOffset((sprite.width - OBJECT_SIZE) / 2, (sprite.height - OBJECT_SIZE) / 2)
      }
      sprite.refreshBody()
      this.state.placedSprites.push({ sprite, type, x, y, rotation })

      const g = screenToGrid(x, y)
      this.pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))

      if (type === 'table2' || type === 'table4') {
        this.state.tableSprites.push({ sprite, x, y })
        this.restaurantSystem.registerTable(sprite, x, y, type)
      } else if (type === 'counter') {
        this.state.counterSprites.push({ sprite, x, y })
      } else if (type === 'stove') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onStoveClicked(sprite))
        this.cookingSystem.registerStove(sprite, x, y, rotation ?? 0)
      } else if (type === 'trash') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onTrashClicked(sprite))
      }
    } else {
      const sprite = this.scene.add.sprite(x, y, config.textureKey, frame)
      sprite.setDepth(config.depth)
      if (config.frame !== undefined) {
        const { w, h } = getFramedObjectDisplaySize(type, 1.6)
        sprite.setDisplaySize(w, h)
      }
      if (type !== 'food_plate') {
        this.state.placedSprites.push({ sprite, type, x, y, rotation })
      }

      if (type === 'interactable') {
        this.state.interactableSprites.push(sprite)
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onInteractableClicked(sprite))
      } else if (type === 'chair') {
        this.restaurantSystem.registerChair(sprite, x, y)
      } else if (type === 'food_plate') {
        if (recipeId) {
          const plateEntry: PlateEntry = { sprite, tableX: x, tableY: y, recipeId }
          this.state.plateSprites.push(plateEntry)
          sprite.setInteractive({ useHandCursor: true, pixelPerfect: false })
          sprite.setDepth(5)
          sprite.on('pointerdown', () => this.onPlateClicked(plateEntry))
          this.restaurantSystem.placeFoodOnTable(x, y, recipeId, sprite)
        }
      } else {
        this.state.backgroundSprites.push(sprite)
      }
    }

    if (persist) {
      savePlacedObject({ id: crypto.randomUUID(), type, x, y, recipeId, rotation })
    }
  }

  removeAt(_pointer: Phaser.Input.Pointer, snapped: { x: number; y: number },
    menuIsInventory: boolean, menuRefreshInventory: () => void,
    placementManager: PlacementManager,
  ): void {
    const idx = this.state.placedSprites.findIndex(
      p => Math.abs(p.x - snapped.x) < 2 && Math.abs(p.y - snapped.y) < 2,
    )
    if (idx === -1) return

    const entry = this.state.placedSprites[idx]
    const { sprite, type, x, y, rotation } = entry

    sprite.destroy()
    this.state.placedSprites.splice(idx, 1)
    this.state.interactableSprites = this.state.interactableSprites.filter(s => s !== sprite)
    this.state.backgroundSprites = this.state.backgroundSprites.filter(s => s !== sprite)
    this.state.tableSprites = this.state.tableSprites.filter(t => t.sprite !== sprite)
    this.state.counterSprites = this.state.counterSprites.filter(c => c.sprite !== sprite)

    if (type === 'table2' || type === 'table4' || type === 'counter') {
      const orphaned = this.state.plateSprites.filter(p => p.tableX === x && p.tableY === y)
      for (const plate of orphaned) {
        plate.sprite.destroy()
        removeObjectAt(plate.tableX, plate.tableY)
      }
      this.state.plateSprites = this.state.plateSprites.filter(p => p.tableX !== x || p.tableY !== y)
    }

    if (type === 'chair') {
      this.restaurantSystem.unregisterChair(sprite as Phaser.GameObjects.Sprite)
    } else if (type === 'table2' || type === 'table4') {
      this.restaurantSystem.unregisterTable(sprite)
    }

    removeObjectAt(x, y)

    const typeConfig = OBJECT_TYPE_REGISTRY[type]
    if (typeConfig.hasPhysicsBody) {
      const g = screenToGrid(x, y)
      this.pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
    }

    if (menuIsInventory) {
      addToInventory(type)
      menuRefreshInventory()
    } else {
      placementManager.enterReposition(type, snapped.x, snapped.y, rotation)
    }
  }
}
