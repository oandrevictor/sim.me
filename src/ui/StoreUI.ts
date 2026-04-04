import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, type ObjectType } from '../objects/objectTypes'

const PANEL_WIDTH = 230
const ROW_HEIGHT = 52
const PANEL_PADDING = 12
const ICON_RADIUS = 22

interface StoreEntry {
  label: string
  description: string
  previewColor: number
  action: () => void
}

export class StoreUI extends Phaser.GameObjects.Container {
  private panel!: Phaser.GameObjects.Container
  private bagIcon!: Phaser.GameObjects.Graphics
  private isPanelOpen = false

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y)
    this.buildBagIcon()
    this.buildPanel()
  }

  isPointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    // Only check against the bag icon area when panel is closed,
    // since getBounds() includes invisible children
    if (!this.isPanelOpen) {
      const bx = this.x
      const by = this.y
      const r = ICON_RADIUS + 4
      return Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, bx, by) < r
    }
    return this.getBounds().contains(pointer.worldX, pointer.worldY)
  }

  closePanel(): void {
    if (!this.isPanelOpen) return
    this.isPanelOpen = false
    this.panel.setVisible(false)
    this.refreshIconColor()
  }

  private buildBagIcon(): void {
    const gfx = this.scene.add.graphics()
    this.drawBagIcon(gfx, false)

    // invisible hit area circle
    const hitArea = this.scene.add.zone(0, 0, ICON_RADIUS * 2 + 8, ICON_RADIUS * 2 + 8)
    hitArea.setInteractive({ useHandCursor: true })
    hitArea.on('pointerdown', () => this.togglePanel())
    hitArea.on('pointerover', () => {
      this.bagIcon.clear()
      this.drawBagIcon(this.bagIcon, true)
    })
    hitArea.on('pointerout', () => {
      this.bagIcon.clear()
      this.drawBagIcon(this.bagIcon, false)
    })

    this.bagIcon = gfx
    this.add([gfx, hitArea])
  }

  private drawBagIcon(gfx: Phaser.GameObjects.Graphics, hovered: boolean): void {
    const color = hovered ? 0xffd700 : 0xddbb44
    // bag body
    gfx.fillStyle(color)
    gfx.fillRoundedRect(-ICON_RADIUS, -ICON_RADIUS + 8, ICON_RADIUS * 2, ICON_RADIUS * 2 - 8, 6)
    // bag handle
    gfx.lineStyle(3, color)
    gfx.strokeEllipse(0, -ICON_RADIUS + 4, ICON_RADIUS, 12)
    // label dot
    gfx.fillStyle(0x1a1a2e)
    gfx.fillCircle(0, 0, 4)
  }

  private buildPanel(): void {
    // Combine object types + building into a single list
    const entries: StoreEntry[] = Object.values(OBJECT_TYPE_REGISTRY)
      .filter(config => config.type !== 'food_plate')
      .map(config => ({
        label: config.label,
        description: config.description,
        previewColor: config.previewColor,
        action: () => this.selectType(config.type),
      }))

    // Add building entry
    entries.push({
      label: 'Building',
      description: '8×8 structure',
      previewColor: 0x6b5b3a,
      action: () => this.selectBuilding(),
    })

    const panelHeight = entries.length * ROW_HEIGHT + PANEL_PADDING * 2

    const container = this.scene.add.container(0, 0)

    // background
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x1a1a2e, 0.92)
    bg.fillRoundedRect(-PANEL_WIDTH / 2, -panelHeight - ICON_RADIUS - 8, PANEL_WIDTH, panelHeight, 10)
    bg.lineStyle(1, 0x444466)
    bg.strokeRoundedRect(-PANEL_WIDTH / 2, -panelHeight - ICON_RADIUS - 8, PANEL_WIDTH, panelHeight, 10)
    container.add(bg)

    // rows
    entries.forEach((entry, i) => {
      const rowY = -panelHeight - ICON_RADIUS - 8 + PANEL_PADDING + i * ROW_HEIGHT + ROW_HEIGHT / 2

      // swatch
      const swatch = this.scene.add.graphics()
      swatch.fillStyle(entry.previewColor)
      swatch.fillRect(-PANEL_WIDTH / 2 + PANEL_PADDING, rowY - 14, 28, 28)

      // label
      const label = this.scene.add.text(
        -PANEL_WIDTH / 2 + PANEL_PADDING + 36,
        rowY - 14,
        entry.label,
        { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }
      )

      // description
      const desc = this.scene.add.text(
        -PANEL_WIDTH / 2 + PANEL_PADDING + 36,
        rowY - 14 + 18,
        entry.description,
        { fontSize: '11px', color: '#aaaacc' }
      )

      // invisible hit zone for the row
      const hitZone = this.scene.add.zone(0, rowY, PANEL_WIDTH - PANEL_PADDING, ROW_HEIGHT - 4)
      hitZone.setInteractive({ useHandCursor: true })
      hitZone.on('pointerdown', () => entry.action())
      hitZone.on('pointerover', () => {
        swatch.clear()
        swatch.fillStyle(entry.previewColor, 1)
        swatch.fillRect(-PANEL_WIDTH / 2 + PANEL_PADDING - 2, rowY - 16, 32, 32)
      })
      hitZone.on('pointerout', () => {
        swatch.clear()
        swatch.fillStyle(entry.previewColor)
        swatch.fillRect(-PANEL_WIDTH / 2 + PANEL_PADDING, rowY - 14, 28, 28)
      })

      container.add([swatch, label, desc, hitZone])
    })

    container.setVisible(false)
    this.panel = container
    this.add(container)
  }

  private togglePanel(): void {
    this.isPanelOpen = !this.isPanelOpen
    this.panel.setVisible(this.isPanelOpen)
    this.refreshIconColor()
    this.scene.events.emit(this.isPanelOpen ? 'store:open' : 'store:close')
  }

  private selectType(type: ObjectType): void {
    this.isPanelOpen = false
    this.panel.setVisible(false)
    this.refreshIconColor()
    this.scene.events.emit('store:select', type)
  }

  private selectBuilding(): void {
    this.isPanelOpen = false
    this.panel.setVisible(false)
    this.refreshIconColor()
    this.scene.events.emit('store:select-building')
  }

  private refreshIconColor(): void {
    this.bagIcon.clear()
    this.drawBagIcon(this.bagIcon, this.isPanelOpen)
  }
}
