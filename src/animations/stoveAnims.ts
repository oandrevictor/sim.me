import Phaser from 'phaser'

/** Row 3: stovetop / interior / roast — loop while cooking (furniture_stove sheet only). */
export const STOVE_ANIM_COOKING = 'stove_cooking'
/** Front view only: subtle idle between display off (0) and clock on (3) */
export const STOVE_ANIM_IDLE_FRONT = 'stove_idle_front'

export const FURNITURE_STOVE_TEXTURE = 'furniture_stove'
const CLAY_OVEN_TEXTURE = 'white_clay_oven'

export function isSpritesheetStoveTexture(textureKey: string): boolean {
  return textureKey === FURNITURE_STOVE_TEXTURE
}

/** Single PNG clay oven: approximate 4-way facing with flips (no sheet frames). */
export function applySimpleStoveFacing(sprite: Phaser.GameObjects.Sprite, rotation: number): void {
  const r = ((rotation % 4) + 4) % 4
  sprite.setFlip(r === 1 || r === 2, r === 2 || r === 3)
}

export function registerStoveAnimations(scene: Phaser.Scene): void {
  if (!scene.textures.exists(FURNITURE_STOVE_TEXTURE)) return
  if (scene.anims.exists(STOVE_ANIM_COOKING)) return

  scene.anims.create({
    key: STOVE_ANIM_COOKING,
    frames: scene.anims.generateFrameNumbers(FURNITURE_STOVE_TEXTURE, { start: 9, end: 11 }),
    frameRate: 5,
    repeat: -1,
  })
  scene.anims.create({
    key: STOVE_ANIM_IDLE_FRONT,
    frames: [
      { key: FURNITURE_STOVE_TEXTURE, frame: 0 },
      { key: FURNITURE_STOVE_TEXTURE, frame: 3 },
    ],
    frameRate: 1.2,
    yoyo: true,
    repeat: -1,
  })
}

/**
 * Idle: classic stove uses sheet frames / idle anim; clay oven uses image + flips only
 * (never plays furniture_stove cooking/idle anims).
 */
export function playStoveIdle(sprite: Phaser.GameObjects.Sprite, rotation: number): void {
  sprite.clearTint()
  if (sprite.texture.key === CLAY_OVEN_TEXTURE) {
    sprite.anims.stop()
    applySimpleStoveFacing(sprite, rotation)
    return
  }
  if (rotation === 0 && sprite.scene.anims.exists(STOVE_ANIM_IDLE_FRONT)) {
    sprite.play(STOVE_ANIM_IDLE_FRONT)
  } else {
    sprite.anims.stop()
    sprite.setFrame(rotation)
  }
}
