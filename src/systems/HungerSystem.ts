import Phaser from 'phaser'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { TILE_W } from '../utils/isoGrid'
import type { BotNirv } from '../entities/BotNirv'
import { CRITICAL_SATIATION } from '../entities/nirvHunger'
import type { RestaurantSystem } from './RestaurantSystem'
import { queueSlotBehindStation } from './waterQueueLayout'
import {
  assignBotToFruitCrate,
  checkFruitQueueArrivals,
  checkFruitSlotArrivals,
  distanceToStation,
  findFruitStationForBot,
  type FruitCrateStation,
  isWithinStationRange,
  promoteFruitQueue,
  releaseFruitSlotsAfterInteract,
  repairFruitOrphanQueues,
  unregisterFruitCrateStation,
} from './hungerFruitCrates'

const CHECK_INTERVAL_MS = 2000
const STATION_REACH_PX = 32

interface SnackStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  active: BotNirv | null
  queue: BotNirv[]
}

type StationCandidate =
  | { kind: 'snack'; st: SnackStation; dist: number }
  | { kind: 'fruit'; st: FruitCrateStation; dist: number }

export class HungerSystem {
  private stations: SnackStation[] = []
  private fruitStations: FruitCrateStation[] = []
  private bots: BotNirv[]
  private restaurant: RestaurantSystem
  private assignAccum = 0

  constructor(
    bots: BotNirv[],
    restaurant: RestaurantSystem,
    private readonly pathfinder: GridPathfinder,
  ) {
    this.bots = bots
    this.restaurant = restaurant
  }

  registerStation(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
  ): void {
    this.stations.push({ sprite, x, y, active: null, queue: [] })
  }

  registerFruitCrate(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
  ): void {
    this.fruitStations.push({ sprite, x, y, slots: [null, null, null], queue: [] })
  }

  unregisterStation(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const idx = this.stations.findIndex(s => s.sprite === sprite)
    if (idx === -1) return
    const st = this.stations[idx]
    if (st.active) {
      st.active.cancelSatiationQueue()
      st.active = null
    }
    for (const b of st.queue) b.cancelSatiationQueue()
    st.queue.length = 0
    this.stations.splice(idx, 1)
  }

  unregisterFruitCrate(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    unregisterFruitCrateStation(this.fruitStations, sprite)
  }

  updateStations(_delta: number): void {
    this.checkTapArrivals()
    checkFruitSlotArrivals(this.fruitStations)
    this.checkQueueSlotArrivals()
    checkFruitQueueArrivals(this.pathfinder, this.fruitStations)
    this.releaseFinishedServing()
    releaseFruitSlotsAfterInteract(this.fruitStations, st => promoteFruitQueue(this.pathfinder, st))
    this.repairOrphanQueues()
    repairFruitOrphanQueues(this.fruitStations, st => promoteFruitQueue(this.pathfinder, st))

    this.assignAccum += _delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryAssignHungryBots()
  }

  private findSnackStationForBot(bot: BotNirv): SnackStation | null {
    for (const st of this.stations) {
      if (st.active === bot || st.queue.includes(bot)) return st
    }
    return null
  }

  private findAnyStationForBot(bot: BotNirv): boolean {
    return this.findSnackStationForBot(bot) !== null || findFruitStationForBot(this.fruitStations, bot) !== null
  }

  /** One at a time at any vending machine: approach + panel (not wander/eat). */
  private anySnackApproachOrInteract(): boolean {
    for (const st of this.stations) {
      const b = st.active
      if (!b) continue
      if (b.state === 'walking_to_snack' || b.state === 'snack_interact') return true
    }
    return false
  }

  private checkTapArrivals(): void {
    for (const st of this.stations) {
      if (!st.active) continue
      const bot = st.active
      if (bot.state !== 'walking_to_snack') continue
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
      if (d < STATION_REACH_PX) bot.arriveAtSnackStation()
    }
  }

  private checkQueueSlotArrivals(): void {
    for (const st of this.stations) {
      st.queue.forEach((bot, lineIndex) => {
        if (bot.state !== 'walking_to_snack_queue') return
        const slot = queueSlotBehindStation(this.pathfinder, st.x, st.y, lineIndex)
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
        if (d < STATION_REACH_PX) bot.arriveAtSnackQueueSlot()
      })
    }
  }

