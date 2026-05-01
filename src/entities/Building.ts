import Phaser from 'phaser'
import type { StageInteriorBounds } from '../pathfinding/GridPathfinder'
import type { BuildingType } from '../storage/buildingPersistence'
import { gridToScreen } from '../utils/isoGrid'

export { type BuildingType }

const BUILDING_GRID_W = 8
const BUILDING_GRID_H = 8

const THEME = {
  empty: { floor: 0x6b5b3a, wall: 0x4a3d28, door: 0x8b7355, grid: 0x5a4c30 },
  restaurant: { floor: 0x7a4a3a, wall: 0x5a2a1a, door: 0x9b6b4b, grid: 0x6a3a2a },
  house: { floor: 0x5f7650, wall: 0x34482f, door: 0xb88954, grid: 0x46603c },
} as const

export { BUILDING_GRID_W, BUILDING_GRID_H }

export class Building {
  readonly id: string
  readonly gridX: number
  readonly gridY: number
  readonly graphics: Phaser.GameObjects.Graphics
  private _type: BuildingType
  private _ownerBotIds: string[] = []
  private wallBodies: Phaser.Physics.Arcade.Sprite[] = []

  get type(): BuildingType { return this._type }
  get ownerBotId(): string | null { return this._ownerBotIds[0] ?? null }
  get ownerBotIds(): readonly string[] { return this._ownerBotIds }

  /** Grid cells covered by this building footprint (clamped to world), for pathfinding staff inside the venue. */
  getInteriorPathBounds(gridCols: number, gridRows: number): StageInteriorBounds {
    const minGX = Math.max(0, this.gridX)
    const minGY = Math.max(0, this.gridY)
    const maxGX = Math.min(gridCols - 1, this.gridX + BUILDING_GRID_W - 1)
    const maxGY = Math.min(gridRows - 1, this.gridY + BUILDING_GRID_H - 1)
    return { minGX, maxGX, minGY, maxGY }
  }

  constructor(scene: Phaser.Scene, id: string, gridX: number, gridY: number, type: BuildingType = 'empty', ownerBotIds: string | string[] | null = null) {
    this.id = id
    this.gridX = gridX
    this.gridY = gridY
    this._type = type
    if (type === 'house' && ownerBotIds) {
      this._ownerBotIds = Array.isArray(ownerBotIds) ? [...ownerBotIds] : [ownerBotIds]
    }
    this.graphics = scene.add.graphics()
    this.draw()
  }

  /** Create wall collision bodies along the isometric edges */
  createWalls(scene: Phaser.Scene, obstacleGroup: Phaser.Physics.Arcade.StaticGroup): void {
    const gx = this.gridX
    const gy = this.gridY
    const w = BUILDING_GRID_W
    const h = BUILDING_GRID_H

    // Use small, densely-packed bodies along each diagonal edge line.
    // Player body is 20×24, so gaps < 20px are impassable.
    const BODY_SIZE = 14
    const STEPS_PER_CELL = 2 // spacing ≈ 17.9px, gap ≈ 3.9px

    const texKey = `__isowall_${BODY_SIZE}`
    if (!scene.textures.exists(texKey)) {
      const gfx = scene.make.graphics({ x: 0, y: 0 })
      gfx.fillStyle(0x000000, 0)
      gfx.fillRect(0, 0, BODY_SIZE, BODY_SIZE)
      gfx.generateTexture(texKey, BODY_SIZE, BODY_SIZE)
      gfx.destroy()
    }

    const addBody = (cx: number, cy: number) => {
      const wall = obstacleGroup.create(cx, cy, texKey) as Phaser.Physics.Arcade.Sprite
      wall.setVisible(false)
      wall.refreshBody()
      this.wallBodies.push(wall)
    }

    // Place bodies along a screen-space line, with optional door gap
    const addEdge = (
      sx: number, sy: number, ex: number, ey: number,
      cells: number, doorStart?: number, doorEnd?: number,
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

    // Visual edge endpoints (matches the drawn wall outline)
    const tl = gridToScreen(gx, gy)
    const tr = gridToScreen(gx + w, gy)
    const br = gridToScreen(gx + w, gy + h)
    const bl = gridToScreen(gx, gy + h)

    // Top edge: tl → tr
    addEdge(tl.x, tl.y, tr.x, tr.y, w)
    // Right edge: tr → br
    addEdge(tr.x, tr.y, br.x, br.y, h)
    // Bottom edge: bl → br (door gap at grid cells 3–5)
    addEdge(bl.x, bl.y, br.x, br.y, w, 3, 5)
    // Left edge: tl → bl
    addEdge(tl.x, tl.y, bl.x, bl.y, h)
  }

  setType(type: BuildingType): void {
    this._type = type
    if (type !== 'house') this._ownerBotIds = []
    this.draw()
  }

  setOwnerBotId(ownerBotId: string | null): void {
    if (this._type !== 'house') { this._ownerBotIds = []; return }
    this._ownerBotIds = ownerBotId ? [ownerBotId] : []
  }

  setOwnerBotIds(ids: readonly string[]): void {
    this._ownerBotIds = this._type === 'house' ? [...ids] : []
  }

  addOwnerBotId(id: string): void {
    if (this._type !== 'house') return
    if (!this._ownerBotIds.includes(id)) this._ownerBotIds.push(id)
  }

  removeOwnerBotId(id: string): void {
    this._ownerBotIds = this._ownerBotIds.filter(x => x !== id)
  }

  getDoorPosition(): { x: number; y: number } {
    return gridToScreen(this.gridX + Math.floor(BUILDING_GRID_W / 2), this.gridY + BUILDING_GRID_H)
  }

  getInteriorSpot(index = 0): { x: number; y: number } {
    const spots = [
      { gx: this.gridX + 4, gy: this.gridY + 5 },
      { gx: this.gridX + 3, gy: this.gridY + 4 },
      { gx: this.gridX + 5, gy: this.gridY + 4 },
      { gx: this.gridX + 4, gy: this.gridY + 3 },
    ]
    const spot = spots[index % spots.length]!
    return gridToScreen(spot.gx, spot.gy)
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
