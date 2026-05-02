import Phaser from 'phaser'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { TILE_W } from '../utils/isoGrid'
import { isHouseState, isWorkJobState, type BotNirv } from '../entities/BotNirv'
import { CRITICAL_SATIATION } from '../entities/nirvHunger'
import { updatePlacedObjectAt } from '../storage/persistence'
import type { RestaurantSystem } from './RestaurantSystem'
import {
  clampFoodStock,
  maxStockForFoodType,
  type FoodStockStation,
} from './foodStockTypes'
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
import {
  assignBotToSnackStation,
  checkSnackQueueArrivals,
  checkSnackTapArrivals,
  findSnackStationForBot,
  releaseFinishedSnackStations,
  repairSnackOrphanQueues,
  type SnackStation,
} from './snackStationRuntime'
import type { RelationshipSystem } from './RelationshipSystem'
import { topCriticalNeed } from './botNeedPriority'

const CHECK_INTERVAL_MS = 2000

type StationCandidate =
  | { kind: 'snack'; st: SnackStation; dist: number }
  | { kind: 'fruit'; st: FruitCrateStation; dist: number }

export class HungerSystem {
  private stations: SnackStation[] = []
  private fruitStations: FruitCrateStation[] = []
  private stockOnlyStations: FoodStockStation[] = []
  private bots: BotNirv[]
  private restaurant: RestaurantSystem
  private assignAccum = 0
  private schedule: import('./ScheduleSystem').ScheduleSystem | null = null
  private relationshipSystem: RelationshipSystem | null = null

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void { this.schedule = s }
  setRelationshipSystem(system: RelationshipSystem): void { this.relationshipSystem = system }

  constructor(
    bots: BotNirv[],
    restaurant: RestaurantSystem,
    private readonly pathfinder: GridPathfinder,
    private readonly canBotUseStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canBotInteractWithStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
  ) {
    this.bots = bots
    this.restaurant = restaurant
  }

  registerStation(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
    stock?: number,
  ): void {
    this.stations.push({
      sprite,
      type: 'snack_machine',
      x,
      y,
      stock: clampFoodStock('snack_machine', stock),
      maxStock: maxStockForFoodType('snack_machine'),
      reservedByStockerBotId: null,
      active: null,
      activeApproach: null,
      queue: [],
    })
  }

  registerFruitCrate(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
    stock?: number,
  ): void {
    this.fruitStations.push({
      sprite,
      type: 'fruit_crate',
      x,
      y,
      stock: clampFoodStock('fruit_crate', stock),
      maxStock: maxStockForFoodType('fruit_crate'),
      reservedByStockerBotId: null,
      slots: [null, null, null],
      slotApproaches: [null, null, null],
      queue: [],
    })
  }

  unregisterStation(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const idx = this.stations.findIndex(s => s.sprite === sprite)
    if (idx === -1) return
    const st = this.stations[idx]
    if (st.active) {
      st.active.cancelSatiationQueue()
      st.active = null
      st.activeApproach = null
    }
    for (const b of st.queue) b.cancelSatiationQueue()
    st.queue.length = 0
    this.stations.splice(idx, 1)
  }

  unregisterFruitCrate(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    unregisterFruitCrateStation(this.fruitStations, sprite)
  }

  registerStockOnlyStation(station: FoodStockStation): void {
    this.stockOnlyStations.push(station)
  }

  unregisterStockOnlyStation(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const idx = this.stockOnlyStations.findIndex(s => s.sprite === sprite)
    if (idx !== -1) this.stockOnlyStations.splice(idx, 1)
  }

  updateStations(_delta: number): void {
    checkSnackTapArrivals(
      this.pathfinder,
      this.stations,
      st => this.consumeStationStock(st),
      this.canBotInteractWithStation,
    )
    checkFruitSlotArrivals(
      this.pathfinder,
      this.fruitStations,
      st => this.consumeStationStock(st),
      this.canBotInteractWithStation,
    )
    checkSnackQueueArrivals(this.pathfinder, this.stations)
    checkFruitQueueArrivals(this.pathfinder, this.fruitStations)
    releaseFinishedSnackStations(this.pathfinder, this.stations)
    releaseFruitSlotsAfterInteract(this.fruitStations, st => promoteFruitQueue(this.pathfinder, st))
    repairSnackOrphanQueues(this.pathfinder, this.stations)
    repairFruitOrphanQueues(this.fruitStations, st => promoteFruitQueue(this.pathfinder, st))

    this.assignAccum += _delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryAssignHungryBots()
  }

