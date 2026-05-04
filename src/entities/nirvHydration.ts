const GAME_MINUTES_PER_OLD_REAL_MINUTE = 60

/** ~70% of Nirvs use a gentle 0.16-per-real-minute rate, scaled to game minutes. */
export function sampleDehydrationRate(): number {
  if (Math.random() < 0.7) return 0.16 / GAME_MINUTES_PER_OLD_REAL_MINUTE
  return (0.008 + Math.random() * (0.72 - 0.008)) / GAME_MINUTES_PER_OLD_REAL_MINUTE
}

export const HYDRATION_START = 70
export const THIRST_THRESHOLD = 60
export const CRITICAL_HYDRATION_THRESHOLD = 30
