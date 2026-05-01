import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import { isHouseState, isWorkJobState, type BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import {
  CRITICAL_HYDRATION_THRESHOLD,
  THIRST_THRESHOLD,
} from '../entities/nirvHydration'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { RestaurantSystem } from './RestaurantSystem'
import { SocialSystem } from './SocialSystem'
import type { RelationshipSystem } from './RelationshipSystem'
import { resolveReachableQueueSlot } from './stationApproach'
import {
  checkWaterQueueSlotArrivals,
  checkWaterTapArrivalsWithAccess,
  findWaterStationForBot,
  releaseFinishedWaterStations,
  repairOrphanWaterQueues,
  resolveWaterStationApproach,
  type WaterApproach,
  type WaterStation,
} from './waterStationRuntime'

const CHECK_INTERVAL_MS = 2000
const PLAYER_STATION_INTERACT_PX = 96
const DRINK_DURATION_MS = 3000

export class HydrationSystem {
  private stations: WaterStation[] = []
  private bots: BotNirv[]
  private getPlayer: () => Nirv
  private restaurant: RestaurantSystem
  private social: SocialSystem
  private assignAccum = 0
  private playerDrinkRemaining = 0
  private relationshipSystem: RelationshipSystem | null = null

  constructor(
    bots: BotNirv[],
    getPlayer: () => Nirv,
    restaurant: RestaurantSystem,
    private readonly pathfinder: GridPathfinder,
    private readonly isPlayerSleeping: () => boolean,
    private readonly wakePlayerFromSleep: () => void,
    private readonly canBotUseStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerUseStation: (x: number, y: number) => boolean = () => true,
    private readonly canBotInteractWithStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerInteractWithStation: (x: number, y: number) => boolean = () => true,
  ) {
    this.bots = bots
    this.getPlayer = getPlayer
    this.restaurant = restaurant
    this.social = new SocialSystem(bots)
  }

  getSocialSystem(): SocialSystem {
    return this.social
  }

  setRelationshipSystem(system: RelationshipSystem): void {
    this.relationshipSystem = system
  }

  registerStation(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
  ): void {
    this.stations.push({ sprite, x, y, active: null, activeApproach: null, queue: [] })
  }

  unregisterStation(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const idx = this.stations.findIndex(s => s.sprite === sprite)
    if (idx === -1) return
    const st = this.stations[idx]
    if (st.active) {
      st.active.cancelWaterQueue(true)
      st.active = null
      st.activeApproach = null
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
    if (!this.canPlayerUseStation(stationX, stationY)) return
    if (this.isPlayerSleeping()) this.wakePlayerFromSleep()
    const player = this.getPlayer()
    // Allow topping up whenever not full (THIRST_THRESHOLD only applies to bot auto-assign).
    if (player.getHydrationLevel() >= 100) return

    const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, stationX, stationY)
    if (dist > PLAYER_STATION_INTERACT_PX) {
      setWalkTarget(stationX, stationY)
      return
    }
    if (!this.canPlayerInteractWithStation(stationX, stationY)) return
    this.playerDrinkRemaining = DRINK_DURATION_MS
    playerSprite.setVelocity(0, 0)
  }

  updatePlayerDrinking(delta: number): void {
    if (this.playerDrinkRemaining > 0) {
      this.playerDrinkRemaining -= delta
      if (this.playerDrinkRemaining <= 0) {
        this.playerDrinkRemaining = 0
        this.getPlayer().addHydration(30)
      }
    }
  }

  updateStations(delta: number): void {
    checkWaterTapArrivalsWithAccess(this.pathfinder, this.stations, this.canBotInteractWithStation)
    checkWaterQueueSlotArrivals(this.pathfinder, this.stations)
    releaseFinishedWaterStations(this.pathfinder, this.stations)
    repairOrphanWaterQueues(this.pathfinder, this.stations)
    this.social.update(delta)

    this.assignAccum += delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryAssignThirstyBots()
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
        stBot === 'waiting_at_water_queue' ||
        stBot === 'walking_to_toilet' ||
        stBot === 'using_toilet' ||
        stBot === 'walking_to_toilet_queue' ||
        stBot === 'waiting_at_toilet_queue'
      ) continue
      if (stBot === 'walking_to_perform' || stBot === 'performing_on_stage') continue

      if (findWaterStationForBot(this.stations, bot)) continue

      const critical = h <= CRITICAL_HYDRATION_THRESHOLD
      if (!critical) {
        if (stBot === 'walking_to_bed' || stBot === 'sleeping') continue
        if (isWorkJobState(stBot)) continue
        if (stBot !== 'walking' && stBot !== 'waiting' && stBot !== 'inside_house' && stBot !== 'walking_into_house') continue
      } else {
        // Only severe thirst contributes to social stress signals.
        if (h <= CRITICAL_HYDRATION_THRESHOLD - 12) {
          const severity = 1.35 + (CRITICAL_HYDRATION_THRESHOLD - h) / 35
          this.relationshipSystem?.applyNeedStress(bot, severity, 'hydration')
        }
        if (stBot === 'sleeping' || stBot === 'walking_to_bed') bot.cancelSleep()
        bot.cancelSatiationQueue()
        bot.cancelToiletQueue()
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForHydration()
        else if (isHouseState(stBot) && stBot !== 'inside_house' && stBot !== 'walking_into_house') bot.cancelHouseFlow()
        else if (isWorkJobState(stBot)) bot.abortWorkDuty()
      }

      let best: { st: WaterStation; approach: WaterApproach | null } | null = null
      let bestD = Infinity
      for (const st of this.stations) {
        if (!this.canBotUseStation(bot, st.x, st.y)) continue
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
        if (d >= TILE_W * 15 || d >= bestD) continue
        if (!st.active && st.queue.length === 0) {
          const approach = resolveWaterStationApproach(this.pathfinder, st, bot)
          if (!approach) continue
          bestD = d
          best = { st, approach }
        } else {
          bestD = d
          best = { st, approach: null }
        }
      }
      if (!best) continue

      if (!best.st.active && best.st.queue.length === 0) {
        if (!best.approach) continue
        best.st.active = bot
        best.st.activeApproach = best.approach
        bot.redirectToWater(best.approach.x, best.approach.y)
      } else {
        const p = resolveReachableQueueSlot(this.pathfinder, best.st.x, best.st.y, bot, best.st.queue.length)
        if (!p) continue
        best.st.queue.push(bot)
        bot.redirectToWaterQueueSlot(p.x, p.y)
      }
    }
  }
}
