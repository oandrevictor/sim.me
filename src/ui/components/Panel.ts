import Phaser from 'phaser'

/** Draws the standard dark-rounded panel background used across all UI dialogs. */
export function createPanelBackground(
  scene: Phaser.Scene,
  width: number,
  height: number,
  /** Top-left x relative to the container's origin */
  x = 0,
  /** Top-left y relative to the container's origin */
  y = 0,
): Phaser.GameObjects.Graphics {
  const gfx = scene.add.graphics()
  gfx.fillStyle(0x151b2b, 0.94)
  gfx.fillRoundedRect(x, y, width, height, 8)
  gfx.lineStyle(1, 0x3a455f, 0.8)
  gfx.strokeRoundedRect(x, y, width, height, 8)
  return gfx
}
