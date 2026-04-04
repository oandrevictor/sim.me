import Phaser from 'phaser'
import { RECIPES } from '../data/recipes'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../config/world'

const PANEL_WIDTH = 220
const ROW_HEIGHT = 48
const PANEL_PADDING = 12

export class RecipeSelectUI extends Phaser.GameObjects.Container {
  private overlay!: Phaser.GameObjects.Rectangle
  private panel!: Phaser.GameObjects.Container
  private onSelectCallback: ((recipeId: string) => void) | null = null

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0)
    this.setDepth(25)
    this.build()
    this.setVisible(false)
    scene.add.existing(this)
  }

  open(onSelect: (recipeId: string) => void): void {
    this.onSelectCallback = onSelect
    const cam = this.scene.cameras.main
    this.setPosition(cam.scrollX, cam.scrollY)
    this.setVisible(true)
  }

  close(): void {
    this.setVisible(false)
    this.onSelectCallback = null
  }

  private build(): void {
    // Dark overlay
    this.overlay = this.scene.add.rectangle(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2,
      CANVAS_WIDTH, CANVAS_HEIGHT,
      0x000000, 0.5
    )
    this.overlay.setInteractive()
    this.overlay.on('pointerdown', () => this.close())
    this.add(this.overlay)

    // Panel
    const panelHeight = RECIPES.length * ROW_HEIGHT + PANEL_PADDING * 2 + 32
    this.panel = this.scene.add.container(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)

    // Background
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x1a1a2e, 0.95)
    bg.fillRoundedRect(-PANEL_WIDTH / 2, -panelHeight / 2, PANEL_WIDTH, panelHeight, 10)
    bg.lineStyle(1, 0x444466)
    bg.strokeRoundedRect(-PANEL_WIDTH / 2, -panelHeight / 2, PANEL_WIDTH, panelHeight, 10)
    this.panel.add(bg)

    // Title
    const title = this.scene.add.text(0, -panelHeight / 2 + PANEL_PADDING + 4, 'Choose Recipe', {
      fontSize: '15px',
      color: '#ffffff',
      fontStyle: 'bold',
    })
    title.setOrigin(0.5, 0)
    this.panel.add(title)

    // Recipe rows
    RECIPES.forEach((recipe, i) => {
      const rowY = -panelHeight / 2 + 36 + PANEL_PADDING + i * ROW_HEIGHT + ROW_HEIGHT / 2

      const swatch = this.scene.add.graphics()
      swatch.fillStyle(recipe.color)
      swatch.fillCircle(-PANEL_WIDTH / 2 + PANEL_PADDING + 12, rowY, 10)

      const label = this.scene.add.text(
        -PANEL_WIDTH / 2 + PANEL_PADDING + 30, rowY - 12,
        recipe.label,
        { fontSize: '14px', color: '#ffffff' }
      )

      const timeText = this.scene.add.text(
        -PANEL_WIDTH / 2 + PANEL_PADDING + 30, rowY + 4,
        `${recipe.cookTimeMs / 1000}s to cook`,
        { fontSize: '11px', color: '#aaaacc' }
      )

      const hitZone = this.scene.add.zone(0, rowY, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT - 4)
      hitZone.setInteractive({ useHandCursor: true })
      hitZone.on('pointerdown', () => {
        if (this.onSelectCallback) {
          this.onSelectCallback(recipe.id)
        }
        this.close()
      })
      hitZone.on('pointerover', () => {
        swatch.clear()
        swatch.fillStyle(recipe.color, 1)
        swatch.fillCircle(-PANEL_WIDTH / 2 + PANEL_PADDING + 12, rowY, 12)
      })
      hitZone.on('pointerout', () => {
        swatch.clear()
        swatch.fillStyle(recipe.color)
        swatch.fillCircle(-PANEL_WIDTH / 2 + PANEL_PADDING + 12, rowY, 10)
      })

      this.panel.add([swatch, label, timeText, hitZone])
    })

    this.add(this.panel)
  }
}
