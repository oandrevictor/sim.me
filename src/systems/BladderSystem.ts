import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import { isHouseState, isWorkJobState, type BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { RestaurantSystem } from './RestaurantSystem'
import {
  resolveReachableQueueSlot,
  resolveStationApproach,
  type StationApproach,
} from './stationApproach'
import type { RelationshipSystem } from './RelationshipSystem'
import { debugLog } from '../debug/DebugLogger'
import { playerDebugFields } from '../debug/debugActor'
import { logBotStation } from '../debug/stationDebug'
import { topCriticalNeed } from './botNeedPriority'

const CHECK_INTERVAL_MS = 2000
const STATION_REACH_PX = 32
const PLAYER_TOILET_INTERACT_PX = 96
const USE_DURATION_MS = 3000

interface ToiletStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  active: BotNirv | null
  activeApproach: StationApproach | null
  queue: BotNirv[]
}

export class BladderSystem {
  private stations: ToiletStation[] = []
  private bots: BotNirv[]
  private getPlayer: () => Nirv
  private restaurant: RestaurantSystem
  private assignAccum = 0
  private playerUseRemaining = 0
  private relationshipSystem: RelationshipSystem | null = null

  constructor(
    bots: BotNirv[],
    getPlayer: () => Nirv,
    restaurant: RestaurantSystem,
    private readonly pathfinder: GridPathfinder,
    private readonly canBotUseStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerUseStation: (x: number, y: number) => boolean = () => true,
    private readonly canBotInteractWithStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerInteractWithStation: (x: number, y: number) => boolean = () => true,
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
    this.stations.push({ sprite, x, y, active: null, activeApproach: null, queue: [] })
  }

  setRelationshipSystem(system: RelationshipSystem): void {
    this.relationshipSystem = system
  }

