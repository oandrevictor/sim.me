import Phaser from 'phaser'
import { gridToScreen } from '../utils/isoGrid'
import { isInsideQuad } from '../utils/isoQuad'
import { computeStagePerformMarks } from '../utils/stagePerformLayout'

export const STAGE_GRID_W = 4
export const STAGE_GRID_H = 3

const THEME = {
  floor: 0x1a1a2e,
  platform: 0x2d2d4a,
  accent: 0xffd700,
  light1: 0xff6644,
  light2: 0x44aaff,
  grid: 0x3a3a5a,
}

export class Stage {
  readonly id: string
  readonly gridX: number
  readonly gridY: number
  readonly rotation: 0 | 1
  readonly graphics: Phaser.GameObjects.Graphics

  /** Effective width in grid cells (accounts for rotation) */
  get gridW(): number { return this.rotation === 0 ? STAGE_GRID_W : STAGE_GRID_H }
  /** Effective height in grid cells (accounts for rotation) */
  get gridH(): number { return this.rotation === 0 ? STAGE_GRID_H : STAGE_GRID_W }

  constructor(scene: Phaser.Scene, id: string, gridX: number, gridY: number, rotation: 0 | 1 = 0) {
    this.id = id
    this.gridX = gridX
    this.gridY = gridY
    this.rotation = rotation
    this.graphics = scene.add.graphics()
    this.draw()
  }

  /** Returns pixel positions of spots where Nirvs can stand and watch the stage */
  getWatchPositions(): { x: number; y: number }[] {
    const { gridX, gridY, gridW, gridH } = this
    const positions: { x: number; y: number }[] = []
    // Fan in front of stage (higher gridY)
    const frontY = gridY + gridH + 1
    for (let dx = -1; dx <= gridW; dx++) {
      positions.push(gridToScreen(gridX + dx, frontY))
      if (dx >= 0 && dx < gridW) {
        positions.push(gridToScreen(gridX + dx, frontY + 1))
      }
    }
    // Sides (one cell past the path barrier ring so spots stay reachable)
    for (let dy = 0; dy < gridH; dy++) {
      positions.push(gridToScreen(gridX - 2, gridY + dy))
      positions.push(gridToScreen(gridX + gridW + 1, gridY + dy))
    }
    return positions
  }

  /**
   * Pixel positions on the raised platform (inside the stage footprint) for acts.
   * Spread left→right on the audience-facing row, then back rows (see stagePerformLayout).
   */
  getPerformMarkPositions(performerCount: number): { x: number; y: number }[] {
    const { gridX, gridY, gridW, gridH } = this
    return computeStagePerformMarks(gridX, gridY, gridW, gridH, performerCount)
  }

  containsPixel(px: number, py: number): boolean {
    const { gridX, gridY, gridW, gridH } = this
    const tl = gridToScreen(gridX, gridY)
    const tr = gridToScreen(gridX + gridW, gridY)
    const br = gridToScreen(gridX + gridW, gridY + gridH)
    const bl = gridToScreen(gridX, gridY + gridH)
    return isInsideQuad(px, py, tl, tr, br, bl)
  }

  overlaps(otherGridX: number, otherGridY: number, w: number, h: number): boolean {
    return (
      this.gridX < otherGridX + w &&
      this.gridX + this.gridW > otherGridX &&
      this.gridY < otherGridY + h &&
      this.gridY + this.gridH > otherGridY
    )
  }

  private draw(): void {
    const { gridX, gridY, gridW, gridH } = this
    const gfx = this.graphics
    gfx.clear()

    const tl = gridToScreen(gridX, gridY)
    const tr = gridToScreen(gridX + gridW, gridY)
    const br = gridToScreen(gridX + gridW, gridY + gridH)
    const bl = gridToScreen(gridX, gridY + gridH)

    // Dark floor base
    gfx.fillStyle(THEME.floor, 1)
    gfx.beginPath()
    gfx.moveTo(tl.x, tl.y)
    gfx.lineTo(tr.x, tr.y)
    gfx.lineTo(br.x, br.y)
    gfx.lineTo(bl.x, bl.y)
    gfx.closePath()
    gfx.fillPath()

    // Inner grid
    gfx.lineStyle(1, THEME.grid, 0.35)
    for (let x = gridX; x <= gridX + gridW; x++) {
      const from = gridToScreen(x, gridY)
      const to = gridToScreen(x, gridY + gridH)
      gfx.lineBetween(from.x, from.y, to.x, to.y)
    }
    for (let y = gridY; y <= gridY + gridH; y++) {
      const from = gridToScreen(gridX, y)
      const to = gridToScreen(gridX + gridW, y)
      gfx.lineBetween(from.x, from.y, to.x, to.y)
    }

    // Raised platform (inner inset)
    const pi = 0.5
    const ptl = gridToScreen(gridX + pi, gridY + pi)
    const ptr = gridToScreen(gridX + gridW - pi, gridY + pi)
    const pbr = gridToScreen(gridX + gridW - pi, gridY + gridH - pi)
    const pbl = gridToScreen(gridX + pi, gridY + gridH - pi)

    gfx.fillStyle(THEME.platform, 1)
    gfx.beginPath()
    gfx.moveTo(ptl.x, ptl.y)
    gfx.lineTo(ptr.x, ptr.y)
    gfx.lineTo(pbr.x, pbr.y)
    gfx.lineTo(pbl.x, pbl.y)
    gfx.closePath()
    gfx.fillPath()

    // Gold border (platform)
    gfx.lineStyle(2, THEME.accent, 0.9)
    gfx.beginPath()
    gfx.moveTo(tl.x, tl.y)
    gfx.lineTo(tr.x, tr.y)
    gfx.lineTo(br.x, br.y)
    gfx.lineTo(bl.x, bl.y)
    gfx.closePath()
    gfx.strokePath()

    // Outer barrier footprint (ring around stage; gap not drawn — matches path entrance)
    const otl = gridToScreen(gridX - 1, gridY - 1)
    const otr = gridToScreen(gridX + gridW, gridY - 1)
    const obr = gridToScreen(gridX + gridW, gridY + gridH)
    const obl = gridToScreen(gridX - 1, gridY + gridH)
    gfx.lineStyle(2, THEME.grid, 0.95)
    gfx.beginPath()
    gfx.moveTo(otl.x, otl.y)
    gfx.lineTo(otr.x, otr.y)
    gfx.lineTo(obr.x, obr.y)
    gfx.lineTo(obl.x, obl.y)
    gfx.closePath()
    gfx.strokePath()

    // Stage lights along the top edge
    const numLights = gridW
    for (let i = 0; i < numLights; i++) {
      const lp = gridToScreen(gridX + i + 0.5, gridY + 0.5)
      const color = i % 2 === 0 ? THEME.light1 : THEME.light2
      gfx.fillStyle(color, 0.85)
      gfx.fillCircle(lp.x, lp.y, 3)
      gfx.lineStyle(1, 0xffffff, 0.4)
      gfx.strokeCircle(lp.x, lp.y, 3)
    }

    gfx.setDepth(1.6)
  }
}
