import type { CropSeed, CropStage } from '../storage/persistence'

export type { CropSeed, CropStage }

export const CORN_SEED: CropSeed = 'corn'
export const DEFAULT_CROP_SEED: CropSeed = CORN_SEED
export const CROP_STAGE_ORDER: CropStage[] = ['empty', 'seeded', 'early', 'ready']
export const CROP_TEXTURE_KEY: Record<CropStage, string> = {
  empty: 'crop_empty',
  seeded: 'crop_seeded',
  early: 'crop_early',
  ready: 'crop_ready',
}

export interface CropSeedDefinition {
  seed: CropSeed
  label: string
  assetPath: string
  previewColor: number
}

export const CROP_SEED_DEFINITIONS: readonly CropSeedDefinition[] = [
  { seed: 'corn', label: 'Corn', assetPath: 'assets/Farm/Crops_Growth_48x48/Corn_Growth_Stages_48x48.png', previewColor: 0xf2c94c },
  { seed: 'onion', label: 'Onion', assetPath: 'assets/Farm/Crops_Growth_48x48/Onion_Growth_Stages_48x48.png', previewColor: 0xd6c4f0 },
  { seed: 'wheat', label: 'Wheat', assetPath: 'assets/Farm/Crops_Growth_48x48/Wheat_Growth_Stages_48x48.png', previewColor: 0xe8c65a },
  { seed: 'pumpkin', label: 'Pumpkin', assetPath: 'assets/Farm/Crops_Growth_48x48/Pumpkin_Growth_Stages_48x48.png', previewColor: 0xf08a2e },
  { seed: 'pepper', label: 'Pepper', assetPath: 'assets/Farm/Crops_Growth_48x48/Pepper_Growth_Stages_48x48.png', previewColor: 0xd94f45 },
  { seed: 'coffee', label: 'Coffee', assetPath: 'assets/Farm/Crops_Growth_48x48/Coffee_Growth_Stages_48x48.png', previewColor: 0x8b5a2b },
  { seed: 'prickly_pear', label: 'Prickly Pear', assetPath: 'assets/Farm/Crops_Growth_48x48/Prickly_Pear_Growth_Stages_48x48.png', previewColor: 0x8fd16a },
  { seed: 'radish', label: 'Radish', assetPath: 'assets/Farm/Crops_Growth_48x48/Radish_Growth_Stages_48x48.png', previewColor: 0xe95f8a },
  { seed: 'cotton', label: 'Cotton', assetPath: 'assets/Farm/Crops_Growth_48x48/Cotton_Growth_Stages_48x48.png', previewColor: 0xf4f4ee },
  { seed: 'cabbage', label: 'Cabbage', assetPath: 'assets/Farm/Crops_Growth_48x48/Cabbage_Growth_Stages_48x48.png', previewColor: 0x85c56f },
  { seed: 'carrot', label: 'Carrot', assetPath: 'assets/Farm/Crops_Growth_48x48/Carrot_Growth_Stages_48x48.png', previewColor: 0xf39a35 },
  { seed: 'turnip', label: 'Turnip', assetPath: 'assets/Farm/Crops_Growth_48x48/Turnip_Growth_Stages_48x48.png', previewColor: 0xf0d8ff },
  { seed: 'cauliflower', label: 'Cauliflower', assetPath: 'assets/Farm/Crops_Growth_48x48/Cauliflower_Growth_Stages_48x48.png', previewColor: 0xf1efe0 },
  { seed: 'watermelon', label: 'Watermelon', assetPath: 'assets/Farm/Crops_Growth_48x48/Watermelon_Growth_Stages_48x48.png', previewColor: 0x4fbf62 },
  { seed: 'pineapple', label: 'Pineapple', assetPath: 'assets/Farm/Crops_Growth_48x48/Pineapple_Growth_Stages_48x48.png', previewColor: 0xf2c94c },
  { seed: 'grape', label: 'Grape', assetPath: 'assets/Farm/Crops_Growth_48x48/Grape_Growth_Stages_48x48.png', previewColor: 0x9460c9 },
  { seed: 'zuchini', label: 'Zuchini', assetPath: 'assets/Farm/Crops_Growth_48x48/Zuchini_Growth_Stages_48x48.png', previewColor: 0x5fa857 },
  { seed: 'tomato', label: 'Tomato', assetPath: 'assets/Farm/Crops_Growth_48x48/Tomato_Growth_Stages_48x48.png', previewColor: 0xe85045 },
  { seed: 'strawberry', label: 'Strawberry', assetPath: 'assets/Farm/Crops_Growth_48x48/Strawberry_Growth_Stages_48x48.png', previewColor: 0xe94764 },
]

export const CROP_SEEDS: readonly CropSeed[] = CROP_SEED_DEFINITIONS.map(def => def.seed)

export function cropTextureKey(stage: CropStage, seed: CropSeed = DEFAULT_CROP_SEED): string {
  if (stage === 'empty') return CROP_TEXTURE_KEY.empty
  return `crop_${seed}_${stage}`
}

export function cropSeedLabel(seed: CropSeed): string {
  return CROP_SEED_DEFINITIONS.find(def => def.seed === seed)?.label ?? 'Crop'
}

export function randomCropSeed(rng: () => number = Math.random): CropSeed {
  return CROP_SEEDS[Math.floor(rng() * CROP_SEEDS.length)] ?? DEFAULT_CROP_SEED
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
