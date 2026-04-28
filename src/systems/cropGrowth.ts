import { CROP_GROWTH_MS, CROP_TEXTURE_KEY, type CropStage } from '../data/crops'
import { updatePlacedObjectAt } from '../storage/persistence'
import type { CropPlot } from './farmingTypes'

export function advanceCropGrowth(plot: CropPlot, now: number): boolean {
  if (!plot.stageStartedAt) return false
  let changed = false
  if (plot.stage === 'seeded' && now - plot.stageStartedAt >= CROP_GROWTH_MS.seededToEarly) {
    plot.stage = 'early'
    plot.stageStartedAt += CROP_GROWTH_MS.seededToEarly
    changed = true
  }
  if (plot.stage === 'early' && now - plot.stageStartedAt >= CROP_GROWTH_MS.earlyToReady) {
    plot.stage = 'ready'
    plot.stageStartedAt = undefined
    changed = true
  }
  if (changed) applyCropTexture(plot)
  return changed
}

export function applyCropTexture(plot: CropPlot): void {
  plot.sprite.setTexture(CROP_TEXTURE_KEY[plot.stage])
}

export function persistCropPlot(plot: CropPlot): void {
  updatePlacedObjectAt(plot.x, plot.y, 'crop', {
    cropStage: plot.stage,
    cropSeed: plot.seed,
    cropStageStartedAt: plot.stageStartedAt,
  })
}

export function countCropStages(plots: CropPlot[]): Record<CropStage, number> {
  const counts = { empty: 0, seeded: 0, early: 0, ready: 0 }
  for (const plot of plots) counts[plot.stage]++
  return counts
}
