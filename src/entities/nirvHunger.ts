export const SATIATION_START = 70
export const CRITICAL_SATIATION = 20
const GAME_MINUTES_PER_OLD_REAL_MINUTE = 60

/** Hunger lost per game minute, preserving the old per-real-minute pacing. */
export function sampleHungerStep(): number {
  return (5 + Math.floor(Math.random() * 21)) / GAME_MINUTES_PER_OLD_REAL_MINUTE
}

/** When satiation falls to this or below, seek food (non-critical). */
export function sampleHungerThreshold(): number {
  return 50 + Math.floor(Math.random() * 26)
}
