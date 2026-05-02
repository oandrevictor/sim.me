import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, OBJECT_SIZE, getFramedObjectDisplaySize, type ObjectType } from '../objects/objectTypes'
import { savePlacedObject, type CropSeed, type CropStage } from '../storage/persistence'
import type { RestaurantSystem } from '../systems/RestaurantSystem'
import type { CookingSystem } from '../systems/CookingSystem'
import type { HydrationSystem } from '../systems/HydrationSystem'
import type { HungerSystem } from '../systems/HungerSystem'
import type { BladderSystem } from '../systems/BladderSystem'
import type { SleepSystem } from '../systems/SleepSystem'
import type { FarmingSystem } from '../systems/FarmingSystem'
import type { LightSystem } from '../systems/LightSystem'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { PlacementManager } from '../placement/PlacementManager'
import { isFoodStockType, maxStockForFoodType } from '../systems/foodStockTypes'
import { FloorTileLayer } from './FloorTileLayer'
import { removePlacedObjectAt } from './ObjectRemoval'
import { spawnNonPhysicsObject } from './ObjectSpawnNonPhysics'
import { blockNavCellsForArcadeBody } from './footprintBlocker'

export type PlateEntry = { sprite: Phaser.GameObjects.Sprite; tableX: number; tableY: number; recipeId: string }
export type PlacedSpriteEntry = {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  type: ObjectType
  x: number
  y: number
  rotation?: number
  /** Invisible footprint for non-physics sprites that still block a tile. */
  footprintBlocker?: Phaser.Physics.Arcade.Sprite
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
  private lightSystem: LightSystem | null = null

  setLightSystem(ls: LightSystem): void { this.lightSystem = ls }

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
    private readonly farmingSystem: FarmingSystem,
  ) {}

  spawn(
    type: ObjectType,
    x: number,
    y: number,
    persist: boolean,
    recipeId?: string,
    rotation?: number,
    objectState?: { cropStage?: CropStage; cropSeed?: CropSeed; cropStageStartedAt?: number; stock?: number },
  ): boolean {
    const config = OBJECT_TYPE_REGISTRY[type]
    const rot = rotation ?? 0
    const frame =
      config.frame !== undefined
        ? (type === 'stove_white_clay'
          ? config.frame
          : type === 'portable_toilet'
            ? config.frame
            : config.frame + rot)
        : 0

    let spawned = true
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

      blockNavCellsForArcadeBody(this.pathfinder, sprite.body as Phaser.Physics.Arcade.StaticBody)

      if (type === 'table2' || type === 'table4') {
        this.state.tableSprites.push({ sprite, x, y })
        this.restaurantSystem.registerTable(sprite, x, y, type)
      } else if (type === 'counter') {
        this.state.counterSprites.push({ sprite, x, y })
        this.restaurantSystem.registerCounter(sprite, x, y)
      } else if (type === 'stove' || type === 'stove_white_clay') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onStoveClicked(sprite))
        this.cookingSystem.registerStove(sprite, x, y, rot)
      } else if (type === 'trash') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onTrashClicked(sprite))
      }
    } else {
      spawned = spawnNonPhysicsObject({
        scene: this.scene,
        obstacleGroup: this.obstacleGroup,
        pathfinder: this.pathfinder,
        restaurantSystem: this.restaurantSystem,
        cookingSystem: this.cookingSystem,
        state: this.state,
        onInteractableClicked: this.onInteractableClicked,
        onPlateClicked: this.onPlateClicked,
        hydrationSystem: this.hydrationSystem,
        sleepSystem: this.sleepSystem,
        hungerSystem: this.hungerSystem,
        bladderSystem: this.bladderSystem,
        farmingSystem: this.farmingSystem,
        lightSystem: this.lightSystem ?? undefined,
        getFloorLayer: () => this.getFloorLayer(),
      }, { type, x, y, frame, recipeId, rotation, objectState })
    }

    if (!spawned) return false
    if (persist) {
      savePlacedObject({
        id: crypto.randomUUID(),
        type,
        x,
        y,
        recipeId,
        rotation,
        stock: isFoodStockType(type) ? maxStockForFoodType(type) : undefined,
        cropStage: type === 'crop' ? 'empty' : undefined,
      })
    }
    return true
  }

  removeAt(pointer: Phaser.Input.Pointer,
    menuRefreshInventory: () => void,
    placementManager: PlacementManager,
  ): void {
    removePlacedObjectAt({
      state: this.state,
      pathfinder: this.pathfinder,
      restaurantSystem: this.restaurantSystem,
      hydrationSystem: this.hydrationSystem,
      sleepSystem: this.sleepSystem,
      hungerSystem: this.hungerSystem,
      cookingSystem: this.cookingSystem,
      bladderSystem: this.bladderSystem,
      farmingSystem: this.farmingSystem,
      lightSystem: this.lightSystem ?? undefined,
      getFloorLayer: () => this.getFloorLayer(),
      spawnObject: (type, x, y, rotation) => this.spawn(type, x, y, true, undefined, rotation),
    }, pointer, menuRefreshInventory, placementManager)
  }
}
