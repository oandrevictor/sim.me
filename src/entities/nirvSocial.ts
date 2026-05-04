export const SOCIAL_NEED_START = 30
const GAME_MINUTES_PER_OLD_REAL_MINUTE = 60

/** Social goodness lost per game minute, preserving the old per-real-minute pacing. */
export function sampleSocialNeedDecayStep(): number {
  return (10 + Math.floor(Math.random() * 21)) / GAME_MINUTES_PER_OLD_REAL_MINUTE
}
