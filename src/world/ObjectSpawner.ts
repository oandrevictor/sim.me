import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, OBJECT_SIZE, getFramedObjectDisplaySize, type ObjectType } from '../objects/objectTypes'
import { screenToGrid } from '../utils/isoGrid'
import { savePlacedObject } from '../storage/persistence'
import { removeObjectAt } from '../storage/persistence'
import { addToInventory } from '../storage/inventoryPersistence'
import type { RestaurantSystem } from '../systems/RestaurantSystem'
import type { CookingSystem } from '../systems/CookingSystem'
import type { HydrationSystem } from '../systems/HydrationSystem'
import type { HungerSystem } from '../systems/HungerSystem'
import type { BladderSystem } from '../systems/BladderSystem'
import type { SleepSystem } from '../systems/SleepSystem'
import { getBedTextureKey, isBedType } from '../objects/bedTypes'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { PlacementManager } from '../placement/PlacementManager'
import { DEPTH_UI } from '../config/world'
import { FloorTileLayer } from './FloorTileLayer'

export type PlateEntry = { sprite: Phaser.GameObjects.Sprite; tableX: number; tableY: number; recipeId: string }
export type PlacedSpriteEntry = {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  type: ObjectType
  x: number
  y: number
  rotation?: number
  /** Invisible footprint for beds (destroyed with the bed). */
  bedBlocker?: Phaser.Physics.Arcade.Sprite
}

export interface SpawnerState {
  placedSprites: PlacedSpriteEntry[]
  tableSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[]
  counterSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[]
  interactableSprites: Phaser.GameObjects.Sprite[]
  backgroundSprites: Phaser.GameObjects.Sprite[]
  plateSprites: PlateEntry[]
}

export class ObjectSpawner {
  private floorLayer: FloorTileLayer | null = null

