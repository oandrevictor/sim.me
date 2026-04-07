export const SOCIAL_NEED_START = 70

/** Integer social need gained per game minute. */
export function sampleSocialNeedIncrementStep(): number {
  return 10 + Math.floor(Math.random() * 21)
}
