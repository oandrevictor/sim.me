import Phaser from 'phaser'
import {
  SOLO_STAGE_TEXTURE_KEY,
  type StageVariant,
  stageFootprint,
  stageMaxPerformers,
  STAGE_GRID_H,
  STAGE_GRID_W,
} from '../config/stageVariants'
import { drawDefaultStageGraphics } from './stageDefaultGraphics'
import { gridToScreen } from '../utils/isoGrid'
import { isInsideQuad } from '../utils/isoQuad'
import { layoutSoloStageSprite } from '../utils/soloStageSpriteLayout'
import {
  computeSoloPlatformPerformMarks,
  computeStagePerformMarks,
} from '../utils/stagePerformLayout'

export { STAGE_GRID_H, STAGE_GRID_W }

export class Stage {
  readonly id: string
  readonly gridX: number
  readonly gridY: number
  readonly rotation: 0 | 1
  readonly variant: StageVariant
  readonly graphics: Phaser.GameObjects.Graphics
  readonly sprite: Phaser.GameObjects.Sprite | null

  get gridW(): number {
    return stageFootprint(this.variant, this.rotation).w
  }
  get gridH(): number {
    return stageFootprint(this.variant, this.rotation).h
  }

  /** Solo sprite stage rejects bands in UI and runtime. */
  get soloOnly(): boolean {
    return this.variant === 'solo_platform'
  }

  get maxPerformerCount(): number {
    return stageMaxPerformers(this.variant)
  }

  constructor(
    scene: Phaser.Scene,
    id: string,
    gridX: number,
    gridY: number,
    rotation: 0 | 1 = 0,
    variant: StageVariant = 'default',
  ) {
    this.id = id
    this.gridX = gridX
    this.gridY = gridY
    this.rotation = rotation
    this.variant = variant
    this.graphics = scene.add.graphics()

    if (variant === 'solo_platform') {
      this.sprite = scene.add.sprite(0, 0, SOLO_STAGE_TEXTURE_KEY)
      layoutSoloStageSprite(this.sprite, gridX, gridY, this.gridW, this.gridH)
      this.graphics.setVisible(false)
    } else {
      this.sprite = null
      drawDefaultStageGraphics(this.graphics, gridX, gridY, this.gridW, this.gridH)
    }
  }

  getWatchPositions(): { x: number; y: number }[] {
    const { gridX, gridY, gridW, gridH } = this
    const positions: { x: number; y: number }[] = []
    const frontY = gridY + gridH + 1
    for (let dx = -1; dx <= gridW; dx++) {
      positions.push(gridToScreen(gridX + dx, frontY))
      if (dx >= 0 && dx < gridW) {
        positions.push(gridToScreen(gridX + dx, frontY + 1))
      }
    }
    for (let dy = 0; dy < gridH; dy++) {
      positions.push(gridToScreen(gridX - 2, gridY + dy))
      positions.push(gridToScreen(gridX + gridW + 1, gridY + dy))
    }
    return positions
  }

  getPerformMarkPositions(performerCount: number): { x: number; y: number }[] {
    const { gridX, gridY, gridW, gridH } = this
    if (this.variant === 'solo_platform') {
      return computeSoloPlatformPerformMarks(gridX, gridY, gridW, gridH)
    }
    return computeStagePerformMarks(gridX, gridY, gridW, gridH, performerCount)
  }

  containsPixel(px: number, py: number): boolean {
    const { gridX, gridY, gridW, gridH } = this
    const tl = gridToScreen(gridX, gridY)
    const tr = gridToScreen(gridX + gridW, gridY)
    const br = gridToScreen(gridX + gridW, gridY + gridH)
    const bl = gridToScreen(gridX, gridY + gridH)
    return isInsideQuad(px, py, tl, tr, br, bl)
  }

  overlaps(otherGridX: number, otherGridY: number, w: number, h: number): boolean {
    return (
      this.gridX < otherGridX + w &&
      this.gridX + this.gridW > otherGridX &&
      this.gridY < otherGridY + h &&
      this.gridY + this.gridH > otherGridY
    )
  }
}
