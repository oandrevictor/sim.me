import type Phaser from 'phaser'
import type { Stage } from '../entities/Stage'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { gridToScreen } from '../utils/isoGrid'

const barrierBodiesByStage = new WeakMap<Stage, Phaser.Physics.Arcade.Sprite[]>()

const BODY_SIZE = 14
const STEPS_PER_CELL = 2

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

function ensureWallTexture(scene: Phaser.Scene): string {
  const texKey = `__isowall_${BODY_SIZE}`
  if (!scene.textures.exists(texKey)) {
    const gfx = scene.make.graphics({ x: 0, y: 0 })
    gfx.fillStyle(0x000000, 0)
    gfx.fillRect(0, 0, BODY_SIZE, BODY_SIZE)
    gfx.generateTexture(texKey, BODY_SIZE, BODY_SIZE)
    gfx.destroy()
  }
  return texKey
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
  removeStageBarrier(stage, pathfinder)

  const { gridX: X, gridY: Y, gridW: W, gridH: H } = stage
  const texKey = ensureWallTexture(scene)
  const bodies: Phaser.Physics.Arcade.Sprite[] = []

  for (const c of getStageBorderCellsToBlock(stage)) {
    pathfinder.blockCell(c.gx, c.gy)
  }

  const addBody = (cx: number, cy: number) => {
    const wall = obstacleGroup.create(cx, cy, texKey) as Phaser.Physics.Arcade.Sprite
    wall.setVisible(false)
    wall.refreshBody()
    bodies.push(wall)
  }

  const addEdge = (
    sx: number, sy: number, ex: number, ey: number,
    cells: number,
    doorStart?: number, doorEnd?: number,
  ) => {
    const totalSteps = cells * STEPS_PER_CELL
    for (let i = 0; i <= totalSteps; i++) {
      const t = i / totalSteps
      if (doorStart !== undefined && doorEnd !== undefined) {
        const cellPos = t * cells
        if (cellPos >= doorStart && cellPos <= doorEnd) continue
      }
      addBody(sx + (ex - sx) * t, sy + (ey - sy) * t)
    }
  }

  const tl = gridToScreen(X - 1, Y - 1)
  const tr = gridToScreen(X + W, Y - 1)
  const br = gridToScreen(X + W, Y + H)
  const bl = gridToScreen(X - 1, Y + H)

  const topCells = W + 2
  const sideCells = H + 2
  const bottomCells = W + 2
  const entIx = getStageEntranceCells(stage).map((c) => c.gx - (X - 1))
  const doorStart = Math.min(...entIx)
  const doorEnd = Math.max(...entIx) + 1

  addEdge(tl.x, tl.y, tr.x, tr.y, topCells)
  addEdge(tr.x, tr.y, br.x, br.y, sideCells)
  addEdge(tl.x, tl.y, bl.x, bl.y, sideCells)
  // Same convention as Building.createWalls: inclusive [doorStart, doorEnd] in cellPos units
  addEdge(bl.x, bl.y, br.x, br.y, bottomCells, doorStart, doorEnd)

  barrierBodiesByStage.set(stage, bodies)
}

export function removeStageBarrier(stage: Stage, pathfinder: GridPathfinder): void {
  for (const c of getStageBorderCellsToBlock(stage)) {
    pathfinder.unblockCell(c.gx, c.gy)
  }
  for (const w of barrierBodiesByStage.get(stage) ?? []) {
    w.destroy()
  }
  barrierBodiesByStage.set(stage, [])
}
