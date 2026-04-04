import Phaser from 'phaser'
import type { BuildingType } from '../storage/buildingPersistence'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../config/world'

const PANEL_WIDTH = 220
const ROW_HEIGHT = 48
const PANEL_PADDING = 12

interface TypeOption {
  type: BuildingType
  label: string
  color: number
}

const OPTIONS: TypeOption[] = [
  { type: 'empty', label: 'Empty Lot', color: 0x6b5b3a },
  { type: 'restaurant', label: 'Restaurant', color: 0x7a4a3a },
]

export class BuildingTypeUI extends Phaser.GameObjects.Container {
  private overlay!: Phaser.GameObjects.Rectangle
  private panel!: Phaser.GameObjects.Container
  private currentBuildingId: string | null = null
  private onSelect: ((buildingId: string, type: BuildingType) => void) | null = null

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0)
    this.setDepth(25)
    this.build()
    this.setVisible(false)
    scene.add.existing(this)
  }

  open(buildingId: string, _currentType: BuildingType, onSelect: (buildingId: string, type: BuildingType) => void): void {
    this.currentBuildingId = buildingId
    this.onSelect = onSelect
    this.updatePosition()
    this.setVisible(true)
  }

  close(): void {
    this.setVisible(false)
    this.currentBuildingId = null
    this.onSelect = null
  }

  private updatePosition(): void {
    const cam = this.scene.cameras.main
    this.setPosition(cam.scrollX, cam.scrollY)
  }

  private build(): void {
    // Dark overlay - click to dismiss
    this.overlay = this.scene.add.rectangle(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2,
      CANVAS_WIDTH, CANVAS_HEIGHT,
      0x000000, 0.5
    )
    this.overlay.setInteractive()
    this.overlay.on('pointerdown', () => this.close())
    this.add(this.overlay)

    // Panel
    const panelHeight = OPTIONS.length * ROW_HEIGHT + PANEL_PADDING * 2 + 32
    this.panel = this.scene.add.container(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)

    // Panel background
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x1a1a2e, 0.95)
    bg.fillRoundedRect(-PANEL_WIDTH / 2, -panelHeight / 2, PANEL_WIDTH, panelHeight, 10)
    bg.lineStyle(1, 0x444466)
    bg.strokeRoundedRect(-PANEL_WIDTH / 2, -panelHeight / 2, PANEL_WIDTH, panelHeight, 10)
    this.panel.add(bg)

    // Title
    const title = this.scene.add.text(0, -panelHeight / 2 + PANEL_PADDING + 4, 'Building Type', {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    title.setOrigin(0.5, 0)
    this.panel.add(title)

    // Options
    OPTIONS.forEach((opt, i) => {
      const rowY = -panelHeight / 2 + 36 + PANEL_PADDING + i * ROW_HEIGHT + ROW_HEIGHT / 2

      const swatch = this.scene.add.graphics()
      swatch.fillStyle(opt.color)
      swatch.fillRect(-PANEL_WIDTH / 2 + PANEL_PADDING, rowY - 12, 24, 24)

      const label = this.scene.add.text(
        -PANEL_WIDTH / 2 + PANEL_PADDING + 32, rowY - 8,
        opt.label,
        { fontSize: '14px', color: '#ffffff' }
      )

      const hitZone = this.scene.add.zone(0, rowY, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT - 4)
      hitZone.setInteractive({ useHandCursor: true })
      hitZone.on('pointerdown', () => {
        if (this.currentBuildingId && this.onSelect) {
          this.onSelect(this.currentBuildingId, opt.type)
        }
        this.close()
      })
      hitZone.on('pointerover', () => {
        swatch.clear()
        swatch.fillStyle(opt.color, 1)
        swatch.fillRect(-PANEL_WIDTH / 2 + PANEL_PADDING - 2, rowY - 14, 28, 28)
      })
      hitZone.on('pointerout', () => {
        swatch.clear()
        swatch.fillStyle(opt.color)
        swatch.fillRect(-PANEL_WIDTH / 2 + PANEL_PADDING, rowY - 12, 24, 24)
      })

      this.panel.add([swatch, label, hitZone])
    })

    this.add(this.panel)
  }
}
