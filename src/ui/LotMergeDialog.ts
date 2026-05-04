import Phaser from 'phaser'

const PANEL_W = 270
const PANEL_H = 130
const BUTTON_W = 92
const BUTTON_H = 30

export class LotMergeDialog extends Phaser.GameObjects.Container {
  private readonly overlay: Phaser.GameObjects.Rectangle
  private readonly panel: Phaser.GameObjects.Container
  private onMerge: (() => void) | null = null
  private onCancel: (() => void) | null = null

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0)
    this.setDepth(1000)
    this.setVisible(false)
    scene.add.existing(this)

    this.overlay = scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, 0x000000, 0.48)
      .setOrigin(0)
      .setInteractive()
    this.overlay.on('pointerdown', () => this.cancel())

    this.panel = scene.add.container(0, 0)
    const bg = scene.add.graphics()
    bg.fillStyle(0x151b2b, 0.97)
    bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 8)
    bg.lineStyle(1, 0x52617f, 0.9)
    bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 8)

    const title = scene.add.text(0, -44, 'Merge lots?', {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const body = scene.add.text(0, -17, 'This extension overlaps another lot.', {
      fontSize: '12px',
      color: '#b8c3dd',
    }).setOrigin(0.5)

    const merge = this.createButton('Merge', -54, 34, 0x3f6f52, () => this.merge())
    const cancel = this.createButton('Cancel', 54, 34, 0x463548, () => this.cancel())
    this.panel.add([bg, title, body, ...merge, ...cancel])
    this.add([this.overlay, this.panel])
    this.relayout()
    scene.scale.on('resize', () => this.relayout())
  }

  open(onMerge: () => void, onCancel: () => void): void {
    this.onMerge = onMerge
    this.onCancel = onCancel
    this.relayout()
    this.setVisible(true)
  }

  close(): void {
    this.setVisible(false)
    this.onMerge = null
    this.onCancel = null
  }

  private merge(): void {
    const callback = this.onMerge
    this.close()
    callback?.()
  }

  private cancel(): void {
    const callback = this.onCancel
    this.close()
    callback?.()
  }

  private relayout(): void {
    this.overlay.setSize(this.scene.scale.width, this.scene.scale.height)
    this.panel.setPosition(this.scene.scale.width / 2, this.scene.scale.height / 2)
  }

  private createButton(
    labelText: string,
    x: number,
    y: number,
    color: number,
    onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const bg = this.scene.add.graphics()
    bg.setPosition(x, y)
    bg.fillStyle(color, 0.92)
    bg.fillRoundedRect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H, 6)
    bg.lineStyle(1, 0xffffff, 0.12)
    bg.strokeRoundedRect(-BUTTON_W / 2, -BUTTON_H / 2, BUTTON_W, BUTTON_H, 6)

    const label = this.scene.add.text(x, y, labelText, {
      fontSize: '12px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const zone = this.scene.add.zone(x, y, BUTTON_W, BUTTON_H).setInteractive({ useHandCursor: true })
    zone.on('pointerdown', onClick)
    zone.on('pointerover', () => bg.setAlpha(0.78))
    zone.on('pointerout', () => bg.setAlpha(1))
    return [bg, label, zone]
  }
}
