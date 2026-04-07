import Phaser from 'phaser'
import type { ObjectType } from '../storage/persistence'
import type { ObjectTypeConfig } from './objectTypes'

/** Maps bed ObjectType to its left/right texture keys. */
export const BED_TEXTURE_MAP: Record<string, { left: string; right: string }> = {
  bed_ms_blue:  { left: 'bed_ms_blue_left',  right: 'bed_ms_blue_right' },
  bed_ms_red:   { left: 'bed_ms_red_left',   right: 'bed_ms_red_right' },
  bed_ms_grey:  { left: 'bed_ms_grey_left',  right: 'bed_ms_grey_right' },
  bed_ms_space: { left: 'bed_ms_space_left', right: 'bed_ms_space_right' },
  bed_ws_blue:  { left: 'bed_ws_blue_left',  right: 'bed_ws_blue_right' },
  bed_ws_red:   { left: 'bed_ws_red_left',   right: 'bed_ws_red_right' },
  bed_ws_grey:  { left: 'bed_ws_grey_left',  right: 'bed_ws_grey_right' },
  bed_ws_space: { left: 'bed_ws_space_left', right: 'bed_ws_space_right' },
}

/** Maps bed ObjectType to the Phaser preload asset paths. */
export const BED_ASSET_MAP: Record<string, { left: string; right: string }> = {
  bed_ms_blue:  { left: 'assets/Furniture/bed/modern single bed blue left.png',       right: 'assets/Furniture/bed/modern single bed blue right.png' },
  bed_ms_red:   { left: 'assets/Furniture/bed/modern single bed red left.png',        right: 'assets/Furniture/bed/modern single bed red right.png' },
  bed_ms_grey:  { left: 'assets/Furniture/bed/modern single bed grey blue left.png',  right: 'assets/Furniture/bed/modern single bed grey blue right.png' },
  bed_ms_space: { left: 'assets/Furniture/bed/modern single bed space left.png',      right: 'assets/Furniture/bed/modern single bed space right.png' },
  bed_ws_blue:  { left: 'assets/Furniture/bed/wood single bed blue left.png',         right: 'assets/Furniture/bed/wood single bed blue right.png' },
  bed_ws_red:   { left: 'assets/Furniture/bed/wood single bed red left.png',          right: 'assets/Furniture/bed/wood single bed red right.png' },
  bed_ws_grey:  { left: 'assets/Furniture/bed/wood single bed  grey blue left.png',   right: 'assets/Furniture/bed/wood single bed  grey blue right.png' },
  bed_ws_space: { left: 'assets/Furniture/bed/wood single bed space left.png',        right: 'assets/Furniture/bed/wood single bed space right.png' },
}

/** Load all bed left/right PNGs (16 images). Call from GameScene.preload. */
export function preloadBedAssets(scene: Phaser.Scene): void {
  for (const [bedType, paths] of Object.entries(BED_ASSET_MAP)) {
    const keys = BED_TEXTURE_MAP[bedType]
    if (!keys) continue
    scene.load.image(keys.left, paths.left)
    scene.load.image(keys.right, paths.right)
  }
}

export function isBedType(type: string): boolean {
  return type in BED_TEXTURE_MAP
}

export function getBedTextureKey(type: string, rotation: number): string {
  const entry = BED_TEXTURE_MAP[type]
  if (!entry) return 'obj_ghost'
  return rotation === 1 ? entry.right : entry.left
}

function bedConfig(type: ObjectType, label: string, previewColor: number): ObjectTypeConfig {
  return {
    type, label, description: 'A place for Nirvs to sleep',
    textureKey: BED_TEXTURE_MAP[type]?.left ?? 'obj_ghost',
    previewColor, depth: 2, hasPhysicsBody: false, isInteractable: false,
  }
}

export const BED_REGISTRY_ENTRIES: Record<string, ObjectTypeConfig> = {
  bed_ms_blue:  bedConfig('bed_ms_blue',  'Modern Bed (Blue)',  0x4466aa),
  bed_ms_red:   bedConfig('bed_ms_red',   'Modern Bed (Red)',   0xaa4444),
  bed_ms_grey:  bedConfig('bed_ms_grey',  'Modern Bed (Grey)',  0x6688aa),
  bed_ms_space: bedConfig('bed_ms_space', 'Modern Bed (Space)', 0x2a2a4e),
  bed_ws_blue:  bedConfig('bed_ws_blue',  'Wood Bed (Blue)',    0x4466aa),
  bed_ws_red:   bedConfig('bed_ws_red',   'Wood Bed (Red)',     0xaa4444),
  bed_ws_grey:  bedConfig('bed_ws_grey',  'Wood Bed (Grey)',    0x6688aa),
  bed_ws_space: bedConfig('bed_ws_space', 'Wood Bed (Space)',   0x2a2a4e),
}
