import Phaser from 'phaser'
import { OBJECT_SIZE } from '../objects/objectTypes'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { screenToGrid } from '../utils/isoGrid'

export function blockCellAt(pathfinder: GridPathfinder, x: number, y: number): void {
  const g = screenToGrid(x, y)
  pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
}

export function unblockCellAt(pathfinder: GridPathfinder, x: number, y: number): void {
  const g = screenToGrid(x, y)
  pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
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
  blockCellAt(pathfinder, x, y)
  return blocker
}
