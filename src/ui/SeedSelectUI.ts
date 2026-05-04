import Phaser from 'phaser'
import { CROP_SEED_DEFINITIONS, type CropSeed, type CropSeedDefinition } from '../data/crops'

const PANEL_WIDTH = 360
const PANEL_HEIGHT = 292
const COLUMN_COUNT = 3
const CELL_W = 106
const ROW_H = 30

export class SeedSelectUI extends Phaser.GameObjects.Container {
  private onSelect: ((seed: CropSeed) => void) | null = null

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0)
    this.setDepth(25)
    this.build()
    this.setVisible(false)
    scene.add.existing(this)
  }

  open(onSelect: (seed: CropSeed) => void): void {
    this.onSelect = onSelect
    const cam = this.scene.cameras.main
    this.setPosition(cam.scrollX, cam.scrollY)
    this.setVisible(true)
  }

  close(): void {
    this.setVisible(false)
    this.onSelect = null
  }

  private build(): void {
    const overlay = this.scene.add.rectangle(
      this.scene.scale.width / 2,
      this.scene.scale.height / 2,
      this.scene.scale.width,
      this.scene.scale.height,
      0x000000,
      0.5,
    )
    overlay.setInteractive()
    overlay.on('pointerdown', () => this.close())
    this.add(overlay)

    const panel = this.scene.add.container(this.scene.scale.width / 2, this.scene.scale.height / 2)
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x1a1a2e, 0.95)
    bg.fillRoundedRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 10)
    bg.lineStyle(1, 0x444466)
    bg.strokeRoundedRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT / 2, PANEL_WIDTH, PANEL_HEIGHT, 10)

    const title = this.scene.add.text(0, -PANEL_HEIGHT / 2 + 14, 'Choose Seed', {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    panel.add([bg, title])
    CROP_SEED_DEFINITIONS.forEach((seed, index) => {
      panel.add(this.createSeedOption(seed, index))
    })
    this.add(panel)
  }

  private createSeedOption(seed: CropSeedDefinition, index: number): Phaser.GameObjects.GameObject[] {
    const col = index % COLUMN_COUNT
    const row = Math.floor(index / COLUMN_COUNT)
    const x = -PANEL_WIDTH / 2 + 22 + col * CELL_W
    const y = -PANEL_HEIGHT / 2 + 54 + row * ROW_H

    const dot = this.scene.add.graphics()
    dot.fillStyle(seed.previewColor)
    dot.fillCircle(x + 8, y + 11, 6)

    const label = this.scene.add.text(x + 20, y + 11, seed.label, {
      fontSize: '11px',
      color: '#ffffff',
    }).setOrigin(0, 0.5)

    const hitZone = this.scene.add.zone(x + CELL_W / 2 - 2, y + 11, CELL_W - 6, 24)
    hitZone.setInteractive({ useHandCursor: true })
    hitZone.on('pointerdown', () => {
      this.onSelect?.(seed.seed)
      this.close()
    })

    return [dot, label, hitZone]
  }
}
