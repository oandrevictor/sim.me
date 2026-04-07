import Phaser from 'phaser'
import { gridToScreen } from '../utils/isoGrid'

const THEME = {
  floor: 0x1a1a2e,
  platform: 0x2d2d4a,
  accent: 0xffd700,
  light1: 0xff6644,
  light2: 0x44aaff,
  grid: 0x3a3a5a,
}

/** Procedural stage look — kept separate so `Stage` stays small with variant support. */
export function drawDefaultStageGraphics(
  gfx: Phaser.GameObjects.Graphics,
  gridX: number,
  gridY: number,
  gridW: number,
  gridH: number,
): void {
  gfx.clear()

  const tl = gridToScreen(gridX, gridY)
  const tr = gridToScreen(gridX + gridW, gridY)
  const br = gridToScreen(gridX + gridW, gridY + gridH)
  const bl = gridToScreen(gridX, gridY + gridH)

  gfx.fillStyle(THEME.floor, 1)
  gfx.beginPath()
  gfx.moveTo(tl.x, tl.y)
  gfx.lineTo(tr.x, tr.y)
  gfx.lineTo(br.x, br.y)
  gfx.lineTo(bl.x, bl.y)
  gfx.closePath()
  gfx.fillPath()

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

  gfx.lineStyle(2, THEME.accent, 0.9)
  gfx.beginPath()
  gfx.moveTo(tl.x, tl.y)
  gfx.lineTo(tr.x, tr.y)
  gfx.lineTo(br.x, br.y)
  gfx.lineTo(bl.x, bl.y)
  gfx.closePath()
  gfx.strokePath()

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

  const numLights = gridW
  for (let i = 0; i < numLights; i++) {
    const lp = gridToScreen(gridX + i + 0.5, gridY + 0.5)
    const color = i % 2 === 0 ? THEME.light1 : THEME.light2
    gfx.fillStyle(color, 0.85)
    gfx.fillCircle(lp.x, lp.y, 3)
    gfx.lineStyle(1, 0xffffff, 0.4)
    gfx.strokeCircle(lp.x, lp.y, 3)
  }

  // Depth at top vertex so Nirvs on the stage platform render above it
  const topY = Math.min(tl.y, tr.y)
  gfx.setDepth(topY)
}