  private releaseFinishedServing(): void {
    for (const st of this.stations) {
      if (!st.active) continue
      const s = st.active.state
      if (s === 'walking_to_snack' || s === 'snack_interact') continue
      st.active = null
      this.promoteNextInLine(st)
    }
  }

  private repairOrphanQueues(): void {
    if (this.anySnackApproachOrInteract()) return
    for (const st of this.stations) {
      if (st.active || st.queue.length === 0) continue
      this.promoteNextInLine(st)
    }
  }

  private promoteNextInLine(st: SnackStation): void {
    const next = st.queue.shift()
    if (!next) return
    if (this.anySnackApproachOrInteract()) {
      st.queue.unshift(next)
      return
    }
    st.active = next
    next.redirectToSnack(st.x, st.y)
    this.syncQueueSlots(st)
  }

  private syncQueueSlots(st: SnackStation): void {
    st.queue.forEach((bot, i) => {
      const p = queueSlotBehindStation(this.pathfinder, st.x, st.y, i)
      if (bot.state === 'waiting_at_snack_queue' || bot.state === 'walking_to_snack_queue') {
        bot.redirectToSnackQueueSlot(p.x, p.y)
      }
    })
  }

  private tryAssignHungryBots(): void {
    if (this.stations.length === 0 && this.fruitStations.length === 0) return

    for (const bot of this.bots) {
      const sat = bot.nirv.getSatiation()
      if (sat > bot.nirv.hungerThreshold) continue

      const stBot = bot.state
      if (
        stBot === 'walking_to_snack' ||
        stBot === 'snack_interact' ||
        stBot === 'snack_wander' ||
        stBot === 'snack_eat' ||
        stBot === 'walking_to_snack_queue' ||
        stBot === 'waiting_at_snack_queue' ||
        stBot === 'walking_to_fruit' ||
        stBot === 'fruit_interact' ||
        stBot === 'fruit_wander' ||
        stBot === 'fruit_eat' ||
        stBot === 'walking_to_fruit_queue' ||
        stBot === 'waiting_at_fruit_queue' ||
        stBot === 'walking_to_toilet' ||
        stBot === 'using_toilet' ||
        stBot === 'walking_to_toilet_queue' ||
        stBot === 'waiting_at_toilet_queue'
      ) {
        continue
      }
      if (stBot === 'walking_to_perform' || stBot === 'performing_on_stage') continue

      if (this.findAnyStationForBot(bot)) continue

      const critical = sat <= CRITICAL_SATIATION
      if (!critical) {
        if (stBot === 'walking_to_bed' || stBot === 'sleeping') continue
        if (stBot !== 'walking' && stBot !== 'waiting') continue
      } else {
        if (stBot === 'sleeping' || stBot === 'walking_to_bed') bot.cancelSleep()
        bot.cancelWaterQueue()
        bot.cancelToiletQueue()
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForFood()
      }

      const candidates: StationCandidate[] = []
      for (const st of this.stations) {
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
        if (d < TILE_W * 15) candidates.push({ kind: 'snack', st, dist: d })
      }
      for (const st of this.fruitStations) {
        if (!isWithinStationRange(bot, st)) continue
        candidates.push({ kind: 'fruit', st, dist: distanceToStation(bot, st) })
      }
      if (candidates.length === 0) continue
      candidates.sort((a, b) => a.dist - b.dist)
      const best = candidates[0]
      if (best.kind === 'snack') {
        const st = best.st
        const canTakeMachineNow =
          !st.active && st.queue.length === 0 && !this.anySnackApproachOrInteract()
        if (canTakeMachineNow) {
          st.active = bot
          bot.redirectToSnack(st.x, st.y)
        } else {
          st.queue.push(bot)
          const lineIndex = st.queue.length - 1
          const p = queueSlotBehindStation(this.pathfinder, st.x, st.y, lineIndex)
          bot.redirectToSnackQueueSlot(p.x, p.y)
        }
      } else {
        assignBotToFruitCrate(this.pathfinder, best.st, bot)
      }
    }
  }
}
