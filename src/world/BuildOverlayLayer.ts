import Phaser from 'phaser'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import type { LotRecord, LotType } from '../storage/lotPersistence'
import { getTileCorners } from '../utils/isoGrid'

const GRID_COLOR = 0xc8d7ec
const PREVIEW_INVALID = 0xd95d5d

export const LOT_COLORS: Record<LotType, number> = {
  residential: 0x5f9f68,
  commercial: 0xd69b45,
  public: 0x4f8fd6,
}

/**
 * Renders the build-mode grid, persisted lot colors, and active lot preview.
 */
export class BuildOverlayLayer {
  private readonly lotGfx: Phaser.GameObjects.Graphics
  private readonly gridGfx: Phaser.GameObjects.Graphics
  private readonly previewGfx: Phaser.GameObjects.Graphics
  private lots: readonly LotRecord[] = []

  constructor(scene: Phaser.Scene) {
    this.lotGfx = scene.add.graphics().setDepth(0.45)
    this.gridGfx = scene.add.graphics().setDepth(0.5)
    this.previewGfx = scene.add.graphics().setDepth(0.55)
    this.drawGrid()
  }

  setVisible(visible: boolean): void {
    this.lotGfx.setVisible(visible)
    this.gridGfx.setVisible(visible)
    this.previewGfx.setVisible(visible)
  }

  setLots(lots: readonly LotRecord[]): void {
    this.lots = lots
    this.redrawLots()
  }

  clearPreview(): void {
    this.previewGfx.clear()
  }

  setPreview(cells: readonly string[], type: LotType, invalid: boolean): void {
    this.previewGfx.clear()
    const color = invalid ? PREVIEW_INVALID : LOT_COLORS[type]
    this.previewGfx.fillStyle(color, invalid ? 0.5 : 0.38)
    this.previewGfx.lineStyle(2, invalid ? PREVIEW_INVALID : color, 0.9)
    for (const key of cells) {
      const [gx, gy] = key.split(',').map(Number)
      this.drawCell(this.previewGfx, gx, gy)
    }
  }

  private redrawLots(): void {
    this.lotGfx.clear()
    for (const lot of this.lots) {
      const color = LOT_COLORS[lot.type]
      this.lotGfx.fillStyle(color, 0.24)
      this.lotGfx.lineStyle(1, color, 0.42)
      for (const cell of lot.cells) this.drawCell(this.lotGfx, cell.gx, cell.gy)
    }
  }

  private drawGrid(): void {
    this.gridGfx.clear()
    this.gridGfx.lineStyle(1, GRID_COLOR, 0.28)
    for (let gx = 0; gx < GRID_COLS; gx++) {
      for (let gy = 0; gy < GRID_ROWS; gy++) {
        const c = getTileCorners(gx, gy)
        this.gridGfx.lineBetween(c.top.x, c.top.y, c.right.x, c.right.y)
        this.gridGfx.lineBetween(c.right.x, c.right.y, c.bottom.x, c.bottom.y)
        this.gridGfx.lineBetween(c.bottom.x, c.bottom.y, c.left.x, c.left.y)
        this.gridGfx.lineBetween(c.left.x, c.left.y, c.top.x, c.top.y)
      }
    }
  }

  private drawCell(gfx: Phaser.GameObjects.Graphics, gx: number, gy: number): void {
    const c = getTileCorners(gx, gy)
    gfx.beginPath()
    gfx.moveTo(c.top.x, c.top.y)
    gfx.lineTo(c.right.x, c.right.y)
    gfx.lineTo(c.bottom.x, c.bottom.y)
    gfx.lineTo(c.left.x, c.left.y)
    gfx.closePath()
    gfx.fillPath()
    gfx.strokePath()
  }
}
