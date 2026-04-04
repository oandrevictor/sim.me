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

  // Ghost: white semi-transparent square (tinted at runtime per type)
  const ghostGfx = scene.make.graphics({ x: 0, y: 0 })
  ghostGfx.fillStyle(0xffffff, 0.45)
  ghostGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  ghostGfx.generateTexture('obj_ghost', OBJECT_SIZE, OBJECT_SIZE)
  ghostGfx.destroy()
}
