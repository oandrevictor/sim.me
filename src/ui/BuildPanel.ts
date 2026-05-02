import Phaser from 'phaser'
import type { LotType } from '../storage/lotPersistence'
import { LOT_COLORS } from '../world/BuildOverlayLayer'
import { createPanelBackground } from './components/Panel'
import { LotMergeDialog } from './LotMergeDialog'

export const BUILD_PANEL_WIDTH = 520
export const BUILD_PANEL_HEIGHT = 170
export const BUILD_BAR_HEIGHT = 44

const TOOL_W = 96
const TOOL_H = 58
const TYPE_W = 110
const TYPE_H = 34

export type BuildTool = 'lot' | 'wall' | 'path'

const TYPE_OPTIONS: { type: LotType; label: string }[] = [
  { type: 'residential', label: 'Residential' },
  { type: 'commercial', label: 'Commercial' },
  { type: 'public', label: 'Public area' },
]

export class BuildPanel {
  readonly container: Phaser.GameObjects.Container
  private selectedTool: BuildTool = 'lot'
  private selectedType: LotType = 'residential'
  private readonly toolButtons = new Map<BuildTool, { bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }>()
  private readonly typeButtons = new Map<LotType, { bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }>()
  private readonly mergeDialog: LotMergeDialog

  constructor(scene: Phaser.Scene, private readonly gameEvents: Phaser.Events.EventEmitter) {
    this.container = scene.add.container(0, -BUILD_BAR_HEIGHT - 6)
    this.container.setVisible(false)
    this.mergeDialog = new LotMergeDialog(scene)
    this.build(scene)
  }

  getSelectedLotType(): LotType {
    return this.selectedType
  }

  getSelectedTool(): BuildTool {
    return this.selectedTool
  }

  openMergePrompt(onMerge: () => void, onCancel: () => void): void {
    this.mergeDialog.open(onMerge, onCancel)
  }

  closeMergePrompt(): void {
    this.mergeDialog.close()
  }

  private build(scene: Phaser.Scene): void {
    const bg = createPanelBackground(
      scene, BUILD_PANEL_WIDTH, BUILD_PANEL_HEIGHT, -BUILD_PANEL_WIDTH / 2, -BUILD_PANEL_HEIGHT,
    )
    this.container.add(bg)
    this.buildToolButtons(scene)
    this.buildTypeButtons(scene)
    this.refreshToolButtons()
    this.refreshTypeButtons()
  }

  private buildToolButtons(scene: Phaser.Scene): void {
    this.buildToolButton(scene, 'lot', 'Lot', -BUILD_PANEL_WIDTH / 2 + 70, -BUILD_PANEL_HEIGHT + 58)
    this.buildToolButton(scene, 'wall', 'Wall', -BUILD_PANEL_WIDTH / 2 + 174, -BUILD_PANEL_HEIGHT + 58)
    this.buildToolButton(scene, 'path', 'Path', -BUILD_PANEL_WIDTH / 2 + 278, -BUILD_PANEL_HEIGHT + 58)
  }

  private buildToolButton(scene: Phaser.Scene, tool: BuildTool, labelText: string, x: number, y: number): void {
    const bg = scene.add.graphics()
    bg.setPosition(x, y)

    const icon = scene.add.graphics()
    icon.setPosition(x, y - 7)
    if (tool === 'lot') {
      icon.fillStyle(LOT_COLORS.residential, 0.8)
      icon.fillRect(-14, -8, 12, 12)
      icon.fillStyle(LOT_COLORS.commercial, 0.8)
      icon.fillRect(2, -8, 12, 12)
      icon.fillStyle(LOT_COLORS.public, 0.8)
      icon.fillRect(-6, 8, 12, 12)
    } else if (tool === 'wall') {
      icon.lineStyle(5, 0x8b7355, 1)
      icon.lineBetween(-18, 0, 18, 0)
      icon.lineStyle(2, 0xd8c3a5, 0.85)
      icon.lineBetween(-18, -3, 18, -3)
    } else {
      icon.fillStyle(0xb88245, 0.95)
      icon.fillRect(-18, -8, 36, 16)
      icon.lineStyle(2, 0x7a4f2a, 0.9)
      icon.strokeRect(-18, -8, 36, 16)
    }

    const label = scene.add.text(x, y + 18, labelText, {
      fontSize: '12px',
      color: '#ffe08a',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const zone = scene.add.zone(x, y, TOOL_W, TOOL_H).setInteractive({ useHandCursor: true })
    zone.on('pointerdown', () => {
      this.selectedTool = tool
      this.refreshToolButtons()
      this.gameEvents.emit('build:tool-select', tool)
    })
    this.container.add([bg, icon, label, zone])
    this.toolButtons.set(tool, { bg, label })
  }

  private buildTypeButtons(scene: Phaser.Scene): void {
    const startX = -BUILD_PANEL_WIDTH / 2 + 84
    const y = -BUILD_PANEL_HEIGHT + 126
    TYPE_OPTIONS.forEach((option, index) => {
      const x = startX + index * (TYPE_W + 10) + TYPE_W / 2
      const bg = scene.add.graphics()
      bg.setPosition(x, y)
      const swatch = scene.add.graphics()
      swatch.setPosition(x - TYPE_W / 2 + 17, y)
      swatch.fillStyle(LOT_COLORS[option.type], 0.95)
      swatch.fillCircle(0, 0, 5)
      const label = scene.add.text(x + 8, y, option.label, {
        fontSize: '12px',
        color: '#d9e2ff',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      const zone = scene.add.zone(x, y, TYPE_W, TYPE_H).setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => {
        this.selectedType = option.type
        this.refreshTypeButtons()
      })
      this.container.add([bg, swatch, label, zone])
      this.typeButtons.set(option.type, { bg, label })
    })
  }

  private refreshTypeButtons(): void {
    this.typeButtons.forEach((button, type) => {
      const selected = type === this.selectedType
      button.bg.clear()
      button.bg.fillStyle(selected ? 0x2e3b5e : 0x1b2338, selected ? 1 : 0.86)
      button.bg.fillRoundedRect(-TYPE_W / 2, -TYPE_H / 2, TYPE_W, TYPE_H, 6)
      button.bg.lineStyle(1, selected ? LOT_COLORS[type] : 0x323d59, selected ? 0.95 : 0.75)
      button.bg.strokeRoundedRect(-TYPE_W / 2, -TYPE_H / 2, TYPE_W, TYPE_H, 6)
      button.label.setColor(selected ? '#ffffff' : '#aeb8d4')
    })
  }

  private refreshToolButtons(): void {
    this.toolButtons.forEach((button, tool) => {
      const selected = tool === this.selectedTool
      button.bg.clear()
      button.bg.fillStyle(selected ? 0x27344d : 0x1b2338, selected ? 0.98 : 0.86)
      button.bg.fillRoundedRect(-TOOL_W / 2, -TOOL_H / 2, TOOL_W, TOOL_H, 7)
      button.bg.lineStyle(2, selected ? 0xf0c85a : 0x323d59, selected ? 0.92 : 0.75)
      button.bg.strokeRoundedRect(-TOOL_W / 2, -TOOL_H / 2, TOOL_W, TOOL_H, 7)
      button.label.setColor(selected ? '#ffe08a' : '#aeb8d4')
    })
  }
}
