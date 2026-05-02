import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'

const PANEL_W = 190
const HEADER_H = 26
const ROW_H = 18
const PAD = 8
const MAX_ROWS = 10

export class StuckNirvsOverlay {
  private container: Phaser.GameObjects.Container
  private bg: Phaser.GameObjects.Graphics
  private headerText: Phaser.GameObjects.Text
  private chevron: Phaser.GameObjects.Text
  private rowPool: Phaser.GameObjects.Text[]
  private collapsed = true
  private lastContentH = 0

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.container = scene.add.container(x, y)

    this.bg = scene.add.graphics()
    this.container.add(this.bg)

    this.chevron = scene.add.text(PANEL_W - PAD, HEADER_H / 2, '▶', {
      fontSize: '9px',
      color: '#7682a0',
    }).setOrigin(1, 0.5)
    this.container.add(this.chevron)

    this.headerText = scene.add.text(PAD, HEADER_H / 2, 'Stuck Nirvs', {
      fontSize: '11px',
      color: '#aeb8d4',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    this.container.add(this.headerText)

    this.rowPool = []
    for (let i = 0; i < MAX_ROWS; i++) {
      const row = scene.add.text(PAD, HEADER_H + PAD / 2 + i * ROW_H, '', {
        fontSize: '10px',
        color: '#d9e2ff',
      }).setVisible(false)
      this.container.add(row)
      this.rowPool.push(row)
    }

    const zone = scene.add.zone(PANEL_W / 2, HEADER_H / 2, PANEL_W, HEADER_H)
      .setInteractive({ useHandCursor: true })
    zone.on('pointerdown', () => { this.collapsed = !this.collapsed })
    this.container.add(zone)

    this.redrawBg(0)
  }

  refresh(bots: BotNirv[]): void {
    const stuck = bots
      .filter(b => b.getStuckCellCount() > 0)
      .sort((a, b) => b.getStuckCellCount() - a.getStuckCellCount())

    const count = stuck.length
    this.headerText.setText(count > 0 ? `Stuck Nirvs (${count})` : 'Stuck Nirvs')
    this.headerText.setColor(count > 0 ? '#ff9966' : '#aeb8d4')
    this.chevron.setText(this.collapsed ? '▶' : '▼')

    const visibleCount = !this.collapsed ? Math.min(count, MAX_ROWS) : 0
    for (let i = 0; i < MAX_ROWS; i++) {
      const row = this.rowPool[i]
      if (i < visibleCount) {
        row.setText(`${stuck[i].nirv.name}  ×${stuck[i].getStuckCellCount()}`)
        row.setVisible(true)
      } else {
        row.setVisible(false)
      }
    }

    const contentH = visibleCount > 0 ? visibleCount * ROW_H + PAD : 0
    if (contentH !== this.lastContentH) {
      this.lastContentH = contentH
      this.redrawBg(contentH)
    }
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y)
  }

  private redrawBg(contentH: number): void {
    const h = HEADER_H + contentH
    this.bg.clear()
    this.bg.fillStyle(0x151b2b, 0.88)
    this.bg.fillRoundedRect(0, 0, PANEL_W, h, 6)
    this.bg.lineStyle(1, 0x3a455f, 0.7)
    this.bg.strokeRoundedRect(0, 0, PANEL_W, h, 6)
  }
}
