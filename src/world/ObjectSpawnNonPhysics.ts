import Phaser from 'phaser'
import { getBedTextureKey, isBedType } from '../objects/bedTypes'
import { OBJECT_TYPE_REGISTRY, OBJECT_SIZE, getFramedObjectDisplaySize, type ObjectType } from '../objects/objectTypes'
import { isStockablePropType } from '../objects/stockablePropDisplay'
import type { CropSeed, CropStage } from '../storage/persistence'
import type { BladderSystem } from '../systems/BladderSystem'
import type { CookingSystem } from '../systems/CookingSystem'
import type { FarmingSystem } from '../systems/FarmingSystem'
import type { HydrationSystem } from '../systems/HydrationSystem'
import type { HungerSystem } from '../systems/HungerSystem'
import type { RestaurantSystem } from '../systems/RestaurantSystem'
import type { SleepSystem } from '../systems/SleepSystem'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { DEPTH_UI } from '../config/world'
import { screenToGrid } from '../utils/isoGrid'
import type { FloorTileLayer } from './FloorTileLayer'
import type { PlateEntry, PlacedSpriteEntry, SpawnerState } from './ObjectSpawner'
import { placeStockableProp } from './stockablePropPlacement'

interface NonPhysicsContext {
  scene: Phaser.Scene
  obstacleGroup: Phaser.Physics.Arcade.StaticGroup
  pathfinder: GridPathfinder
  restaurantSystem: RestaurantSystem
  cookingSystem: CookingSystem
  state: SpawnerState
  onInteractableClicked: (sprite: Phaser.GameObjects.Sprite) => void
  onPlateClicked: (entry: PlateEntry) => void
  hydrationSystem: HydrationSystem
  sleepSystem: SleepSystem
  hungerSystem: HungerSystem
  bladderSystem: BladderSystem
  farmingSystem: FarmingSystem
  getFloorLayer: () => FloorTileLayer
}

interface NonPhysicsArgs {
  type: ObjectType
  x: number
  y: number
  frame: number
  recipeId?: string
  rotation?: number
  objectState?: { cropStage?: CropStage; cropSeed?: CropSeed; cropStageStartedAt?: number; stock?: number }
}

export function spawnNonPhysicsObject(context: NonPhysicsContext, args: NonPhysicsArgs): void {
  if (isBedType(args.type)) return spawnBed(context, args)
  const sprite = context.scene.add.sprite(args.x, args.y, textureKey(args.type), args.frame)
  sprite.setDepth(args.y)
  applyDefaultDisplay(sprite, args.type)
  const placedEntry = trackPlacedSprite(context, sprite, args)

  if (args.type === 'floor_yellow') spawnFloor(context, sprite, args)
  else if (args.type === 'crop') spawnCrop(context, sprite, args)
  else if (args.type === 'drinking_water') spawnWaterStation(context, sprite, placedEntry, args)
  else if (isStockablePropType(args.type)) {
    const blocker = placeStockableProp(context, args.type, sprite, args.x, args.y, args.objectState?.stock)
    if (placedEntry) placedEntry.footprintBlocker = blocker
  } else if (args.type === 'portable_toilet') spawnPortableToilet(context, sprite, placedEntry, args)
  else if (args.type === 'interactable') {
    context.state.interactableSprites.push(sprite)
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerdown', () => context.onInteractableClicked(sprite))
  } else if (args.type === 'chair') context.restaurantSystem.registerChair(sprite, args.x, args.y)
  else if (args.type === 'food_plate') spawnFoodPlate(context, sprite, args)
  else context.state.backgroundSprites.push(sprite)
}

function textureKey(type: ObjectType): string {
  return typeConfig(type).textureKey
}

function typeConfig(type: ObjectType) {
  return OBJECT_TYPE_REGISTRY[type]
}

function applyDefaultDisplay(sprite: Phaser.GameObjects.Sprite, type: ObjectType): void {
  const config = typeConfig(type)
  if (config.frame !== undefined) {
    const { w, h } = getFramedObjectDisplaySize(type, 1.6)
    sprite.setDisplaySize(w, h)
  } else if (
    config.displayAspectWidthOverHeight !== undefined &&
    !isStockablePropType(type) &&
    type !== 'portable_toilet'
  ) {
    const { w, h } = getFramedObjectDisplaySize(type, 1.6)
    sprite.setDisplaySize(w, h)
  }
}

function trackPlacedSprite(context: NonPhysicsContext, sprite: Phaser.GameObjects.Sprite, args: NonPhysicsArgs) {
  if (args.type === 'food_plate' || args.type === 'crop') return null
  const entry = { sprite, type: args.type, x: args.x, y: args.y, rotation: args.rotation }
  context.state.placedSprites.push(entry)
  return entry
}

