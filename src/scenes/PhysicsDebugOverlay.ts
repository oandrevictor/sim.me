// @ts-nocheck
import { GRID_COLS, GRID_ROWS, WORLD_OFFSET_X, WORLD_OFFSET_Y } from '../config/world'
import { TILE_W, TILE_H } from '../utils/isoGrid'

export function drawPhysicsDebugOverlay(scene: any): void {
  const graphics = scene.physicsDebugGraphics
  if (scene.menuUI?.isPhysicsMode()) {
    graphics.clear()
    scene.pathfinder.debugDraw(graphics)

    graphics.lineStyle(1, 0xffffff, 0.3)
    for (let x = 0; x <= GRID_COLS; x++) {
      const px = x * TILE_W + WORLD_OFFSET_X
      graphics.lineBetween(px, WORLD_OFFSET_Y, px, GRID_ROWS * TILE_H + WORLD_OFFSET_Y)
    }
    for (let y = 0; y <= GRID_ROWS; y++) {
      const py = y * TILE_H + WORLD_OFFSET_Y
      graphics.lineBetween(WORLD_OFFSET_X, py, GRID_COLS * TILE_W + WORLD_OFFSET_X, py)
    }

    graphics.lineStyle(2, 0x00ff00, 0.8)
    graphics.fillStyle(0x00ff00, 0.2)
    scene.obstacleGroup.getChildren().forEach((child: any) => {
      const body = child.body
      if (!body) return
      graphics.fillRect(body.x, body.y, body.width, body.height)
      graphics.strokeRect(body.x, body.y, body.width, body.height)
    })

    graphics.lineStyle(2, 0x00ffff, 0.8)
    graphics.fillStyle(0x00ffff, 0.2)
    scene.nirvGroup.getChildren().forEach((child: any) => {
      const body = child.body
      if (!body) return
      graphics.fillRect(body.x, body.y, body.width, body.height)
      graphics.strokeRect(body.x, body.y, body.width, body.height)
    })
  } else {
    graphics.clear()
  }
}
