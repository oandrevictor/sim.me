import Phaser from 'phaser'
import { GRID_SIZE } from '../config/world'
import type { BuildingType } from '../storage/buildingPersistence'

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

  get type(): BuildingType { return this._type }

  constructor(scene: Phaser.Scene, id: string, gridX: number, gridY: number, type: BuildingType = 'empty') {
    this.id = id
    this.gridX = gridX
    this.gridY = gridY
    this._type = type
    this.graphics = scene.add.graphics()
    this.draw()
  }

  setType(type: BuildingType): void {
    this._type = type
    this.draw()
  }

  private draw(): void {
    const { gridX, gridY } = this
    const theme = THEME[this._type]
    const px = gridX * GRID_SIZE
    const py = gridY * GRID_SIZE
    const pw = BUILDING_GRID_W * GRID_SIZE
    const ph = BUILDING_GRID_H * GRID_SIZE

    const gfx = this.graphics
    gfx.clear()

    // Floor
    gfx.fillStyle(theme.floor, 0.85)
    gfx.fillRect(px, py, pw, ph)

    // Inner grid lines (subtle)
    gfx.lineStyle(1, theme.grid, 0.3)
    for (let x = px; x <= px + pw; x += GRID_SIZE) gfx.lineBetween(x, py, x, py + ph)
    for (let y = py; y <= py + ph; y += GRID_SIZE) gfx.lineBetween(px, y, px + pw, y)

    // Wall border
    gfx.lineStyle(3, theme.wall)
    gfx.strokeRect(px, py, pw, ph)

    // Door marker (centered on bottom wall)
    const doorW = GRID_SIZE * 2
    const doorX = px + (pw - doorW) / 2
    gfx.fillStyle(theme.door)
    gfx.fillRect(doorX, py + ph - 3, doorW, 6)

    gfx.setDepth(1.5)
  }

  /** Check if a pixel coordinate is inside this building */
  containsPixel(x: number, y: number): boolean {
    const px = this.gridX * GRID_SIZE
    const py = this.gridY * GRID_SIZE
    const pw = BUILDING_GRID_W * GRID_SIZE
    const ph = BUILDING_GRID_H * GRID_SIZE
    return x >= px && x <= px + pw && y >= py && y <= py + ph
  }

  /** Check if another building's grid area overlaps with this one */
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
