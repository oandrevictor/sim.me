export const SATIATION_START = 70
export const CRITICAL_SATIATION = 10

/** Integer hunger lost per game minute. */
export function sampleHungerStep(): number {
  return 10 + Math.floor(Math.random() * 21)
}

/** When satiation falls to this or below, seek food (non-critical). */
export function sampleHungerThreshold(): number {
  return 50 + Math.floor(Math.random() * 26)
}
