import type Phaser from 'phaser'
import type { Stage } from '../entities/Stage'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { createGridCellBlocker } from './gridCellBlockers'

const barrierBodiesByStage = new WeakMap<Stage, Phaser.Physics.Arcade.Sprite[]>()

/**
 * Bottom-ring tiles that stay walkable (audience → platform). Wide stages get two
 * adjacent cells so the gap matches player body (20×24) like Building door spans.
 */
export function getStageEntranceCells(stage: Stage): { gx: number; gy: number }[] {
  const { gridX: X, gridY: Y, gridW: W, gridH: H } = stage
  const gy = Y + H
  const g1 = X + Math.floor((W - 1) / 2)
  const g2 = X + Math.floor(W / 2)
  if (g1 === g2) return [{ gx: g1, gy }]
  return [
    { gx: Math.min(g1, g2), gy },
    { gx: Math.max(g1, g2), gy },
  ]
}

/** One-cell-thick ring outside the platform; interior stays walkable (performers). */
export function getStageBorderCellsToBlock(stage: Stage): { gx: number; gy: number }[] {
  const { gridX: X, gridY: Y, gridW: W, gridH: H } = stage
  const entranceKeys = new Set(
    getStageEntranceCells(stage).map((c) => `${c.gx},${c.gy}`),
  )
  const out: { gx: number; gy: number }[] = []
  const add = (gx: number, gy: number) => {
    if (entranceKeys.has(`${gx},${gy}`)) return
    out.push({ gx, gy })
  }
  for (let gx = X - 1; gx <= X + W; gx++) add(gx, Y - 1)
  for (let gx = X - 1; gx <= X + W; gx++) add(gx, Y + H)
  for (let gy = Y; gy <= Y + H - 1; gy++) {
    add(X - 1, gy)
    add(X + W, gy)
  }
  return out
}

/**
 * Pathfinder blocks + invisible static bodies (player collider). Idempotent if called twice.
 */
export function installStageBarrier(
  stage: Stage,
  pathfinder: GridPathfinder,
  scene: Phaser.Scene,
  obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
): void {
  removeStageBarrier(stage, pathfinder)  // no scene — caller handles the nav-changed event

  const bodies: Phaser.Physics.Arcade.Sprite[] = []

  for (const c of getStageBorderCellsToBlock(stage)) {
    pathfinder.blockWorldCell(c.gx, c.gy)
    bodies.push(createGridCellBlocker(scene, obstacleGroup, c.gx, c.gy))
  }

  barrierBodiesByStage.set(stage, bodies)
  scene.events.emit('world:nav-changed')
}

export function removeStageBarrier(stage: Stage, pathfinder: GridPathfinder, scene?: Phaser.Scene): void {
  for (const c of getStageBorderCellsToBlock(stage)) {
    pathfinder.unblockWorldCell(c.gx, c.gy)
  }
  for (const w of barrierBodiesByStage.get(stage) ?? []) {
    w.destroy()
  }
  barrierBodiesByStage.set(stage, [])
  scene?.events.emit('world:nav-changed')
}