function spawnBed(context: NonPhysicsContext, args: NonPhysicsArgs): void {
  const rot = args.rotation ?? 0
  const sprite = context.scene.add.sprite(args.x, args.y, getBedTextureKey(args.type, rot))
  sprite.setDepth(args.y)
  const displayH = OBJECT_SIZE * 2.2
  sprite.setDisplaySize(displayH * 1.45, displayH)
  const blocker = context.obstacleGroup.create(args.x, args.y, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
  blocker.setVisible(false)
  blocker.body!.setSize(OBJECT_SIZE, OBJECT_SIZE / 2)
  blocker.body!.setOffset(-OBJECT_SIZE / 2, -OBJECT_SIZE / 4)
  blocker.refreshBody()
  blockCell(context.pathfinder, args.x, args.y)
  context.sleepSystem.registerBed(sprite, args.x, args.y, rot)
  context.state.placedSprites.push({ sprite, type: args.type, x: args.x, y: args.y, rotation: rot, footprintBlocker: blocker })
}

function spawnFloor(context: NonPhysicsContext, sprite: Phaser.GameObjects.Sprite, args: NonPhysicsArgs): void {
  sprite.setVisible(false)
  const g = screenToGrid(args.x, args.y)
  context.getFloorLayer().add(Math.round(g.gx), Math.round(g.gy))
}

function spawnCrop(context: NonPhysicsContext, sprite: Phaser.GameObjects.Sprite, args: NonPhysicsArgs): void {
  const { w, h } = getFramedObjectDisplaySize(args.type, 2.5)
  sprite.setDisplaySize(w, h)
  sprite.setOrigin(0.5, 1)
  sprite.setInteractive({ useHandCursor: true, pixelPerfect: false })
  const blocker = context.obstacleGroup.create(args.x, args.y - OBJECT_SIZE / 4, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
  blocker.setVisible(false)
  blocker.body!.setSize(OBJECT_SIZE, OBJECT_SIZE / 2)
  blocker.body!.setOffset(-OBJECT_SIZE / 2, -OBJECT_SIZE / 4)
  blocker.refreshBody()
  blockCell(context.pathfinder, args.x, args.y)
  context.state.placedSprites.push({ sprite, type: args.type, x: args.x, y: args.y, rotation: args.rotation, footprintBlocker: blocker })
  context.farmingSystem.registerCrop(sprite, args.x, args.y, args.objectState)
}

function spawnWaterStation(
  context: NonPhysicsContext,
  sprite: Phaser.GameObjects.Sprite,
  placedEntry: PlacedSpriteEntry | null,
  args: NonPhysicsArgs,
): void {
  const displayH = OBJECT_SIZE * 2.7
  sprite.setDisplaySize(displayH * (357 / 700), displayH)
  const blocker = baseBlocker(context, args.x, args.y)
  if (placedEntry) placedEntry.footprintBlocker = blocker
  context.hydrationSystem.registerStation(sprite as unknown as Phaser.Physics.Arcade.Sprite, args.x, args.y)
}

function spawnPortableToilet(
  context: NonPhysicsContext,
  sprite: Phaser.GameObjects.Sprite,
  placedEntry: PlacedSpriteEntry | null,
  args: NonPhysicsArgs,
): void {
  const { w, h } = getFramedObjectDisplaySize(args.type, 2.2)
  sprite.setDisplaySize(w, h)
  sprite.setOrigin(0.5, 1)
  const blocker = baseBlocker(context, args.x, args.y, Math.max(OBJECT_SIZE, Math.round(w * 0.55)))
  if (placedEntry) placedEntry.footprintBlocker = blocker
  context.bladderSystem.registerStation(sprite as unknown as Phaser.Physics.Arcade.Sprite, args.x, args.y)
}

function spawnFoodPlate(context: NonPhysicsContext, sprite: Phaser.GameObjects.Sprite, args: NonPhysicsArgs): void {
  if (!args.recipeId) return
  const plateEntry: PlateEntry = { sprite, tableX: args.x, tableY: args.y, recipeId: args.recipeId }
  context.state.plateSprites.push(plateEntry)
  sprite.setInteractive({ useHandCursor: true, pixelPerfect: false })
  sprite.setDepth(DEPTH_UI + 5)
  sprite.on('pointerdown', () => context.onPlateClicked(plateEntry))
  const onCounter = context.restaurantSystem.placeFoodOnCounter(args.x, args.y, args.recipeId, sprite)
  if (!onCounter) context.restaurantSystem.placeFoodOnTable(args.x, args.y, args.recipeId, sprite)
}

function baseBlocker(context: NonPhysicsContext, x: number, y: number, footW = OBJECT_SIZE): Phaser.Physics.Arcade.Sprite {
  const blocker = context.obstacleGroup.create(x, y, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
  blocker.setVisible(false)
  blocker.body!.setSize(footW, OBJECT_SIZE / 2)
  blocker.body!.setOffset(-OBJECT_SIZE / 2, -OBJECT_SIZE / 4)
  blocker.refreshBody()
  blockCell(context.pathfinder, x, y)
  return blocker
}

function blockCell(pathfinder: GridPathfinder, x: number, y: number): void {
  const g = screenToGrid(x, y)
  pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
}
