import Phaser from 'phaser'
import { GRID_SIZE } from '../config/world'

const BUILDING_GRID_W = 8
const BUILDING_GRID_H = 8
const FLOOR_COLOR = 0x6b5b3a
const WALL_COLOR = 0x4a3d28
const DOOR_COLOR = 0x8b7355

export { BUILDING_GRID_W, BUILDING_GRID_H }

export class Building {
  readonly id: string
  readonly gridX: number
  readonly gridY: number
  readonly graphics: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, id: string, gridX: number, gridY: number) {
    this.id = id
    this.gridX = gridX
    this.gridY = gridY

    const px = gridX * GRID_SIZE
    const py = gridY * GRID_SIZE
    const pw = BUILDING_GRID_W * GRID_SIZE
    const ph = BUILDING_GRID_H * GRID_SIZE

    const gfx = scene.add.graphics()

    // Floor
    gfx.fillStyle(FLOOR_COLOR, 0.85)
    gfx.fillRect(px, py, pw, ph)

    // Inner grid lines (subtle)
    gfx.lineStyle(1, 0x5a4c30, 0.3)
    for (let x = px; x <= px + pw; x += GRID_SIZE) gfx.lineBetween(x, py, x, py + ph)
    for (let y = py; y <= py + ph; y += GRID_SIZE) gfx.lineBetween(px, y, px + pw, y)

    // Wall border
    gfx.lineStyle(3, WALL_COLOR)
    gfx.strokeRect(px, py, pw, ph)

    // Door marker (centered on bottom wall)
    const doorW = GRID_SIZE * 2
    const doorX = px + (pw - doorW) / 2
    gfx.fillStyle(DOOR_COLOR)
    gfx.fillRect(doorX, py + ph - 3, doorW, 6)

    gfx.setDepth(1.5) // between background(1) and obstacles(2)
    this.graphics = gfx
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
