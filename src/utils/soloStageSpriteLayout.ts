import { gridToScreen, TILE_H, TILE_W } from './isoGrid'

/**
 * Scale the sprite to the footprint bounding box, anchor bottom-center on the deck.
 */
export function layoutSoloStageSprite(
  sprite: Phaser.GameObjects.Sprite,
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
): void {
  const c0 = gridToScreen(gridX, gridY)
  const topLeft = { x: c0.x - TILE_W / 2, y: c0.y - TILE_H / 2 }
  const bboxW = gridW * TILE_W
  const bboxH = gridH * TILE_H
  const bottomCenter = { x: topLeft.x + bboxW / 2, y: topLeft.y + bboxH }

  const tw = sprite.frame.width || sprite.width
  const th = sprite.frame.height || sprite.height
  const s = Math.min(bboxW / tw, bboxH / th)
  sprite.setScale(s)
  sprite.setOrigin(0.5, 1)
  sprite.setPosition(bottomCenter.x, bottomCenter.y)
  sprite.setDepth(topLeft.y)
}