  unregisterStation(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const idx = this.stations.findIndex(s => s.sprite === sprite)
    if (idx === -1) return
    const st = this.stations[idx]
    if (st.active) {
      st.active.cancelToiletQueue()
      st.active = null
      st.activeApproach = null
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
    const player = this.getPlayer()
    if (this.playerUseRemaining > 0) {
      this.logPlayerToilet('interaction.object_blocked', player, stationX, stationY, 'already_using_toilet', 'debug')
      return false
    }
    if (!this.canPlayerUseStation(stationX, stationY)) {
      this.logPlayerToilet('interaction.object_blocked', player, stationX, stationY, 'access_denied', 'warn')
      return true
    }
    if (player.getBladderLevel() > player.bladderLevelThreshold) {
      this.logPlayerToilet('interaction.object_blocked', player, stationX, stationY, 'bladder_not_urgent', 'debug')
      return false
    }

    const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, stationX, stationY)
    if (dist > PLAYER_TOILET_INTERACT_PX) {
      setWalkTarget(stationX, stationY)
      this.logPlayerToilet('interaction.object_walk_queued', player, stationX, stationY, 'needs_approach', 'debug', { distance: round(dist) })
      return true
    }
    if (!this.canPlayerInteractWithStation(stationX, stationY)) {
      this.logPlayerToilet('interaction.object_blocked', player, stationX, stationY, 'not_inside_access_area', 'warn')
      return true
    }
    this.playerUseRemaining = USE_DURATION_MS
    playerSprite.setVelocity(0, 0)
    player.enterToiletInterior(stationX, stationY)
    this.logPlayerToilet('interaction.toilet_start', player, stationX, stationY, 'started', 'info')
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
      this.logPlayerToilet('interaction.toilet_finish', p, 0, 0, 'finished', 'info')
    }
  }

  private logPlayerToilet(
    type: string,
    player: Nirv,
    stationX: number,
    stationY: number,
    reason: string,
    level: 'debug' | 'info' | 'warn',
    extra: Record<string, number> = {},
  ): void {
    debugLog.log(type, {
      ...playerDebugFields(player),
      objectType: 'portable_toilet',
      objectX: round(stationX),
      objectY: round(stationY),
      bladder: round(player.getBladderLevel()),
      reason,
      ...extra,
    }, level)
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
      if (!this.canBotInteractWithStation(bot, st.x, st.y)) continue
      st.activeApproach ??= resolveStationApproach(this.pathfinder, st.x, st.y, bot)
      if (!st.activeApproach) {
        logBotStation('interaction.object_blocked', bot, 'portable_toilet', st.x, st.y, 'no_toilet_approach', 'warn')
        bot.cancelToiletQueue()
        continue
      }
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.activeApproach.x, st.activeApproach.y)
      if (d < STATION_REACH_PX) {
        logBotStation('interaction.toilet_start', bot, 'portable_toilet', st.x, st.y, 'arrived', 'info')
        bot.arriveAtToiletStation(st.x, st.y)
      }
    }
  }

  private checkQueueSlotArrivals(): void {
    for (const st of this.stations) {
      for (let lineIndex = st.queue.length - 1; lineIndex >= 0; lineIndex--) {
        const bot = st.queue[lineIndex]!
        if (bot.state !== 'walking_to_toilet_queue') continue
        const slot = resolveReachableQueueSlot(this.pathfinder, st.x, st.y, bot, lineIndex)
        if (!slot) {
        st.queue.splice(lineIndex, 1)
        logBotStation('interaction.object_blocked', bot, 'portable_toilet', st.x, st.y, 'no_toilet_queue_slot', 'warn')
        bot.cancelToiletQueue()
          continue
        }
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
        if (d < STATION_REACH_PX) {
          logBotStation('interaction.queue_arrived', bot, 'portable_toilet', st.x, st.y, 'toilet_queue', 'debug', { queueIndex: lineIndex })
          bot.arriveAtToiletQueueSlot()
        }
      }
    }
  }

  private releaseFinishedServing(): void {
    for (const st of this.stations) {
      if (!st.active) continue
      const s = st.active.state
      if (s === 'walking_to_toilet' || s === 'using_toilet') continue
      logBotStation('interaction.toilet_finish', st.active, 'portable_toilet', st.x, st.y, 'released', 'info')
      st.active = null
      st.activeApproach = null
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
    const approach = resolveStationApproach(this.pathfinder, st.x, st.y, next)
    if (!approach) {
      logBotStation('interaction.object_blocked', next, 'portable_toilet', st.x, st.y, 'no_toilet_approach', 'warn')
      next.cancelToiletQueue()
      this.promoteNextInLine(st)
      return
    }
    st.active = next
    st.activeApproach = approach
    logBotStation('interaction.queue_promoted', next, 'portable_toilet', st.x, st.y, 'toilet_queue', 'debug')
    next.redirectToToilet(st.x, st.y, approach.x, approach.y)
    this.syncQueueSlots(st)
  }

  private syncQueueSlots(st: ToiletStation): void {
    const kept: BotNirv[] = []
    for (const bot of st.queue) {
      const p = resolveReachableQueueSlot(this.pathfinder, st.x, st.y, bot, kept.length)
      if (!p) {
        logBotStation('interaction.object_blocked', bot, 'portable_toilet', st.x, st.y, 'no_toilet_queue_slot', 'warn')
        bot.cancelToiletQueue()
        continue
      }
      if (bot.state === 'waiting_at_toilet_queue' || bot.state === 'walking_to_toilet_queue') {
        bot.redirectToToiletQueueSlot(p.x, p.y)
      }
      kept.push(bot)
    }
    st.queue.splice(0, st.queue.length, ...kept)
  }

  private tryAssignBotsNeedingToilet(): void {
    if (this.stations.length === 0) return

    for (const bot of this.bots) {
      const level = bot.nirv.getBladderLevel()
      const t = bot.nirv.bladderLevelThreshold
      if (level > t) continue

      const priorityNeed = topCriticalNeed(bot)
      if (priorityNeed && priorityNeed !== 'bladder') continue
      const urgent = priorityNeed === 'bladder'
      const stBot = bot.state
      if (
        stBot === 'walking_to_toilet' ||
        stBot === 'using_toilet' ||
        stBot === 'walking_to_toilet_queue' ||
        stBot === 'waiting_at_toilet_queue'
      ) {
        continue
      }
      if (stBot === 'drinking_water') continue

      if (this.findStationForBot(bot)) continue

      if (!urgent) {
        if (stBot === 'walking_to_bed' || stBot === 'sleeping') continue
        if (stBot !== 'walking' && stBot !== 'waiting' && stBot !== 'inside_house' && stBot !== 'walking_into_house') continue
      } else {
        // Only strong urgency contributes to interpersonal stress.
        const severeThreshold = Math.max(0, t - 24)
        if (level <= severeThreshold) {
          const severity = 1.35 + (severeThreshold - level) / 30
          this.relationshipSystem?.applyNeedStress(bot, severity, 'bladder')
        }
        if (stBot === 'sleeping' || stBot === 'walking_to_bed') bot.cancelSleep()
        bot.cancelWaterQueue()
        bot.cancelSatiationQueue()
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForHydration()
        else if (isHouseState(stBot) && stBot !== 'inside_house' && stBot !== 'walking_into_house') bot.cancelHouseFlow()
        else if (isWorkJobState(stBot)) bot.abortWorkDuty()
      }

      let best: ToiletStation | null = null
      let bestD = Infinity
      for (const st of this.stations) {
        if (!this.canBotUseStation(bot, st.x, st.y)) continue
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
        if (d < TILE_W * 15 && d < bestD) {
          bestD = d
          best = st
        }
      }
      if (!best) continue

      if (!best.active && best.queue.length === 0) {
        const approach = resolveStationApproach(this.pathfinder, best.x, best.y, bot)
        if (!approach) continue
        best.active = bot
        best.activeApproach = approach
        logBotStation('interaction.object_assigned', bot, 'portable_toilet', best.x, best.y, 'toilet_active', 'debug')
        bot.redirectToToilet(best.x, best.y, approach.x, approach.y)
      } else {
        const p = resolveReachableQueueSlot(this.pathfinder, best.x, best.y, bot, best.queue.length)
        if (!p) continue
        best.queue.push(bot)
        logBotStation('interaction.object_assigned', bot, 'portable_toilet', best.x, best.y, 'toilet_queue', 'debug', { queueIndex: best.queue.length - 1 })
        bot.redirectToToiletQueueSlot(p.x, p.y)
      }
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
