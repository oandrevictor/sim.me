import Phaser from 'phaser'
import type { ObjectType } from '../storage/persistence'

export type { ObjectType }

export const GRID_SIZE = 40
export const OBJECT_SIZE = 32

export interface ObjectTypeConfig {
  type: ObjectType
  label: string
  description: string
  textureKey: string
  frame?: number
  /** If set (with frame): display width = height × ratio; matches spritesheet frame aspect (see GameScene preload). */
  displayAspectWidthOverHeight?: number
  previewColor: number
  depth: number
  hasPhysicsBody: boolean
  isInteractable: boolean
}

export const OBJECT_TYPE_REGISTRY: Record<ObjectType, ObjectTypeConfig> = {
  obstacle: {
    type: 'obstacle',
    label: 'Obstacle',
    description: 'Blocks movement',
    textureKey: 'obj_obstacle',
    previewColor: 0x555555,
    depth: 2,
    hasPhysicsBody: true,
    isInteractable: false,
  },
  interactable: {
    type: 'interactable',
    label: 'Interactable',
    description: 'Click or walk through',
    textureKey: 'obj_interactable',
    previewColor: 0x4488ff,
    depth: 3,
    hasPhysicsBody: false,
    isInteractable: true,
  },
  background: {
    type: 'background',
    label: 'Decoration',
    description: 'Decorative, no interaction',
    textureKey: 'obj_background',
    previewColor: 0x8aab7a,
    depth: 1,
    hasPhysicsBody: false,
    isInteractable: false,
  },
  table2: {
    type: 'table2',
    label: 'Table (2)',
    description: '2-seat table',
    textureKey: 'furniture_table',
    frame: 0,
    previewColor: 0x8b6914,
    depth: 2,
    hasPhysicsBody: true,
    isInteractable: false,
  },
  table4: {
    type: 'table4',
    label: 'Table (4)',
    description: '4-seat table',
    textureKey: 'furniture_table',
    frame: 1,
    previewColor: 0x8b6914,
    depth: 2,
    hasPhysicsBody: true,
    isInteractable: false,
  },
  chair: {
    type: 'chair',
    label: 'Chair',
    description: 'Seat for Nirvs',
    textureKey: 'furniture_chair',
    frame: 0,
    previewColor: 0xa0784c,
    depth: 2,
    hasPhysicsBody: false,
    isInteractable: false,
  },
  stove: {
    type: 'stove',
    label: 'Stove',
    description: 'Cook recipes',
    textureKey: 'furniture_stove',
    frame: 0,
    displayAspectWidthOverHeight: 528 / 288,
    previewColor: 0x444444,
    depth: 2,
    hasPhysicsBody: true,
    isInteractable: true,
  },
  counter: {
    type: 'counter',
    label: 'Counter',
    description: 'Kitchen surface',
    textureKey: 'obj_counter',
    previewColor: 0x9b8b6b,
    depth: 2,
    hasPhysicsBody: true,
    isInteractable: false,
  },
  food_plate: {
    type: 'food_plate',
    label: 'Food Plate',
    description: 'A prepared dish',
    textureKey: 'obj_food_plate',
    previewColor: 0xffffff,
    depth: 3,
    hasPhysicsBody: false,
    isInteractable: false,
  },
  trash: {
    type: 'trash',
    label: 'Trash',
    description: 'Discard carried items',
    textureKey: 'obj_trash',
    previewColor: 0x4a5a4a,
    depth: 2,
    hasPhysicsBody: true,
    isInteractable: true,
  },
  drinking_water: {
    type: 'drinking_water',
    label: 'Drinking Water station',
    description: 'Nirvs drink here when thirsty',
    textureKey: 'obj_drinking_water',
    previewColor: 0x4488cc,
    depth: 2,
    hasPhysicsBody: true,
    isInteractable: true,
  },
}

/** World uses scale 1.6; shop/inventory icons use ~1.1. */
export function getFramedObjectDisplaySize(type: ObjectType, scale: number): { w: number; h: number } {
  const c = OBJECT_TYPE_REGISTRY[type]
  const h = OBJECT_SIZE * scale
  const r = c.displayAspectWidthOverHeight ?? 1
  return { w: h * r, h }
}

