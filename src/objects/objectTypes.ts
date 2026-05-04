import type { ObjectType } from '../storage/persistence'
import { OBJECT_TYPE_REGISTRY } from './objectRegistry'

export type { ObjectType }

export const GRID_SIZE = 40
export const OBJECT_SIZE = 32

export interface ObjectTypeConfig {
  type: ObjectType
  label: string
  description: string
  textureKey: string
  frame?: number
  displayAspectWidthOverHeight?: number
  previewColor: number
  depth: number
  hasPhysicsBody: boolean
  isInteractable: boolean
}

export { OBJECT_TYPE_REGISTRY }

/** World uses scale 1.6; shop/inventory icons use ~1.1. */
export function getFramedObjectDisplaySize(type: ObjectType, scale: number): { w: number; h: number } {
  const c = OBJECT_TYPE_REGISTRY[type]
  const h = OBJECT_SIZE * scale
  const r = c.displayAspectWidthOverHeight ?? 1
  return { w: h * r, h }
}

export { generateObjectTextures } from './objectTextureGen'
