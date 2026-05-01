const GAME_MINUTES_PER_OLD_REAL_MINUTE = 60

/** ~70% of Nirvs use the old 0.2-per-real-minute rate, scaled to game minutes. */
export function sampleDehydrationRate(): number {
  if (Math.random() < 0.7) return 0.2 / GAME_MINUTES_PER_OLD_REAL_MINUTE
  return (0.01 + Math.random() * (0.9 - 0.01)) / GAME_MINUTES_PER_OLD_REAL_MINUTE
}

export const HYDRATION_START = 70
export const THIRST_THRESHOLD = 60
export const CRITICAL_HYDRATION_THRESHOLD = 30
