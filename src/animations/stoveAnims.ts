import Phaser from 'phaser'

/** Row 3: stovetop / interior / roast — loop while cooking */
export const STOVE_ANIM_COOKING = 'stove_cooking'
/** Front view only: subtle idle between display off (0) and clock on (3) */
export const STOVE_ANIM_IDLE_FRONT = 'stove_idle_front'

export function registerStoveAnimations(scene: Phaser.Scene): void {
  if (!scene.textures.exists('furniture_stove')) return
  if (scene.anims.exists(STOVE_ANIM_COOKING)) return

  scene.anims.create({
    key: STOVE_ANIM_COOKING,
    frames: scene.anims.generateFrameNumbers('furniture_stove', { start: 9, end: 11 }),
    frameRate: 5,
    repeat: -1,
  })
  scene.anims.create({
    key: STOVE_ANIM_IDLE_FRONT,
    frames: [
      { key: 'furniture_stove', frame: 0 },
      { key: 'furniture_stove', frame: 3 },
    ],
    frameRate: 1.2,
    yoyo: true,
    repeat: -1,
  })
}

/** Idle: front uses 2-frame anim; other rotations use static row-0 frames. */
export function playStoveIdle(sprite: Phaser.GameObjects.Sprite, rotation: number): void {
  sprite.clearTint()
  if (rotation === 0 && sprite.scene.anims.exists(STOVE_ANIM_IDLE_FRONT)) {
    sprite.play(STOVE_ANIM_IDLE_FRONT)
  } else {
    sprite.anims.stop()
    sprite.setFrame(rotation)
  }
}
