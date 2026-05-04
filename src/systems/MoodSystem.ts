/** Composite mood state derived from all Nirv need levels. */
export type MoodState = 'happy' | 'neutral' | 'stressed' | 'miserable'

export interface MoodInput {
  hydration: number   // 0–100
  satiation: number   // 0–100
  rest: number        // 0–100
  fun: number         // 0–100
  social: number      // 0–100
  bladder: number     // 0–100 (100 = full/fine, 0 = urgent)
}

const HAPPY_THRESHOLD    = 72
const NEUTRAL_THRESHOLD  = 50
const STRESSED_THRESHOLD = 28

/**
 * Compute a composite mood from weighted need levels.
 *
 * Weights:
 *   hydration  25%  satiation 25%  rest  20%
 *   fun        15%  social    10%  bladder 5% (100 - bladder = used)
 */
export function computeMood(needs: MoodInput): MoodState {
  const bladderComfort = needs.bladder // 100 = fine, 0 = urgent
  const score =
    needs.hydration  * 0.25 +
    needs.satiation  * 0.25 +
    needs.rest       * 0.20 +
    needs.fun        * 0.15 +
    needs.social     * 0.10 +
    bladderComfort   * 0.05

  if (score >= HAPPY_THRESHOLD)    return 'happy'
  if (score >= NEUTRAL_THRESHOLD)  return 'neutral'
  if (score >= STRESSED_THRESHOLD) return 'stressed'
  return 'miserable'
}

/** Emoji representing the current mood. */
export function getMoodEmoji(mood: MoodState): string {
  switch (mood) {
    case 'happy':    return '😄'
    case 'neutral':  return '😐'
    case 'stressed': return '😟'
    case 'miserable': return '😩'
  }
}

/** Display label for the mood state. */
export function getMoodLabel(mood: MoodState): string {
  switch (mood) {
    case 'happy':    return 'Happy'
    case 'neutral':  return 'Neutral'
    case 'stressed': return 'Stressed'
    case 'miserable': return 'Miserable'
  }
}

/** Hex color string for rendering mood in UI. */
export function getMoodColor(mood: MoodState): string {
  switch (mood) {
    case 'happy':    return '#66dd88'
    case 'neutral':  return '#aab8cc'
    case 'stressed': return '#ffaa44'
    case 'miserable': return '#ff5555'
  }
}

/**
 * Additive modifier applied to social start chance.
 * Stressed/miserable bots are harder to start a chat with.
 */
export function getMoodSocialModifier(mood: MoodState): number {
  switch (mood) {
    case 'happy':    return  0.25
    case 'neutral':  return  0.00
    case 'stressed': return -0.25
    case 'miserable': return -0.55
  }
}

/**
 * Multiplier applied to work durations (cook time, farm work time).
 * Values > 1 mean slower; values < 1 mean faster.
 */
export function getMoodWorkModifier(mood: MoodState): number {
  switch (mood) {
    case 'happy':    return 0.85
    case 'neutral':  return 1.00
    case 'stressed': return 1.30
    case 'miserable': return 1.60
  }
}
