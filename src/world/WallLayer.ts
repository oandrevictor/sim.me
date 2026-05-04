import Phaser from 'phaser'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { wallCellKey, type WallRecord } from '../storage/wallPersistence'
import { getGridRect, TILE_H, TILE_W } from '../utils/isoGrid'

const WALL_COLOR = 0x3f3329
const WALL_HIGHLIGHT = 0x7b654f
const WALL_THICKNESS = 4
const TEXTURE_KEY = `__wall_cell_blocker`

function ensureTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(TEXTURE_KEY)) return TEXTURE_KEY
  const gfx = scene.make.graphics({ x: 0, y: 0 })
  gfx.fillStyle(0x000000, 0)
  gfx.fillRect(0, 0, TILE_W, TILE_H)
  gfx.generateTexture(TEXTURE_KEY, TILE_W, TILE_H)
  gfx.destroy()
  return TEXTURE_KEY
}

export class WallLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly bodies = new Map<string, Phaser.Physics.Arcade.Sprite>()
  private readonly walls = new Map<string, WallRecord>()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
    private readonly pathfinder: GridPathfinder,
  ) {
    this.gfx = scene.add.graphics().setDepth(2.4)
  }

  setWalls(records: Iterable<WallRecord>): void {
    this.clear()
    for (const wall of records) this.addWall(wall)
    this.redraw()
  }

  destroy(): void {
    this.clear()
    this.gfx.destroy()
  }

  private clear(): void {
    for (const wall of this.walls.values()) {
      this.pathfinder.removeWorldWall(wall.gx, wall.gy, wall.side)
    }
    for (const body of this.bodies.values()) body.destroy()
    this.walls.clear()
    this.bodies.clear()
    this.gfx.clear()
  }

  private addWall(wall: WallRecord): void {
    const key = wallCellKey(wall)
    this.walls.set(key, wall)
    this.pathfinder.addWorldWall(wall.gx, wall.gy, wall.side)
    this.bodies.set(key, this.createBody(wall))
  }

  private createBody(wall: WallRecord): Phaser.Physics.Arcade.Sprite {
    const pos = wallBodyPosition(wall)
    const body = this.obstacleGroup.create(
      pos.cx, pos.cy, ensureTexture(this.scene),
    ) as Phaser.Physics.Arcade.Sprite
    body.setVisible(false)
    body.body!.setSize(pos.w, pos.h)
    body.refreshBody()
    return body
  }

  private redraw(): void {
    this.gfx.clear()
    // Shadow
    this.gfx.lineStyle(WALL_THICKNESS + 3, 0x1c1714, 0.42)
    for (const wall of this.walls.values()) this.strokeWall(wall)
    // Main wall
    this.gfx.lineStyle(WALL_THICKNESS, WALL_COLOR, 1)
    for (const wall of this.walls.values()) this.strokeWall(wall)
    // Highlight
    this.gfx.lineStyle(2, WALL_HIGHLIGHT, 0.8)
    for (const wall of this.walls.values()) this.strokeWall(wall)
  }

  private strokeWall(wall: WallRecord): void {
    const seg = wallSegmentEndpoints(wall)
    this.gfx.lineBetween(seg.ax, seg.ay, seg.bx, seg.by)
  }
}

/** Screen-space endpoints for drawing a wall segment inside its cell. */
function wallSegmentEndpoints(wall: WallRecord): { ax: number; ay: number; bx: number; by: number } {
  const rect = getGridRect(wall.gx, wall.gy)
  const half = WALL_THICKNESS / 2
  switch (wall.side) {
    case 'n': return { ax: rect.x, ay: rect.y + half, bx: rect.x + rect.width, by: rect.y + half }
    case 's': return { ax: rect.x, ay: rect.y + rect.height - half, bx: rect.x + rect.width, by: rect.y + rect.height - half }
    case 'w': return { ax: rect.x + half, ay: rect.y, bx: rect.x + half, by: rect.y + rect.height }
    case 'e': return { ax: rect.x + rect.width - half, ay: rect.y, bx: rect.x + rect.width - half, by: rect.y + rect.height }
  }
}

/** Physics body position and size for a wall inside its cell. */
function wallBodyPosition(wall: WallRecord): { cx: number; cy: number; w: number; h: number } {
  const rect = getGridRect(wall.gx, wall.gy)
  const half = WALL_THICKNESS / 2
  switch (wall.side) {
    case 'n': return { cx: rect.x + rect.width / 2, cy: rect.y + half, w: TILE_W, h: WALL_THICKNESS }
    case 's': return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height - half, w: TILE_W, h: WALL_THICKNESS }
    case 'w': return { cx: rect.x + half, cy: rect.y + rect.height / 2, w: WALL_THICKNESS, h: TILE_H }
    case 'e': return { cx: rect.x + rect.width - half, cy: rect.y + rect.height / 2, w: WALL_THICKNESS, h: TILE_H }
  }
}