  private getFloorLayer(): FloorTileLayer {
    if (!this.floorLayer) this.floorLayer = new FloorTileLayer(this.scene)
    return this.floorLayer
  }

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
    private readonly hydrationSystem: HydrationSystem,
    private readonly sleepSystem: SleepSystem,
    private readonly hungerSystem: HungerSystem,
    private readonly bladderSystem: BladderSystem,
  ) {}

  spawn(type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string, rotation?: number): void {
    const config = OBJECT_TYPE_REGISTRY[type]
    const rot = rotation ?? 0
    const frame =
      config.frame !== undefined
        ? (type === 'stove_white_clay' ? config.frame : config.frame + rot)
        : 0

    if (config.hasPhysicsBody) {
      const sprite = this.obstacleGroup.create(x, y, config.textureKey, frame) as Phaser.Physics.Arcade.Sprite
      sprite.setDepth(y)
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
      } else if (type === 'stove' || type === 'stove_white_clay') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onStoveClicked(sprite))
        this.cookingSystem.registerStove(sprite, x, y, rot)
      } else if (type === 'trash') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onTrashClicked(sprite))
      }
    } else {
      if (isBedType(type)) {
        const rot = rotation ?? 0
        const tex = getBedTextureKey(type, rot)
        const sprite = this.scene.add.sprite(x, y, tex)
        sprite.setDepth(y)
        const displayH = OBJECT_SIZE * 2.2
        const displayW = displayH * 1.45
        sprite.setDisplaySize(displayW, displayH)
        const blocker = this.obstacleGroup.create(x, y, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
        blocker.setVisible(false)
        blocker.body!.setSize(OBJECT_SIZE, OBJECT_SIZE / 2)
        blocker.body!.setOffset(-OBJECT_SIZE / 2, -OBJECT_SIZE / 4)
        blocker.refreshBody()
        const g = screenToGrid(x, y)
        this.pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
        this.sleepSystem.registerBed(sprite, x, y, rot)
        this.state.placedSprites.push({ sprite, type, x, y, rotation: rot, bedBlocker: blocker })
        if (persist) {
          savePlacedObject({ id: crypto.randomUUID(), type, x, y, recipeId, rotation: rot })
        }
        return
      }

      const sprite = this.scene.add.sprite(x, y, config.textureKey, frame)
      sprite.setDepth(y)
      if (config.frame !== undefined) {
        const { w, h } = getFramedObjectDisplaySize(type, 1.6)
        sprite.setDisplaySize(w, h)
      } else if (config.displayAspectWidthOverHeight !== undefined && type !== 'snack_machine' && type !== 'fruit_crate' && type !== 'portable_toilet') {
        const { w, h } = getFramedObjectDisplaySize(type, 1.6)
        sprite.setDisplaySize(w, h)
      }
      if (type !== 'food_plate') {
        this.state.placedSprites.push({ sprite, type, x, y, rotation })
      }

      if (type === 'floor_yellow') {
        sprite.setVisible(false)
        const g = screenToGrid(x, y)
        this.getFloorLayer().add(Math.round(g.gx), Math.round(g.gy))
      } else if (type === 'drinking_water') {
        // Display the tall isometric sprite (357×700)
        const displayH = OBJECT_SIZE * 2.7
        const displayW = displayH * (357 / 700)
        sprite.setDisplaySize(displayW, displayH)
        // Depth at grid cell center (ground contact point)
        sprite.setDepth(y)
        // Invisible static body for ground footprint only
        const blocker = this.obstacleGroup.create(x, y, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
        blocker.setVisible(false)
        blocker.body!.setSize(OBJECT_SIZE, OBJECT_SIZE / 2)
        blocker.body!.setOffset(-OBJECT_SIZE / 2, -OBJECT_SIZE / 4)
        blocker.refreshBody()
        const g = screenToGrid(x, y)
        this.pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
        this.hydrationSystem.registerStation(sprite as unknown as Phaser.Physics.Arcade.Sprite, x, y)
      } else if (type === 'snack_machine') {
        // Match tall prop scale (cf. drinking_water); PNG 450×555; anchor bottom so it sits on the tile.
        const displayH = OBJECT_SIZE * 2.5
        const displayW = displayH * (450 / 555)
        sprite.setDisplaySize(displayW, displayH)
        sprite.setOrigin(0.5, 1)
        sprite.setDepth(y)
        // Invisible physics sprite: default 32×32 texture, center origin. (x,y) = ground line (vending bottom).
        // Body bottom must sit on y; offset is from sprite top-left to body top-left (Arcade convention).
        const footH = OBJECT_SIZE / 2
        const footW = Math.max(OBJECT_SIZE, Math.round(displayW * 0.62))
        const blocker = this.obstacleGroup.create(x, y - footH / 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
        blocker.setVisible(false)
        blocker.body!.setSize(footW, footH)
        blocker.body!.setOffset(16 - footW / 2, 8)
        blocker.refreshBody()
        const g = screenToGrid(x, y)
        this.pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
        this.hungerSystem.registerStation(sprite as unknown as Phaser.Physics.Arcade.Sprite, x, y)
      } else if (type === 'fruit_crate') {
        const { w, h } = getFramedObjectDisplaySize(type, 2.5)
        sprite.setDisplaySize(w, h)
        sprite.setOrigin(0.5, 1)
        sprite.setDepth(y)
        const footH = OBJECT_SIZE / 2
        const footW = Math.max(OBJECT_SIZE, Math.round(w * 0.52))
        const blocker = this.obstacleGroup.create(x, y - footH / 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
        blocker.setVisible(false)
        blocker.body!.setSize(footW, footH)
        blocker.body!.setOffset(16 - footW / 2, 8)
        blocker.refreshBody()
        const g = screenToGrid(x, y)
        this.pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
        this.hungerSystem.registerFruitCrate(sprite as unknown as Phaser.Physics.Arcade.Sprite, x, y)
      } else if (type === 'portable_toilet') {
        const { w, h } = getFramedObjectDisplaySize(type, 2.2)
        sprite.setDisplaySize(w, h)
        sprite.setOrigin(0.5, 1)
        sprite.setDepth(y)
        const footH = OBJECT_SIZE / 2
        const footW = Math.max(OBJECT_SIZE, Math.round(w * 0.55))
        const blocker = this.obstacleGroup.create(x, y - footH / 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
        blocker.setVisible(false)
        blocker.body!.setSize(footW, footH)
        blocker.body!.setOffset(16 - footW / 2, 8)
        blocker.refreshBody()
        const g = screenToGrid(x, y)
        this.pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
        this.bladderSystem.registerStation(sprite as unknown as Phaser.Physics.Arcade.Sprite, x, y)
      } else if (type === 'interactable') {
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
          sprite.setDepth(DEPTH_UI + 5)
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

    entry.bedBlocker?.destroy()
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

    if (type === 'floor_yellow') {
      const g = screenToGrid(x, y)
      this.getFloorLayer().remove(Math.round(g.gx), Math.round(g.gy))
    } else if (type === 'chair') {
      this.restaurantSystem.unregisterChair(sprite as Phaser.GameObjects.Sprite)
    } else if (type === 'drinking_water') {
      this.hydrationSystem.unregisterStation(sprite as Phaser.Physics.Arcade.Sprite)
      const g = screenToGrid(x, y)
      this.pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
    } else if (type === 'snack_machine') {
      this.hungerSystem.unregisterStation(sprite as Phaser.Physics.Arcade.Sprite)
      const g = screenToGrid(x, y)
      this.pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
    } else if (type === 'fruit_crate') {
      this.hungerSystem.unregisterFruitCrate(sprite as Phaser.Physics.Arcade.Sprite)
      const g = screenToGrid(x, y)
      this.pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
    } else if (type === 'portable_toilet') {
      this.bladderSystem.unregisterStation(sprite as Phaser.Physics.Arcade.Sprite)
      const g = screenToGrid(x, y)
      this.pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
    } else if (isBedType(type)) {
      this.sleepSystem.unregisterBed(sprite as Phaser.GameObjects.Sprite)
      const g = screenToGrid(x, y)
      this.pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
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
