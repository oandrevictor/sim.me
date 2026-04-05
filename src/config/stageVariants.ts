/** Procedural isometric stage vs. sprite-based solo deck (see `furniture_stage_solo`). */
export type StageVariant = 'default' | 'solo_platform'

export const STAGE_GRID_W = 4
export const STAGE_GRID_H = 3
/** Matches the wooden base in `stage-variant.png` (~4×4 tiles on the iso grid). */
export const STAGE_SOLO_PLATFORM_W = 4
export const STAGE_SOLO_PLATFORM_H = 4

export const SOLO_STAGE_TEXTURE_KEY = 'furniture_stage_solo'

export function stageFootprint(variant: StageVariant, rotation: 0 | 1): { w: number; h: number } {
  if (variant === 'solo_platform') {
    return rotation === 0
      ? { w: STAGE_SOLO_PLATFORM_W, h: STAGE_SOLO_PLATFORM_H }
      : { w: STAGE_SOLO_PLATFORM_H, h: STAGE_SOLO_PLATFORM_W }
  }
  return rotation === 0
    ? { w: STAGE_GRID_W, h: STAGE_GRID_H }
    : { w: STAGE_GRID_H, h: STAGE_GRID_W }
}

export function stageMaxPerformers(variant: StageVariant): number {
  return variant === 'solo_platform' ? 1 : 8
}
