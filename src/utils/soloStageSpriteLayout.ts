import Phaser from 'phaser'
import { gridToScreen, TILE_W } from './isoGrid'

/**
 * Scale the sprite to match the iso diamond's width, anchor at the bottom vertex (br).
 * The rig/structure above the deck naturally overflows upward, which is correct for tall props.
 */
export function layoutSoloStageSprite(
  sprite: Phaser.GameObjects.Sprite,
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
): void {
  const br = gridToScreen(gridX + gridW + 1, gridY + gridH + 1)
  // Diamond bboxW = (gridW + gridH) * TILE_W/2, derived from the left/right vertices.
  const bboxW = (gridW + gridH) * (TILE_W / 2)
  const tw = sprite.frame.width || sprite.width
  const s = bboxW / tw
  console.log(br.x, br.y, s)
  sprite.setScale(s)
  sprite.setOrigin(0.5, 1)
  sprite.setPosition(br.x, br.y)
  // Depth at top vertex so Nirvs on stage render above the platform
  const tl = gridToScreen(gridX, gridY)
  const tr = gridToScreen(gridX + gridW, gridY)
  sprite.setDepth(Math.min(tl.y, tr.y))
}
