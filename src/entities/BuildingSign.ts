import Phaser from 'phaser'
import { BUILDING_GRID_W, BUILDING_GRID_H } from './Building'
import { gridToScreen } from '../utils/isoGrid'
import { DEPTH_UI } from '../config/world'

export class BuildingSign {
  readonly sprite: Phaser.GameObjects.Sprite
  readonly buildingId: string
  private hoverBg: Phaser.GameObjects.Graphics | null = null
  private hoverText: Phaser.GameObjects.Text | null = null
  private hoverLabelProvider: (() => string | null) | null = null

  constructor(scene: Phaser.Scene, buildingId: string, buildingGridX: number, buildingGridY: number) {
    this.buildingId = buildingId

    // Position: near the door (bottom edge of building diamond)
    const doorPos = gridToScreen(
      buildingGridX + Math.floor(BUILDING_GRID_W / 2),
      buildingGridY + BUILDING_GRID_H,
    )

    this.sprite = scene.add.sprite(doorPos.x + 20, doorPos.y + 10, 'obj_sign')
    this.sprite.setDepth(doorPos.y + 10)
    this.sprite.setInteractive({ useHandCursor: true })
    scene.add.text(this.sprite.x, this.sprite.y - 3, this.buildingNumber(buildingGridX, buildingGridY), {
      fontSize: '10px',
      color: '#1c170e',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(this.sprite.depth + 1)
    this.sprite.on('pointerover', () => this.showHover())
    this.sprite.on('pointerout', () => this.hideHover())
  }

  onClick(callback: (buildingId: string) => void): void {
    this.sprite.on('pointerdown', () => callback(this.buildingId))
  }

  setHoverLabelProvider(provider: () => string | null): void {
    this.hoverLabelProvider = provider
  }

  private buildingNumber(gridX: number, gridY: number): string {
    return `${gridX + 1}-${gridY + 1}`
  }

  private showHover(): void {
    const label = this.hoverLabelProvider?.()
    if (!label) return
    this.hideHover()
    const scene = this.sprite.scene
    this.hoverText = scene.add.text(this.sprite.x, this.sprite.y - 38, label, {
      fontSize: '11px',
      color: '#1b1b28',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH_UI + 9)
    const w = this.hoverText.width + 14
    const h = this.hoverText.height + 8
    this.hoverBg = scene.add.graphics().setDepth(DEPTH_UI + 8)
    this.hoverBg.fillStyle(0xfff8dc, 0.95)
    this.hoverBg.fillRoundedRect(this.sprite.x - w / 2, this.sprite.y - 42, w, h, 5)
    this.hoverBg.lineStyle(1, 0x7a6a48, 0.9)
    this.hoverBg.strokeRoundedRect(this.sprite.x - w / 2, this.sprite.y - 42, w, h, 5)
  }

  private hideHover(): void {
    this.hoverBg?.destroy()
    this.hoverText?.destroy()
    this.hoverBg = null
    this.hoverText = null
  }
}
