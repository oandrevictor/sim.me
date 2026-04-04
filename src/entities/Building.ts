import Phaser from 'phaser'
import type { BuildingType } from '../storage/buildingPersistence'
import { gridToScreen, TILE_W, TILE_H } from '../utils/isoGrid'

export { type BuildingType }

const BUILDING_GRID_W = 8
const BUILDING_GRID_H = 8

const THEME = {
  empty: { floor: 0x6b5b3a, wall: 0x4a3d28, door: 0x8b7355, grid: 0x5a4c30 },
  restaurant: { floor: 0x7a4a3a, wall: 0x5a2a1a, door: 0x9b6b4b, grid: 0x6a3a2a },
} as const

export { BUILDING_GRID_W, BUILDING_GRID_H }

export class Building {
  readonly id: string
  readonly gridX: number
  readonly gridY: number
  readonly graphics: Phaser.GameObjects.Graphics
  private _type: BuildingType
  private wallBodies: Phaser.Physics.Arcade.Sprite[] = []

  get type(): BuildingType { return this._type }

  constructor(scene: Phaser.Scene, id: string, gridX: number, gridY: number, type: BuildingType = 'empty') {
    this.id = id
    this.gridX = gridX
    this.gridY = gridY
    this._type = type
    this.graphics = scene.add.graphics()
    this.draw()
  }

  /** Create wall collision bodies along the isometric edges */
  createWalls(scene: Phaser.Scene, obstacleGroup: Phaser.Physics.Arcade.StaticGroup): void {
    const gx = this.gridX
    const gy = this.gridY
    const w = BUILDING_GRID_W
    const h = BUILDING_GRID_H

    const WALL_THICK = 8

    const addWall = (cx: number, cy: number, bw: number, bh: number) => {
      const key = `__wall_${bw}x${bh}`
      if (!scene.textures.exists(key)) {
        const gfx = scene.make.graphics({ x: 0, y: 0 })
        gfx.fillStyle(0x000000, 0)
        gfx.fillRect(0, 0, bw, bh)
        gfx.generateTexture(key, bw, bh)
        gfx.destroy()
      }
      const wall = obstacleGroup.create(cx, cy, key) as Phaser.Physics.Arcade.Sprite
      wall.setVisible(false)
      wall.refreshBody()
      this.wallBodies.push(wall)
    }

    // Place wall bodies along each edge of the building perimeter
    // Top-right edge (gridX varies, gridY fixed at gy)
    for (let x = gx; x < gx + w; x++) {
      const pos = gridToScreen(x, gy)
      addWall(pos.x, pos.y, TILE_W * 0.6, WALL_THICK)
    }
    // Top-left edge (gridX fixed at gx, gridY varies)
    for (let y = gy; y < gy + h; y++) {
      const pos = gridToScreen(gx, y)
      addWall(pos.x, pos.y, WALL_THICK, TILE_H * 0.6)
    }
    // Bottom-right edge (gridX fixed at gx+w-1, gridY varies)
    for (let y = gy; y < gy + h; y++) {
      const pos = gridToScreen(gx + w - 1, y)
      addWall(pos.x, pos.y, WALL_THICK, TILE_H * 0.6)
    }
    // Bottom-left edge (gridX varies, gridY fixed at gy+h-1) — with door gap
    for (let x = gx; x < gx + w; x++) {
      if (x === gx + 3 || x === gx + 4) continue // door gap
      const pos = gridToScreen(x, gy + h - 1)
      addWall(pos.x, pos.y, TILE_W * 0.6, WALL_THICK)
    }
  }

  setType(type: BuildingType): void {
    this._type = type
    this.draw()
  }

