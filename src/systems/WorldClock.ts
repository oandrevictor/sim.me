const REAL_MS_PER_GAME_MINUTE = 1000
const MINUTES_PER_DAY = 24 * 60

export class WorldClock {
  private minuteOfDay: number
  private accumMs = 0
  private dayCount = 0

  constructor(startHour = 8, startMinute = 0) {
    this.minuteOfDay = (startHour * 60 + startMinute) % MINUTES_PER_DAY
  }

  update(deltaMs: number): number {
    this.accumMs += deltaMs
    let elapsed = 0
    while (this.accumMs >= REAL_MS_PER_GAME_MINUTE) {
      this.accumMs -= REAL_MS_PER_GAME_MINUTE
      const next = this.minuteOfDay + 1
      if (next >= MINUTES_PER_DAY) this.dayCount++
      this.minuteOfDay = next % MINUTES_PER_DAY
      elapsed++
    }
    return elapsed
  }

  getDayCount(): number {
    return this.dayCount
  }

  getMinuteOfDay(): number {
    return this.minuteOfDay
  }

  getLabel(): string {
    const hh = Math.floor(this.minuteOfDay / 60).toString().padStart(2, '0')
    const mm = (this.minuteOfDay % 60).toString().padStart(2, '0')
    return `${hh}:${mm}`
  }
}
