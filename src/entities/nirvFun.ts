import type { MusicTag } from '../data/musicTags'

export const FUN_LEVEL_START = 80

/** Integer fun lost per game minute. */
export function sampleFunDecayStep(): number {
  return 1 + Math.floor(Math.random() * 20)
}

/** When fun falls to this or below, bots prioritize watching a performance (soft priority). */
export function sampleFunThreshold(): number {
  return Math.floor(Math.random() * 61)
}

/** True if the nirv shares at least one interest tag with the act. */
export function interestOverlapsPerformance(
  interests: readonly MusicTag[],
  performanceTags: readonly MusicTag[],
): boolean {
  if (performanceTags.length === 0 || interests.length === 0) return false
  const perf = new Set(performanceTags)
  for (const t of interests) {
    if (perf.has(t)) return true
  }
  return false
}
