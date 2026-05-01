import Phaser from 'phaser'
import { getGridRect, gridToScreen, TILE_H, TILE_W } from '../utils/isoGrid'

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

  const rect = getGridRect(gridX, gridY, gridW, gridH)

  gfx.fillStyle(THEME.floor, 1)
  gfx.fillRect(rect.x, rect.y, rect.width, rect.height)

  gfx.lineStyle(1, THEME.grid, 0.35)
  for (let i = 0; i <= gridW; i++) {
    const x = rect.x + i * TILE_W
    gfx.lineBetween(x, rect.y, x, rect.y + rect.height)
  }
  for (let i = 0; i <= gridH; i++) {
    const y = rect.y + i * TILE_H
    gfx.lineBetween(rect.x, y, rect.x + rect.width, y)
  }

  gfx.fillStyle(THEME.platform, 1)
  gfx.fillRect(
    rect.x + TILE_W / 2,
    rect.y + TILE_H / 2,
    Math.max(0, rect.width - TILE_W),
    Math.max(0, rect.height - TILE_H),
  )

  gfx.lineStyle(2, THEME.accent, 0.9)
  gfx.strokeRect(rect.x, rect.y, rect.width, rect.height)

  const outer = getGridRect(gridX - 1, gridY - 1, gridW + 2, gridH + 2)
  gfx.lineStyle(2, THEME.grid, 0.95)
  gfx.strokeRect(outer.x, outer.y, outer.width, outer.height)

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
  gfx.setDepth(rect.y)
}
