import Phaser from 'phaser'
import { OBJECT_SIZE } from '../objects/objectTypes'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { screenToCell } from '../utils/isoGrid'

/**
 * Block nav cells that correspond to the physical body footprint.
 * bodyW/bodyH are in pixels; we convert to nav cells and block the right area.
 */
export function blockNavCellsForArcadeBody(
  pathfinder: GridPathfinder,
  body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody,
): void {
  const min = screenToCell(body.x, body.y)
  const max = screenToCell(body.x + body.width - 0.01, body.y + body.height - 0.01)
  for (let gx = min.gx; gx <= max.gx; gx++) {
    for (let gy = min.gy; gy <= max.gy; gy++) {
      pathfinder.blockCell(gx, gy)
    }
  }
}

export function unblockNavCellsForArcadeBody(
  pathfinder: GridPathfinder,
  body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody,
): void {
  const min = screenToCell(body.x, body.y)
  const max = screenToCell(body.x + body.width - 0.01, body.y + body.height - 0.01)
  for (let gx = min.gx; gx <= max.gx; gx++) {
    for (let gy = min.gy; gy <= max.gy; gy++) {
      pathfinder.unblockCell(gx, gy)
    }
  }
}


export function createFootprintBlocker(
  obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
  pathfinder: GridPathfinder,
  x: number,
  y: number,
  footW: number,
  footH = OBJECT_SIZE / 2,
): Phaser.Physics.Arcade.Sprite {
  const blocker = obstacleGroup.create(x, y - footH / 2, '__DEFAULT') as Phaser.Physics.Arcade.Sprite
  blocker.setVisible(false)
  blocker.body!.setSize(Math.max(OBJECT_SIZE, footW), footH)
  blocker.body!.setOffset(16 - Math.max(OBJECT_SIZE, footW) / 2, 8)
  blocker.refreshBody()
  blockNavCellsForArcadeBody(pathfinder, blocker.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody)
  return blocker
}
