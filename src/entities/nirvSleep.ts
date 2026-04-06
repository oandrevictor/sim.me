export const REST_START = 100
export const CRITICAL_REST_THRESHOLD = 5
export const REST_DECAY_MIN = 3
export const REST_DECAY_MAX = 15

/** Random sleepy rate per Nirv: uniform in [0.7, 0.9]. */
export function sampleSleepyRate(): number {
  return 0.7 + Math.random() * 0.2
}

/** Random rest threshold per Nirv: integer in [10, 30]. */
export function sampleRestThreshold(): number {
  return 10 + Math.floor(Math.random() * 21)
}

/** Random sleep recharge per Nirv: integer in [9, 19]. */
export function sampleSleepRecharges(): number {
  return 9 + Math.floor(Math.random() * 11)
}
