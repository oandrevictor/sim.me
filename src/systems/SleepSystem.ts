import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import type { BotNirv } from '../entities/BotNirv'
import { CRITICAL_REST_THRESHOLD } from '../entities/nirvSleep'
import type { RestaurantSystem } from './RestaurantSystem'

const CHECK_INTERVAL_MS = 2000
const MINUTE_MS = 60_000
const STATION_REACH_PX = 32

interface BedStation {
  sprite: Phaser.GameObjects.Sprite
  x: number
  y: number
  occupant: BotNirv | null
}

export class SleepSystem {
  private beds: BedStation[] = []
  private bots: BotNirv[]
  private restaurant: RestaurantSystem
  private assignAccum = 0
  private minuteAccum = 0

  constructor(bots: BotNirv[], restaurant: RestaurantSystem) {
    this.bots = bots
    this.restaurant = restaurant
  }

  registerBed(sprite: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.beds.push({ sprite, x, y, occupant: null })
  }

  unregisterBed(sprite: Phaser.GameObjects.Sprite): void {
    const idx = this.beds.findIndex(b => b.sprite === sprite)
    if (idx === -1) return
    const st = this.beds[idx]
    if (st.occupant) {
      st.occupant.cancelSleep()
      st.occupant = null
    }
    this.beds.splice(idx, 1)
  }

  updateBeds(delta: number): void {
    this.minuteAccum += delta
    while (this.minuteAccum >= MINUTE_MS) {
      this.minuteAccum -= MINUTE_MS
      for (const st of this.beds) {
        const bot = st.occupant
        if (!bot || bot.state !== 'sleeping') continue
        bot.nirv.addRest(bot.nirv.sleepRecharges)
      }
    }

    this.repairBedOccupants()
    this.checkArrivals()
    this.releaseFinishedSleeping()

    this.assignAccum += delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryAssignSleepyBots()
  }

  /** Bot left sleep flow without finishSleeping (e.g. thirst interrupt). */
  private repairBedOccupants(): void {
    for (const st of this.beds) {
      if (!st.occupant) continue
      const b = st.occupant
      if (b.state !== 'walking_to_bed' && b.state !== 'sleeping') st.occupant = null
    }
  }

  private checkArrivals(): void {
    for (const st of this.beds) {
      if (!st.occupant) continue
      const bot = st.occupant
      if (bot.state !== 'walking_to_bed') continue
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
      if (d < STATION_REACH_PX) bot.arriveAtBed()
    }
  }

  private releaseFinishedSleeping(): void {
    for (const st of this.beds) {
      if (!st.occupant) continue
      const bot = st.occupant
      if (bot.state !== 'sleeping') continue
      if (bot.nirv.getRestLevel() < 100) continue
      bot.finishSleeping()
      st.occupant = null
    }
  }

  private findBedForBot(bot: BotNirv): BedStation | null {
    for (const st of this.beds) {
      if (st.occupant === bot) return st
    }
    return null
  }

  private tryAssignSleepyBots(): void {
    if (this.beds.length === 0) return

    for (const bot of this.bots) {
      const r = bot.nirv.getRestLevel()
      if (r > bot.nirv.restThreshold) continue
      if (this.findBedForBot(bot)) continue

      const stBot = bot.state
      if (stBot === 'walking_to_bed' || stBot === 'sleeping') continue
      if (stBot === 'walking_to_perform' || stBot === 'performing_on_stage') continue

      const critical = r <= CRITICAL_REST_THRESHOLD
      if (!critical) {
        if (stBot !== 'walking' && stBot !== 'waiting') continue
      } else {
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForHydration()
        else if (
          stBot === 'walking_to_water' ||
          stBot === 'walking_to_water_queue' ||
          stBot === 'waiting_at_water_queue' ||
          stBot === 'drinking_water'
        ) bot.cancelWaterQueue()
      }

      let best: BedStation | null = null
      let bestD = Infinity
      for (const st of this.beds) {
        if (st.occupant) continue
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
        if (d < TILE_W * 15 && d < bestD) {
          bestD = d
          best = st
        }
      }
      if (!best) continue

      best.occupant = bot
      bot.redirectToBed(best.x, best.y)
    }
  }
}
