import Phaser from 'phaser'
import type { StageInteriorBounds } from '../pathfinding/GridPathfinder'
import type { BuildingType } from '../storage/buildingPersistence'
import { getGridRect, gridToScreen, TILE_H, TILE_W } from '../utils/isoGrid'
import { createGridCellBlocker } from '../world/gridCellBlockers'

export { type BuildingType }

const BUILDING_GRID_W = 32
const BUILDING_GRID_H = 32

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

  /** Grid cells covered by this building footprint. */
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

  getWallCells(): { gx: number; gy: number }[] {
    const out: { gx: number; gy: number }[] = []
    const seen = new Set<string>()
    const add = (gx: number, gy: number) => {
      const key = `${gx},${gy}`
      if (seen.has(key)) return
      seen.add(key)
      out.push({ gx, gy })
    }
    const gx = this.gridX
    const gy = this.gridY
    for (let x = gx; x < gx + BUILDING_GRID_W; x++) add(x, gy)
    for (let x = gx; x < gx + BUILDING_GRID_W; x++) {
      if (x === gx + 3 || x === gx + 4) continue
      add(x, gy + BUILDING_GRID_H - 1)
    }
    for (let y = gy; y < gy + BUILDING_GRID_H; y++) add(gx, y)
    for (let y = gy; y < gy + BUILDING_GRID_H; y++) add(gx + BUILDING_GRID_W - 1, y)
    return out
  }

  /** Create wall collision bodies along the building perimeter */
  createWalls(scene: Phaser.Scene, obstacleGroup: Phaser.Physics.Arcade.StaticGroup): void {
    for (const body of this.wallBodies) body.destroy()
    this.wallBodies = []
    for (const cell of this.getWallCells()) {
      this.wallBodies.push(createGridCellBlocker(scene, obstacleGroup, cell.gx, cell.gy))
    }
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

    const rect = getGridRect(gridX, gridY, BUILDING_GRID_W, BUILDING_GRID_H)

    gfx.fillStyle(theme.floor, 0.85)
    gfx.fillRect(rect.x, rect.y, rect.width, rect.height)

    // Inner grid lines
    gfx.lineStyle(1, theme.grid, 0.3)
    for (let i = 0; i <= BUILDING_GRID_W; i++) {
      const x = rect.x + i * TILE_W
      gfx.lineBetween(x, rect.y, x, rect.y + rect.height)
    }
    for (let i = 0; i <= BUILDING_GRID_H; i++) {
      const y = rect.y + i * TILE_H
      gfx.lineBetween(rect.x, y, rect.x + rect.width, y)
    }

    // Wall border
    gfx.lineStyle(3, theme.wall)
    gfx.strokeRect(rect.x, rect.y, rect.width, rect.height)

    // Door marker on bottom edge (between gridX+3 and gridX+5)
    gfx.lineStyle(4, theme.door)
    gfx.lineBetween(rect.x + 3 * TILE_W, rect.y + rect.height, rect.x + 5 * TILE_W, rect.y + rect.height)

    gfx.setDepth(1.5)
  }

  /** Check if a screen coordinate is inside this building */
  containsPixel(x: number, y: number): boolean {
    const rect = getGridRect(this.gridX, this.gridY, BUILDING_GRID_W, BUILDING_GRID_H)
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height
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
}
