/** ~70% of Nirvs use 0.2; remainder uniform in [0.01, 0.9]. */
export function sampleDehydrationRate(): number {
  if (Math.random() < 0.7) return 0.2
  return 0.01 + Math.random() * (0.9 - 0.01)
}

export const HYDRATION_START = 70
export const THIRST_THRESHOLD = 60
export const CRITICAL_HYDRATION_THRESHOLD = 30
