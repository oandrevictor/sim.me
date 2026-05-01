import type Phaser from 'phaser'
import { gridToScreen, TILE_H, TILE_W } from '../utils/isoGrid'

const TEXTURE_KEY = `__grid_cell_blocker_${TILE_W}_${TILE_H}`

function ensureTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEXTURE_KEY)) return TEXTURE_KEY
  const gfx = scene.make.graphics({ x: 0, y: 0 })
  gfx.fillStyle(0x000000, 0)
  gfx.fillRect(0, 0, TILE_W, TILE_H)
  gfx.generateTexture(TEXTURE_KEY, TILE_W, TILE_H)
  gfx.destroy()
  return TEXTURE_KEY
}

export function createGridCellBlocker(
  scene: Phaser.Scene,
  obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
  gx: number,
  gy: number,
): Phaser.Physics.Arcade.Sprite {
  const center = gridToScreen(gx, gy)
  const blocker = obstacleGroup.create(center.x, center.y, ensureTexture(scene)) as Phaser.Physics.Arcade.Sprite
  blocker.setVisible(false)
  blocker.body!.setSize(TILE_W, TILE_H)
  blocker.refreshBody()
  return blocker
}