export function generateObjectTextures(scene: Phaser.Scene): void {
  // Obstacle: solid dark grey square
  const obstacleGfx = scene.make.graphics({ x: 0, y: 0 })
  obstacleGfx.fillStyle(0x555555)
  obstacleGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  obstacleGfx.lineStyle(2, 0x333333)
  obstacleGfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
  obstacleGfx.generateTexture('obj_obstacle', OBJECT_SIZE, OBJECT_SIZE)
  obstacleGfx.destroy()

  // Interactable inactive: muted blue square with lighter inner highlight
  const interactableGfx = scene.make.graphics({ x: 0, y: 0 })
  interactableGfx.fillStyle(0x2255aa)
  interactableGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  interactableGfx.fillStyle(0x4477cc)
  interactableGfx.fillRect(4, 4, OBJECT_SIZE - 8, OBJECT_SIZE - 8)
  interactableGfx.generateTexture('obj_interactable', OBJECT_SIZE, OBJECT_SIZE)
  interactableGfx.destroy()

  // Interactable active: amber/gold with bright inner highlight and white border
  const interactableActiveGfx = scene.make.graphics({ x: 0, y: 0 })
  interactableActiveGfx.fillStyle(0xffaa00)
  interactableActiveGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  interactableActiveGfx.fillStyle(0xffdd44)
  interactableActiveGfx.fillRect(4, 4, OBJECT_SIZE - 8, OBJECT_SIZE - 8)
  interactableActiveGfx.lineStyle(2, 0xffffff)
  interactableActiveGfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
  interactableActiveGfx.generateTexture('obj_interactable_active', OBJECT_SIZE, OBJECT_SIZE)
  interactableActiveGfx.destroy()

  // Background/decoration: muted green rounded rect
  const backgroundGfx = scene.make.graphics({ x: 0, y: 0 })
  backgroundGfx.fillStyle(0x8aab7a)
  backgroundGfx.fillRoundedRect(0, 0, OBJECT_SIZE, OBJECT_SIZE, 8)
  backgroundGfx.generateTexture('obj_background', OBJECT_SIZE, OBJECT_SIZE)
  backgroundGfx.destroy()

  // Table textures loaded from spritesheet in GameScene.preload()

  // Chair texture loaded from spritesheet in GameScene.preload()

  // Sign: brown post with tan sign board
  const signGfx = scene.make.graphics({ x: 0, y: 0 })
  signGfx.fillStyle(0x5a3e1b)
  signGfx.fillRect(13, 14, 6, 18)
  signGfx.fillStyle(0xd4c4a0)
  signGfx.fillRect(2, 2, 28, 14)
  signGfx.lineStyle(1, 0x3a2a10)
  signGfx.strokeRect(2, 2, 28, 14)
  signGfx.generateTexture('obj_sign', OBJECT_SIZE, OBJECT_SIZE)
  signGfx.destroy()

  // Stove textures loaded from spritesheet in GameScene.preload()

  // Counter: light brown surface
  const counterGfx = scene.make.graphics({ x: 0, y: 0 })
  counterGfx.fillStyle(0x9b8b6b)
  counterGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  counterGfx.fillStyle(0xb0a080)
  counterGfx.fillRect(2, 2, OBJECT_SIZE - 4, OBJECT_SIZE - 4)
  counterGfx.lineStyle(1, 0x7a6b4b)
  counterGfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
  counterGfx.generateTexture('obj_counter', OBJECT_SIZE, OBJECT_SIZE)
  counterGfx.destroy()

  // Food plate: small white circle (fits on table slots)
  const plateGfx = scene.make.graphics({ x: 0, y: 0 })
  plateGfx.fillStyle(0xffffff)
  plateGfx.fillCircle(16, 16, 6)
  plateGfx.lineStyle(1, 0xbbbbbb)
  plateGfx.strokeCircle(16, 16, 6)
  plateGfx.fillStyle(0xdddddd)
  plateGfx.fillCircle(16, 16, 3)
  plateGfx.generateTexture('obj_food_plate', OBJECT_SIZE, OBJECT_SIZE)
  plateGfx.destroy()

  // Trash: dark bin with open top
  const trashGfx = scene.make.graphics({ x: 0, y: 0 })
  trashGfx.fillStyle(0x4a5a4a)
  trashGfx.fillRect(6, 8, 20, 22)
  trashGfx.lineStyle(1, 0x333a33)
  trashGfx.strokeRect(6, 8, 20, 22)
  // Lid rim
  trashGfx.fillStyle(0x3a4a3a)
  trashGfx.fillRect(4, 6, 24, 4)
  // Open top highlight
  trashGfx.fillStyle(0x2a2a2a)
  trashGfx.fillRect(8, 10, 16, 4)
  trashGfx.generateTexture('obj_trash', OBJECT_SIZE, OBJECT_SIZE)
  trashGfx.destroy()

  // Drinking water: cooler body + cup
  const waterGfx = scene.make.graphics({ x: 0, y: 0 })
  waterGfx.fillStyle(0x3a5a7a)
  waterGfx.fillRect(4, 6, 24, 22)
  waterGfx.lineStyle(1, 0x2a4058)
  waterGfx.strokeRect(4, 6, 24, 22)
  waterGfx.fillStyle(0x5599cc)
  waterGfx.fillRect(8, 10, 16, 10)
  waterGfx.fillStyle(0x88ccff, 0.85)
  waterGfx.fillRect(18, 4, 8, 10)
  waterGfx.lineStyle(1, 0x6699bb)
  waterGfx.strokeRect(18, 4, 8, 10)
  waterGfx.generateTexture('obj_drinking_water', OBJECT_SIZE, OBJECT_SIZE)
  waterGfx.destroy()

  // Ghost: white semi-transparent square (tinted at runtime per type)
  const ghostGfx = scene.make.graphics({ x: 0, y: 0 })
  ghostGfx.fillStyle(0xffffff, 0.45)
  ghostGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  ghostGfx.generateTexture('obj_ghost', OBJECT_SIZE, OBJECT_SIZE)
  ghostGfx.destroy()
}
