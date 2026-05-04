import Phaser from 'phaser'
import { DEPTH_UI } from '../config/world'
import type { LotRecord, LotType } from '../storage/lotPersistence'
import { gridToScreen } from '../utils/isoGrid'

const TYPE_LABELS: Record<LotType, string> = {
  residential: 'Residential lot',
  commercial: 'Commercial lot',
  public: 'Public area',
}

export class LotSign {
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly text: Phaser.GameObjects.Text
  private hoverBg: Phaser.GameObjects.Graphics | null = null
  private hoverText: Phaser.GameObjects.Text | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lot: LotRecord,
    private readonly getOwnerName: (botId: string) => string | null,
  ) {
    const pos = lotSignPosition(lot)
    this.sprite = scene.add.sprite(pos.x + 18, pos.y + 10, 'obj_sign')
      .setScale(0.72)
      .setDepth(pos.y + 10)
      .setInteractive({ useHandCursor: true })
    this.text = scene.add.text(this.sprite.x, this.sprite.y - 2, this.shortLabel(), {
      fontSize: '8px',
      color: '#1c170e',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(this.sprite.depth + 1)
    this.sprite.on('pointerover', () => this.showHover())
    this.sprite.on('pointerout', () => this.hideHover())
  }

  setVisible(visible: boolean): void {
    this.sprite.setVisible(visible)
    this.text.setVisible(visible)
    if (!visible) this.hideHover()
  }

  destroy(): void {
    this.hideHover()
    this.sprite.destroy()
    this.text.destroy()
  }

  private shortLabel(): string {
    const cell = this.lot.cells[0]
    if (!cell) return 'L'
    return `L${cell.gx + 1}`
  }

  private showHover(): void {
    this.hideHover()
    const ownerId = this.lot.ownerBotIds?.[0] ?? this.lot.ownerBotId ?? null
    const owner = ownerId ? this.getOwnerName(ownerId) : null
    const label = owner ? `${TYPE_LABELS[this.lot.type]}\n${owner}'s home` : TYPE_LABELS[this.lot.type]
    this.hoverText = this.scene.add.text(this.sprite.x, this.sprite.y - 44, label, {
      fontSize: '11px',
      color: '#1b1b28',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5).setDepth(DEPTH_UI + 9)
    const w = this.hoverText.width + 14
    const h = this.hoverText.height + 8
    this.hoverBg = this.scene.add.graphics().setDepth(DEPTH_UI + 8)
    this.hoverBg.fillStyle(0xfff8dc, 0.95)
    this.hoverBg.fillRoundedRect(this.sprite.x - w / 2, this.sprite.y - 48, w, h, 5)
    this.hoverBg.lineStyle(1, 0x7a6a48, 0.9)
    this.hoverBg.strokeRoundedRect(this.sprite.x - w / 2, this.sprite.y - 48, w, h, 5)
  }

  private hideHover(): void {
    this.hoverBg?.destroy()
    this.hoverText?.destroy()
    this.hoverBg = null
    this.hoverText = null
  }
}

function lotSignPosition(lot: LotRecord): { x: number; y: number } {
  const cells = lot.cells
  const maxGY = Math.max(...cells.map(c => c.gy))
  const frontCells = cells.filter(c => c.gy === maxGY).sort((a, b) => a.gx - b.gx)
  const cell = frontCells[Math.floor(frontCells.length / 2)] ?? cells[0] ?? { gx: 0, gy: 0 }
  return gridToScreen(cell.gx, cell.gy)
}
