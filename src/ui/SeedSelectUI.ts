import Phaser from 'phaser'
import { CORN_SEED, type CropSeed } from '../data/crops'

const PANEL_WIDTH = 200
const PANEL_HEIGHT = 112

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

    const label = this.scene.add.text(-48, 22, 'Corn', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0, 0.5)
    const dot = this.scene.add.graphics()
    dot.fillStyle(0xf2c94c)
    dot.fillCircle(-64, 22, 7)

    const hitZone = this.scene.add.zone(0, 22, PANEL_WIDTH - 28, 38)
    hitZone.setInteractive({ useHandCursor: true })
    hitZone.on('pointerdown', () => {
      this.onSelect?.(CORN_SEED)
      this.close()
    })

    panel.add([bg, title, dot, label, hitZone])
    this.add(panel)
  }
}
