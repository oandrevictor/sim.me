import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import type { BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { RestaurantSystem } from './RestaurantSystem'
import { queueSlotBehindStation } from './waterQueueLayout'

const CHECK_INTERVAL_MS = 2000
const STATION_REACH_PX = 32
const PLAYER_TOILET_INTERACT_PX = 96
const USE_DURATION_MS = 3000

interface ToiletStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  active: BotNirv | null
  queue: BotNirv[]
}

export class BladderSystem {
  private stations: ToiletStation[] = []
  private bots: BotNirv[]
  private getPlayer: () => Nirv
  private restaurant: RestaurantSystem
  private assignAccum = 0
  private playerUseRemaining = 0

  constructor(
    bots: BotNirv[],
    getPlayer: () => Nirv,
    restaurant: RestaurantSystem,
    private readonly pathfinder: GridPathfinder,
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
      st.active.cancelToiletQueue()
      st.active = null
    }
    for (const b of st.queue) b.cancelToiletQueue()
    st.queue.length = 0
    this.stations.splice(idx, 1)
  }

  isPlayerUsingToilet(): boolean {
    return this.playerUseRemaining > 0
  }

  /** True if the click was used (need toilet or started walk / use). */
  tryInteractPortableToilet(
    stationX: number,
    stationY: number,
    playerSprite: Phaser.Physics.Arcade.Sprite,
    setWalkTarget: (x: number, y: number) => void,
  ): boolean {
    if (this.playerUseRemaining > 0) return false
    const player = this.getPlayer()
    if (player.getBladderLevel() < player.bladderLevelThreshold) return false

    const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, stationX, stationY)
    if (dist > PLAYER_TOILET_INTERACT_PX) {
      setWalkTarget(stationX, stationY)
      return true
    }
    this.playerUseRemaining = USE_DURATION_MS
    playerSprite.setVelocity(0, 0)
    player.enterToiletInterior(stationX, stationY)
    return true
  }

  updatePlayerUse(delta: number): void {
    if (this.playerUseRemaining <= 0) return
    this.playerUseRemaining -= delta
    if (this.playerUseRemaining <= 0) {
      this.playerUseRemaining = 0
      const p = this.getPlayer()
      p.resetBladderAfterUse()
      p.exitToilet()
    }
  }

  updateStations(delta: number): void {
    this.updatePlayerUse(delta)
    this.checkTapArrivals()
    this.checkQueueSlotArrivals()
    this.releaseFinishedServing()
    this.repairOrphanQueues()

    this.assignAccum += delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryAssignBotsNeedingToilet()
  }

  private findStationForBot(bot: BotNirv): ToiletStation | null {
    for (const st of this.stations) {
      if (st.active === bot || st.queue.includes(bot)) return st
    }
    return null
  }

  private checkTapArrivals(): void {
    for (const st of this.stations) {
      if (!st.active) continue
      const bot = st.active
      if (bot.state !== 'walking_to_toilet') continue
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
      if (d < STATION_REACH_PX) bot.arriveAtToiletStation(st.x, st.y)
    }
  }

  private checkQueueSlotArrivals(): void {
    for (const st of this.stations) {
      st.queue.forEach((bot, lineIndex) => {
        if (bot.state !== 'walking_to_toilet_queue') return
        const slot = queueSlotBehindStation(this.pathfinder, st.x, st.y, lineIndex)
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
        if (d < STATION_REACH_PX) bot.arriveAtToiletQueueSlot()
      })
    }
  }

  private releaseFinishedServing(): void {
    for (const st of this.stations) {
      if (!st.active) continue
      const s = st.active.state
      if (s === 'walking_to_toilet' || s === 'using_toilet') continue
      st.active = null
      this.promoteNextInLine(st)
    }
  }

  private repairOrphanQueues(): void {
    for (const st of this.stations) {
      if (st.active || st.queue.length === 0) continue
      this.promoteNextInLine(st)
    }
  }

  private promoteNextInLine(st: ToiletStation): void {
    const next = st.queue.shift()
    if (!next) return
    st.active = next
    next.redirectToToilet(st.x, st.y)
    this.syncQueueSlots(st)
  }

  private syncQueueSlots(st: ToiletStation): void {
    st.queue.forEach((bot, i) => {
      const p = queueSlotBehindStation(this.pathfinder, st.x, st.y, i)
      if (bot.state === 'waiting_at_toilet_queue' || bot.state === 'walking_to_toilet_queue') {
        bot.redirectToToiletQueueSlot(p.x, p.y)
      }
    })
  }

  private tryAssignBotsNeedingToilet(): void {
    if (this.stations.length === 0) return

    for (const bot of this.bots) {
      const level = bot.nirv.getBladderLevel()
      const t = bot.nirv.bladderLevelThreshold
      if (level < t) continue

      const urgent = level >= 100 || level >= t + 10
      const stBot = bot.state
      if (
        stBot === 'walking_to_toilet' ||
        stBot === 'using_toilet' ||
        stBot === 'walking_to_toilet_queue' ||
        stBot === 'waiting_at_toilet_queue'
      ) {
        continue
      }
      if (stBot === 'walking_to_perform' || stBot === 'performing_on_stage') continue

      if (this.findStationForBot(bot)) continue

      if (!urgent) {
        if (stBot === 'walking_to_bed' || stBot === 'sleeping') continue
        if (stBot !== 'walking' && stBot !== 'waiting') continue
      } else {
        if (stBot === 'sleeping' || stBot === 'walking_to_bed') bot.cancelSleep()
        bot.cancelWaterQueue()
        bot.cancelSatiationQueue()
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForHydration()
      }

      let best: ToiletStation | null = null
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
        bot.redirectToToilet(best.x, best.y)
      } else {
        best.queue.push(bot)
        const lineIndex = best.queue.length - 1
        const p = queueSlotBehindStation(this.pathfinder, best.x, best.y, lineIndex)
        bot.redirectToToiletQueueSlot(p.x, p.y)
      }
    }
  }
}