  private findSnackStationForBot(bot: BotNirv): SnackStation | null {
    return findSnackStationForBot(this.stations, bot)
  }

  private findAnyStationForBot(bot: BotNirv): boolean {
    return this.findSnackStationForBot(bot) !== null || findFruitStationForBot(this.fruitStations, bot) !== null
  }

  getFoodStockStations(): FoodStockStation[] {
    return [...this.stations, ...this.fruitStations, ...this.stockOnlyStations]
  }

  setFoodStationStock(station: FoodStockStation, stock: number): void {
    station.stock = clampFoodStock(station.type, stock)
    updatePlacedObjectAt(station.x, station.y, station.type, { stock: station.stock })
  }

  private tryAssignHungryBots(): void {
    if (this.stations.length === 0 && this.fruitStations.length === 0) return

    for (const bot of this.bots) {
      const sat = bot.nirv.getSatiation()
      const mealWindow = this.schedule?.isMealWindow(bot) ?? false
      const effectiveThreshold = mealWindow ? Math.max(bot.nirv.hungerThreshold, 80) : bot.nirv.hungerThreshold
      if (sat > effectiveThreshold) continue
      const priorityNeed = topCriticalNeed(bot)
      if (priorityNeed && priorityNeed !== 'hunger') continue

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
      if (stBot === 'drinking_water') continue

      if (this.findAnyStationForBot(bot)) continue

      const critical = priorityNeed === 'hunger'
      if (!critical) {
        if (stBot === 'walking_to_bed' || stBot === 'sleeping') continue
        if (isWorkJobState(stBot)) continue
        if (stBot !== 'walking' && stBot !== 'waiting' && stBot !== 'inside_house' && stBot !== 'walking_into_house') continue
      } else {
        // Avoid over-triggering: mild hunger should not become social stress.
        if (sat <= CRITICAL_SATIATION - 8) {
          const severity = 1.4 + (CRITICAL_SATIATION - sat) / 28
          this.relationshipSystem?.applyNeedStress(bot, severity, 'hunger')
        }
        if (stBot === 'sleeping' || stBot === 'walking_to_bed') bot.cancelSleep()
        bot.cancelWaterQueue()
        bot.cancelToiletQueue()
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForFood()
        else if (isHouseState(stBot) && stBot !== 'inside_house' && stBot !== 'walking_into_house') bot.cancelHouseFlow()
        else if (isWorkJobState(stBot)) bot.abortWorkDuty()
      }

      const candidates: StationCandidate[] = []
      for (const st of this.stations) {
        if (this.availableSnackStock(st) <= 0) continue
        if (!this.canBotUseStation(bot, st.x, st.y)) continue
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
        if (d < TILE_W * 15) candidates.push({ kind: 'snack', st, dist: d })
      }
      for (const st of this.fruitStations) {
        if (this.availableFruitStock(st) <= 0) continue
        if (!this.canBotUseStation(bot, st.x, st.y)) continue
        if (!isWithinStationRange(bot, st)) continue
        candidates.push({ kind: 'fruit', st, dist: distanceToStation(bot, st) })
      }
      if (candidates.length === 0) continue
      candidates.sort((a, b) => a.dist - b.dist)
      for (const candidate of candidates) {
        const assigned = candidate.kind === 'snack'
          ? assignBotToSnackStation(this.pathfinder, this.stations, candidate.st, bot)
          : assignBotToFruitCrate(this.pathfinder, candidate.st, bot)
        if (assigned) break
      }
    }
  }

  private consumeStationStock(station: FoodStockStation): boolean {
    if (station.stock <= 0) return false
    this.setFoodStationStock(station, station.stock - 1)
    return true
  }

  private availableSnackStock(station: SnackStation): number {
    const activeReserved = station.active?.state === 'walking_to_snack' ? 1 : 0
    return station.stock - activeReserved - station.queue.length
  }

  private availableFruitStock(station: FruitCrateStation): number {
    const slotReservations = station.slots.filter(bot => bot?.state === 'walking_to_fruit').length
    return station.stock - slotReservations - station.queue.length
  }
}
