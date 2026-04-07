import type { MusicTag } from '../data/musicTags'

/** Jaccard similarity on tag sets → [0,1] */
export function affinityScore(
  interests: readonly MusicTag[],
  performanceTags: readonly MusicTag[],
): number {
  if (performanceTags.length === 0) return 0.22
  if (interests.length === 0) return 0.18
  const a = new Set(interests)
  const b = new Set(performanceTags)
  let inter = 0
  for (const t of a) {
    if (b.has(t)) inter++
  }
  const union = new Set([...a, ...b]).size
  return union === 0 ? 0 : inter / union
}

const ATTRACT_MIN = 0.07
const ATTRACT_MAX = 0.82

/** Roll whether a bot walks toward the stage this tick */
export function rollAttractedToStage(affinity: number): boolean {
  const p = Math.min(ATTRACT_MAX, Math.max(ATTRACT_MIN, 0.22 + affinity * 0.62))
  return Math.random() < p
}

const EARLY_LEAVE_MAX = 0.42

/** Roll whether an audience member leaves before the show ends */
export function rollLeaveEarly(affinity: number): boolean {
  const leaveP = Math.min(EARLY_LEAVE_MAX, (1 - affinity) * 0.38)
  return Math.random() < leaveP
}
