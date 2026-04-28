import type { CropSeed, CropStage } from '../storage/persistence'

export type { CropSeed, CropStage }

export const CORN_SEED: CropSeed = 'corn'
export const CROP_STAGE_ORDER: CropStage[] = ['empty', 'seeded', 'early', 'ready']
export const CROP_TEXTURE_KEY: Record<CropStage, string> = {
  empty: 'crop_empty',
  seeded: 'crop_seeded',
  early: 'crop_early',
  ready: 'crop_ready',
}

export const CROP_GROWTH_MS = {
  seededToEarly: 20_000,
  earlyToReady: 40_000,
}

export function cropStageLabel(stage: CropStage): string {
  switch (stage) {
    case 'empty': return 'Empty'
    case 'seeded': return 'Seeded'
    case 'early': return 'Early'
    case 'ready': return 'Ready'
  }
}
