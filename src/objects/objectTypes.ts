import type { ObjectType } from '../storage/persistence'
import { BED_REGISTRY_ENTRIES } from './bedTypes'

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

export const OBJECT_TYPE_REGISTRY = {
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
  floor_yellow: {
    type: 'floor_yellow',
    label: 'Floor (Yellow)',
    description: 'Yellow floor tile',
    textureKey: 'floor_yellow',
    previewColor: 0xf0c060,
    depth: 1,
    hasPhysicsBody: false,
    isInteractable: false,
  },
  drinking_water: {
    type: 'drinking_water',
    label: 'Drinking Water station',
    description: 'Nirvs drink here when thirsty',
    textureKey: 'water_station',
    previewColor: 0x4488cc,
    depth: 2,
    hasPhysicsBody: false,
    isInteractable: true,
  },
  ...BED_REGISTRY_ENTRIES,
} as Record<ObjectType, ObjectTypeConfig>

/** World uses scale 1.6; shop/inventory icons use ~1.1. */
export function getFramedObjectDisplaySize(type: ObjectType, scale: number): { w: number; h: number } {
  const c = OBJECT_TYPE_REGISTRY[type]
  const h = OBJECT_SIZE * scale
  const r = c.displayAspectWidthOverHeight ?? 1
  return { w: h * r, h }
}

export { generateObjectTextures } from './objectTextureGen'
