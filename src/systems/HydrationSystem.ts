import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import type { BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import {
  CRITICAL_HYDRATION_THRESHOLD,
  THIRST_THRESHOLD,
} from '../entities/nirvHydration'
import type { RestaurantSystem } from './RestaurantSystem'
import { queueSlotBehindStation } from './waterQueueLayout'

const CHECK_INTERVAL_MS = 2000
const MINUTE_MS = 60_000
const STATION_REACH_PX = 32
const PLAYER_STATION_INTERACT_PX = 96
const DRINK_DURATION_MS = 3000

interface WaterStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  /** Bot walking to tap or drinking; null when idle. */
  active: BotNirv | null
  /** FIFO behind `active`; each index maps to a line slot via queueSlotBehindStation. */
  queue: BotNirv[]
}

export class HydrationSystem {
  private stations: WaterStation[] = []
  private bots: BotNirv[]
  private getPlayer: () => Nirv
  private restaurant: RestaurantSystem
  private assignAccum = 0
  private minuteAccum = 0
  private playerDrinkRemaining = 0

  constructor(
    bots: BotNirv[],
    getPlayer: () => Nirv,
    restaurant: RestaurantSystem,
  ) {
    this.bots = bots
    this.getPlayer = getPlayer
    this.restaurant = restaurant
  }

  registerStation(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
  ): void {
    this.stations.push({ sprite, x, y, active: null, queue: [] })
  }

  unregisterStation(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const idx = this.stations.findIndex(s => s.sprite === sprite)
    if (idx === -1) return
    const st = this.stations[idx]
    if (st.active) {
      st.active.cancelWaterQueue()
      st.active = null
    }
    for (const b of st.queue) b.cancelWaterQueue()
    st.queue.length = 0
    this.stations.splice(idx, 1)
  }

  isPlayerDrinking(): boolean {
    return this.playerDrinkRemaining > 0
  }

  tryInteractWaterStation(stationX: number, stationY: number, playerSprite: Phaser.Physics.Arcade.Sprite, setWalkTarget: (x: number, y: number) => void): void {
    if (this.playerDrinkRemaining > 0) return
    const player = this.getPlayer()
    if (player.getHydrationLevel() > THIRST_THRESHOLD) return

    const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, stationX, stationY)
    if (dist > PLAYER_STATION_INTERACT_PX) {
      setWalkTarget(stationX, stationY)
      return
    }
    this.playerDrinkRemaining = DRINK_DURATION_MS
    playerSprite.setVelocity(0, 0)
  }

  updatePlayerAndWorldTime(delta: number): void {
    if (this.playerDrinkRemaining > 0) {
      this.playerDrinkRemaining -= delta
      if (this.playerDrinkRemaining <= 0) {
        this.playerDrinkRemaining = 0
        this.getPlayer().addHydration(30)
      }
    }

    this.minuteAccum += delta
    while (this.minuteAccum >= MINUTE_MS) {
      this.minuteAccum -= MINUTE_MS
      this.getPlayer().applyMinuteDehydration()
      for (const b of this.bots) b.nirv.applyMinuteDehydration()
    }
  }

  updateStations(delta: number): void {
    this.checkTapArrivals()
    this.checkQueueSlotArrivals()
    this.releaseFinishedServing()
    this.repairOrphanQueues()

    this.assignAccum += delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryAssignThirstyBots()
  }

  private findStationForBot(bot: BotNirv): WaterStation | null {
    for (const st of this.stations) {
      if (st.active === bot || st.queue.includes(bot)) return st
    }
    return null
  }

  private checkTapArrivals(): void {
    for (const st of this.stations) {
      if (!st.active) continue
      const bot = st.active
      if (bot.state !== 'walking_to_water') continue
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
      if (d < STATION_REACH_PX) bot.arriveAtWaterStation()
    }
  }

  private checkQueueSlotArrivals(): void {
    for (const st of this.stations) {
      st.queue.forEach((bot, lineIndex) => {
        if (bot.state !== 'walking_to_water_queue') return
        const slot = queueSlotBehindStation(st.x, st.y, lineIndex)
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
        if (d < STATION_REACH_PX) bot.arriveAtWaterQueueSlot()
      })
    }
  }

  /** Active bot left the tap (finished drinking); serve the next in line. */
  private releaseFinishedServing(): void {
    for (const st of this.stations) {
      if (!st.active) continue
      const s = st.active.state
      if (s === 'walking_to_water' || s === 'drinking_water') continue
      st.active = null
      this.promoteNextInLine(st)
    }
  }

  /** No server at tap but people waiting (e.g. after load edge case). */
  private repairOrphanQueues(): void {
    for (const st of this.stations) {
      if (st.active || st.queue.length === 0) continue
      this.promoteNextInLine(st)
    }
  }

  private promoteNextInLine(st: WaterStation): void {
    const next = st.queue.shift()
    if (!next) return
    st.active = next
    next.redirectToWater(st.x, st.y)
    this.syncQueueSlots(st)
  }

  /** Re-path everyone still waiting so their slot matches queue order after promotion. */
  private syncQueueSlots(st: WaterStation): void {
    st.queue.forEach((bot, i) => {
      const p = queueSlotBehindStation(st.x, st.y, i)
      if (bot.state === 'waiting_at_water_queue' || bot.state === 'walking_to_water_queue') {
        bot.redirectToWaterQueueSlot(p.x, p.y)
      }
    })
  }

  private tryAssignThirstyBots(): void {
    if (this.stations.length === 0) return

    for (const bot of this.bots) {
      const h = bot.nirv.getHydrationLevel()
      if (h > THIRST_THRESHOLD) continue
      const stBot = bot.state
      if (
        stBot === 'walking_to_water' ||
        stBot === 'drinking_water' ||
        stBot === 'walking_to_water_queue' ||
        stBot === 'waiting_at_water_queue'
      ) continue
      if (stBot === 'walking_to_perform' || stBot === 'performing_on_stage') continue

      if (this.findStationForBot(bot)) continue

      const critical = h <= CRITICAL_HYDRATION_THRESHOLD
      if (!critical) {
        if (stBot !== 'walking' && stBot !== 'waiting') continue
      } else {
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForHydration()
      }

      let best: WaterStation | null = null
      let bestD = Infinity
      for (const st of this.stations) {
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
        if (d < TILE_W * 15 && d < bestD) {
          bestD = d
          best = st
        }
      }
      if (!best) continue

      if (!best.active && best.queue.length === 0) {
        best.active = bot
        bot.redirectToWater(best.x, best.y)
      } else {
        best.queue.push(bot)
        const lineIndex = best.queue.length - 1
        const p = queueSlotBehindStation(best.x, best.y, lineIndex)
        bot.redirectToWaterQueueSlot(p.x, p.y)
      }
    }
  }
}
