import Phaser from 'phaser'
import { DEPTH_UI } from '../config/world'
import { DEFAULT_CROP_SEED, cropSeedLabel, cropStageLabel } from '../data/crops'
import type { CropPlot } from '../systems/farmingTypes'

const NEAR_PLOT_PX = 48

export class CropPlotHover {
  private label: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    this.label = scene.add.text(0, 0, '', {
      fontSize: '13px',
      color: '#f0f0f5',
      backgroundColor: '#1e1e32e8',
      padding: { x: 8, y: 4 },
    })
    this.label.setOrigin(0.5, 1)
    this.label.setDepth(DEPTH_UI + 23)
    this.label.setVisible(false)
  }

  update(
    pointer: Phaser.Input.Pointer,
    plots: readonly CropPlot[],
    hide: boolean,
    assignedNameForBot: (botId: string) => string | null = () => null,
  ): boolean {
    if (hide) {
      this.label.setVisible(false)
      return false
    }

    const plot = this.findHoveredPlot(pointer, plots)
    if (!plot) {
      this.label.setVisible(false)
      return false
    }

    const plant = plot.stage === 'empty' ? 'None' : cropSeedLabel(plot.seed ?? DEFAULT_CROP_SEED)
    const assigned = plot.reservedBy ? assignedNameForBot(plot.reservedBy) ?? plot.reservedBy : 'None'
    this.label.setText(`Plant: ${plant}\nStage: ${cropStageLabel(plot.stage)}\nAssigned: ${assigned}`)
    this.label.setPosition(plot.x, plot.sprite.getBounds().top - 8)
    this.label.setVisible(true)
    return true
  }

  private findHoveredPlot(pointer: Phaser.Input.Pointer, plots: readonly CropPlot[]): CropPlot | null {
    let best: CropPlot | null = null
    let bestD = Infinity
    for (const plot of plots) {
      if (!plot.sprite.active || !plot.sprite.visible) continue
      if (!this.pointerHitsPlot(pointer, plot)) continue
      const d = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, plot.x, plot.y)
      if (d < bestD) {
        best = plot
        bestD = d
      }
    }
    return best
  }

  private pointerHitsPlot(pointer: Phaser.Input.Pointer, plot: CropPlot): boolean {
    if (plot.sprite.getBounds().contains(pointer.worldX, pointer.worldY)) return true
    return Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, plot.x, plot.y) < NEAR_PLOT_PX
  }
}
