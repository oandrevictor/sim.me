/** Bladder fills over time; high level = needs bathroom. */

export const BLADDER_START = 80

/** Points added per game minute. */
export function sampleBladderIncreaseStep(): number {
  return 10 + Math.floor(Math.random() * 21)
}

/** When bladder_level reaches this, bots seek a toilet (non-urgent). */
export function sampleBladderThreshold(): number {
  return 60 + Math.floor(Math.random() * 40)
}