  private draw(): void {
    const { gridX, gridY } = this
    const theme = THEME[this._type]
    const gfx = this.graphics
    gfx.clear()

    // Draw filled floor as isometric diamond
    const topLeft = gridToScreen(gridX, gridY)
    const topRight = gridToScreen(gridX + BUILDING_GRID_W, gridY)
    const bottomRight = gridToScreen(gridX + BUILDING_GRID_W, gridY + BUILDING_GRID_H)
    const bottomLeft = gridToScreen(gridX, gridY + BUILDING_GRID_H)

    gfx.fillStyle(theme.floor, 0.85)
    gfx.beginPath()
    gfx.moveTo(topLeft.x, topLeft.y)
    gfx.lineTo(topRight.x, topRight.y)
    gfx.lineTo(bottomRight.x, bottomRight.y)
    gfx.lineTo(bottomLeft.x, bottomLeft.y)
    gfx.closePath()
    gfx.fillPath()

    // Inner grid lines
    gfx.lineStyle(1, theme.grid, 0.3)
    for (let x = gridX; x <= gridX + BUILDING_GRID_W; x++) {
      const from = gridToScreen(x, gridY)
      const to = gridToScreen(x, gridY + BUILDING_GRID_H)
      gfx.lineBetween(from.x, from.y, to.x, to.y)
    }
    for (let y = gridY; y <= gridY + BUILDING_GRID_H; y++) {
      const from = gridToScreen(gridX, y)
      const to = gridToScreen(gridX + BUILDING_GRID_W, y)
      gfx.lineBetween(from.x, from.y, to.x, to.y)
    }

    // Wall border
    gfx.lineStyle(3, theme.wall)
    gfx.beginPath()
    gfx.moveTo(topLeft.x, topLeft.y)
    gfx.lineTo(topRight.x, topRight.y)
    gfx.lineTo(bottomRight.x, bottomRight.y)
    gfx.lineTo(bottomLeft.x, bottomLeft.y)
    gfx.closePath()
    gfx.strokePath()

    // Door marker on bottom-left edge (between gridX+3 and gridX+5)
    const doorStart = gridToScreen(gridX + 3, gridY + BUILDING_GRID_H)
    const doorEnd = gridToScreen(gridX + 5, gridY + BUILDING_GRID_H)
    gfx.lineStyle(4, theme.door)
    gfx.lineBetween(doorStart.x, doorStart.y, doorEnd.x, doorEnd.y)

    gfx.setDepth(1.5)
  }

  /** Check if a screen coordinate is inside this building */
  containsPixel(x: number, y: number): boolean {
    const { gridX, gridY } = this
    const topLeft = gridToScreen(gridX, gridY)
    const topRight = gridToScreen(gridX + BUILDING_GRID_W, gridY)
    const bottomRight = gridToScreen(gridX + BUILDING_GRID_W, gridY + BUILDING_GRID_H)
    const bottomLeft = gridToScreen(gridX, gridY + BUILDING_GRID_H)

    // Point-in-diamond test using cross products
    return this.isInsideQuad(x, y, topLeft, topRight, bottomRight, bottomLeft)
  }

  overlaps(otherGridX: number, otherGridY: number): boolean {
    const ax = this.gridX, ay = this.gridY
    const bx = otherGridX, by = otherGridY
    return (
      ax < bx + BUILDING_GRID_W &&
      ax + BUILDING_GRID_W > bx &&
      ay < by + BUILDING_GRID_H &&
      ay + BUILDING_GRID_H > by
    )
  }

  private isInsideQuad(
    px: number, py: number,
    a: {x:number,y:number}, b: {x:number,y:number},
    c: {x:number,y:number}, d: {x:number,y:number},
  ): boolean {
    const cross = (ox: number, oy: number, ax: number, ay: number, bx: number, by: number) =>
      (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)

    const d1 = cross(px, py, a.x, a.y, b.x, b.y)
    const d2 = cross(px, py, b.x, b.y, c.x, c.y)
    const d3 = cross(px, py, c.x, c.y, d.x, d.y)
    const d4 = cross(px, py, d.x, d.y, a.x, a.y)

    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0) || (d4 < 0)
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0) || (d4 > 0)
    return !(hasNeg && hasPos)
  }
}
