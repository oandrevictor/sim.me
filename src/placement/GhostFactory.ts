import Phaser from 'phaser'
import { SOLO_STAGE_TEXTURE_KEY, stageFootprint, type StageVariant } from '../config/stageVariants'
import { OBJECT_TYPE_REGISTRY, OBJECT_SIZE, getFramedObjectDisplaySize, type ObjectType } from '../objects/objectTypes'
import { getBedTextureKey, isBedType } from '../objects/bedTypes'
import { BUILDING_GRID_W, BUILDING_GRID_H } from '../entities/Building'
import { TILE_W, TILE_H } from '../utils/isoGrid'
import { DEPTH_UI } from '../config/world'

/** Object types that support rotation (spritesheet with directional frames) */
export const ROTATABLE_TYPES: Set<ObjectType> = new Set(['chair', 'stove', 'stove_white_clay'])

export function createObjectGhost(
  scene: Phaser.Scene,
  type: ObjectType,
  rotation: number,
): Phaser.GameObjects.Sprite {
  const config = OBJECT_TYPE_REGISTRY[type]

  if (ROTATABLE_TYPES.has(type) && config.frame !== undefined) {
    const frame = type === 'stove_white_clay' ? config.frame : config.frame + rotation
    const sprite = scene.add.sprite(0, 0, config.textureKey, frame)
    const { w, h } = getFramedObjectDisplaySize(type, 1.6)
    sprite.setDisplaySize(w, h)
    sprite.setAlpha(0.65)
    sprite.setDepth(DEPTH_UI + 10)
    return sprite
  }

  if (isBedType(type)) {
    const r = rotation % 2
    const sprite = scene.add.sprite(0, 0, getBedTextureKey(type, r))
    const displayH = OBJECT_SIZE * 2.2
    sprite.setDisplaySize(displayH * 1.45, displayH)
    sprite.setAlpha(0.65)
    sprite.setDepth(DEPTH_UI + 10)
    return sprite
  }

  if (type === 'floor_yellow') {
    const sprite = scene.add.sprite(0, 0, config.textureKey)
    sprite.setDisplaySize(TILE_W, TILE_H)
    sprite.setAlpha(0.55)
    sprite.setDepth(DEPTH_UI + 10)
    return sprite
  }

  if (type === 'snack_machine' && scene.textures.exists(config.textureKey)) {
    const sprite = scene.add.sprite(0, 0, config.textureKey)
    const displayH = OBJECT_SIZE * 2.5
    const displayW = displayH * (450 / 555)
    sprite.setDisplaySize(displayW, displayH)
    sprite.setOrigin(0.5, 1)
    sprite.setAlpha(0.65)
    sprite.setDepth(DEPTH_UI + 10)
    return sprite
  }

  if (type === 'fruit_crate' && scene.textures.exists(config.textureKey)) {
    const sprite = scene.add.sprite(0, 0, config.textureKey)
    const { w, h } = getFramedObjectDisplaySize(type, 2.5)
    sprite.setDisplaySize(w, h)
    sprite.setOrigin(0.5, 1)
    sprite.setAlpha(0.65)
    sprite.setDepth(DEPTH_UI + 10)
    return sprite
  }

  const sprite = scene.add.sprite(0, 0, 'obj_ghost')
  sprite.setTint(config.previewColor)
  sprite.setAlpha(0.55)
  sprite.setDepth(DEPTH_UI + 10)
  return sprite
}

export function createBuildingGhost(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics()
  gfx.fillStyle(0x6b5b3a, 0.4)
  gfx.lineStyle(2, 0x4a3d28, 0.6)
  const hw = BUILDING_GRID_W * TILE_W / 2
  const hh = BUILDING_GRID_H * TILE_H / 2
  gfx.beginPath()
  gfx.moveTo(0, -hh)
  gfx.lineTo(hw, 0)
  gfx.lineTo(0, hh)
  gfx.lineTo(-hw, 0)
  gfx.closePath()
  gfx.fillPath()
  gfx.strokePath()
  gfx.setDepth(DEPTH_UI + 10)
  return gfx
}

export function createStageGhost(
  scene: Phaser.Scene,
  stageRotation: 0 | 1,
  variant: StageVariant = 'default',
): Phaser.GameObjects.GameObject {
  if (variant === 'solo_platform') {
    const sprite = scene.add.sprite(0, 0, SOLO_STAGE_TEXTURE_KEY)
    sprite.setAlpha(0.55)
    sprite.setDepth(DEPTH_UI + 10)
    return sprite
  }

  const { w: gw, h: gh } = stageFootprint(variant, stageRotation)

  // Local coordinate helper: converts a grid offset from the footprint's
  // top-left corner into screen coords relative to the footprint center.
  const cx = (gw - gh) * TILE_W / 4
  const cy = (gw + gh) * TILE_H / 4
  const lp = (dx: number, dy: number) => ({
    x: (dx - dy) * (TILE_W / 2) - cx,
    y: (dx + dy) * (TILE_H / 2) - cy,
  })

  const gfx = scene.add.graphics()
  gfx.setAlpha(0.7)
  gfx.setDepth(DEPTH_UI + 10)

  const tl = lp(0, 0), tr = lp(gw, 0), br = lp(gw, gh), bl = lp(0, gh)

  gfx.fillStyle(0x1a1a2e, 1)
  gfx.beginPath()
  gfx.moveTo(tl.x, tl.y)
  gfx.lineTo(tr.x, tr.y)
  gfx.lineTo(br.x, br.y)
  gfx.lineTo(bl.x, bl.y)
  gfx.closePath()
  gfx.fillPath()

  gfx.lineStyle(1, 0x3a3a5a, 0.35)
  for (let x = 0; x <= gw; x++) {
    const a = lp(x, 0), b = lp(x, gh)
    gfx.lineBetween(a.x, a.y, b.x, b.y)
  }
  for (let y = 0; y <= gh; y++) {
    const a = lp(0, y), b = lp(gw, y)
    gfx.lineBetween(a.x, a.y, b.x, b.y)
  }

  const pi = 0.5
  const ptl = lp(pi, pi), ptr = lp(gw - pi, pi)
  const pbr = lp(gw - pi, gh - pi), pbl = lp(pi, gh - pi)
  gfx.fillStyle(0x2d2d4a, 1)
  gfx.beginPath()
  gfx.moveTo(ptl.x, ptl.y)
  gfx.lineTo(ptr.x, ptr.y)
  gfx.lineTo(pbr.x, pbr.y)
  gfx.lineTo(pbl.x, pbl.y)
  gfx.closePath()
  gfx.fillPath()

  gfx.lineStyle(2, 0xffd700, 0.9)
  gfx.beginPath()
  gfx.moveTo(tl.x, tl.y)
  gfx.lineTo(tr.x, tr.y)
  gfx.lineTo(br.x, br.y)
  gfx.lineTo(bl.x, bl.y)
  gfx.closePath()
  gfx.strokePath()

  const lightColors = [0xff6644, 0x44aaff, 0xff6644, 0x44aaff]
  for (let i = 0; i < gw; i++) {
    const lpos = lp(i + 0.5, 0.5)
    gfx.fillStyle(lightColors[i % 4], 0.85)
    gfx.fillCircle(lpos.x, lpos.y, 3)
    gfx.lineStyle(1, 0xffffff, 0.4)
    gfx.strokeCircle(lpos.x, lpos.y, 3)
  }

  return gfx
}
