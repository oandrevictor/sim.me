/** Bladder comfort decays over time; low level = needs bathroom. */

export const BLADDER_START = 20
const GAME_MINUTES_PER_OLD_REAL_MINUTE = 60

/** Comfort points lost per game minute, preserving the old per-real-minute pacing. */
export function sampleBladderDecayStep(): number {
  return (10 + Math.floor(Math.random() * 21)) / GAME_MINUTES_PER_OLD_REAL_MINUTE
}

/** When comfort drops to this, bots seek a toilet (non-urgent). */
export function sampleBladderThreshold(): number {
  return Math.max(1, 100 - (60 + Math.floor(Math.random() * 40)))
}
