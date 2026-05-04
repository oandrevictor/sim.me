import Phaser from 'phaser'
import { screenToGrid } from '../utils/isoGrid'
import { actorInsideObjectBuilding } from '../world/buildingInteractionAccess'
import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import { removeObjectByType, type ObjectType } from '../storage/persistence'
import { RestaurantReservations } from './RestaurantReservations'
import { checkFoodService } from './restaurantFoodService'
import { checkArrivals, cleanupUnseated, releaseChairForBot, tryAssignRestaurantBots } from './restaurantSeating'
import {
  SLOT_OFFSETS,
  type ChairRecord,
  type CounterRecord,
  type PlateSlot,
  type TableRecord,
  type TableType,
  type WaiterServiceClaim,
} from './restaurantTypes'
import type { RelationshipSystem } from './RelationshipSystem'

export type { CounterRecord, WaiterServiceClaim } from './restaurantTypes'

const COUNTER_PLATE_OFFSET_Y = -10
const CHECK_INTERVAL = 2000

export class RestaurantSystem {
  private chairs: ChairRecord[] = []
  private tables: TableRecord[] = []
  private counters: CounterRecord[] = []
  private reservations: RestaurantReservations
  private timeSinceCheck = 0
  private staffBotFilter: (bot: BotNirv) => boolean = () => false
  private relationshipSystem: RelationshipSystem | null = null
  onPlateConsumed: ((tableX: number, tableY: number, sprite: Phaser.GameObjects.Sprite) => void) | null = null

  constructor(private readonly buildings: Building[], private readonly bots: BotNirv[]) {
    this.reservations = new RestaurantReservations(
      this.counters, this.tables, this.chairs,
      (ax, ay, bx, by) => this.isGridAdjacent(ax, ay, bx, by),
    )
  }

  setStaffBotFilter(fn: (bot: BotNirv) => boolean): void { this.staffBotFilter = fn }
  setRelationshipSystem(system: RelationshipSystem): void { this.relationshipSystem = system }

  registerChair(sprite: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.chairs.push({
      sprite, x, y,
      buildingId: this.findContainingBuilding(x, y),
      occupiedBy: null,
      nextToTable: this.isAdjacentToTable(x, y),
      serviceClaimedByWaiterBotId: null,
    })
  }

  registerTable(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite, x: number, y: number, type: ObjectType): void {
    const tableType = type as TableType
    const slots = SLOT_OFFSETS[tableType].map(o => ({ ...o, plate: null, reservedByWaiterBotId: null }))
    this.tables.push({ sprite, x, y, buildingId: this.findContainingBuilding(x, y), tableType, slots })
    this.recalcChairAdjacency()
  }

  registerCounter(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number): void {
    this.counters.push({ sprite, x, y, buildingId: this.findContainingBuilding(x, y), plate: null, reservation: null })
  }

  unregisterCounter(sprite: Phaser.Physics.Arcade.Sprite): void {
    const c = this.counters.find(r => r.sprite === sprite)
    if (c) {
      this.reservations.releaseForCounter(c)
      if (c.plate) {
        removeObjectByType(c.x, c.y, 'food_plate')
        c.plate.sprite.destroy()
        c.plate = null
      }
    }
    this.counters = this.counters.filter(r => r.sprite !== sprite)
  }

  unregisterChair(sprite: Phaser.GameObjects.Sprite): void {
    const chair = this.chairs.find(c => c.sprite === sprite)
    if (chair) this.reservations.releaseForChair(chair)
    this.chairs = this.chairs.filter(c => c.sprite !== sprite)
  }

  unregisterTable(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const table = this.tables.find(t => t.sprite === sprite)
    if (table) this.reservations.releaseForTable(table)
    this.tables = this.tables.filter(t => t.sprite !== sprite)
    this.recalcChairAdjacency()
  }

  placeFoodOnTable(x: number, y: number, recipeId: string, sprite: Phaser.GameObjects.Sprite): boolean {
    const table = this.tables.find(t => t.x === x && t.y === y)
    const slot = table?.slots.find(s => !s.plate && !s.reservedByWaiterBotId)
    if (!table || !slot) return false
    return this.placeInSlot(table, slot, recipeId, sprite)
  }

  placeFoodOnCounter(x: number, y: number, recipeId: string, sprite: Phaser.GameObjects.Sprite): boolean {
    const counter = this.counters.find(c => c.x === x && c.y === y)
    if (!counter || counter.plate) return false
    counter.plate = { recipeId, sprite }
    sprite.setPosition(counter.x, counter.y + COUNTER_PLATE_OFFSET_Y)
    return true
  }

  removePlateFromTable(x: number, y: number, sprite: Phaser.GameObjects.Sprite): string | null {
    const table = this.tables.find(t => t.x === x && t.y === y)
    const slot = table?.slots.find(s => s.plate?.sprite === sprite)
    if (!slot?.plate) return null
    const recipeId = slot.plate.recipeId
    slot.plate = null
    return recipeId
  }

  removePlateFromCounterBySprite(sprite: Phaser.GameObjects.Sprite): string | null {
    const counter = this.counters.find(c => c.plate?.sprite === sprite)
    if (!counter?.plate) return null
    const recipeId = counter.plate.recipeId
    counter.plate = null
    return recipeId
  }

  removePlateFromTableOrCounter(x: number, y: number, sprite: Phaser.GameObjects.Sprite): string | null {
    return this.removePlateFromTable(x, y, sprite) ?? this.removePlateFromCounterBySprite(sprite)
  }

  countFreeCounterSlotsInBuilding(buildingId: string): number {
    return this.counters.filter(c => c.buildingId === buildingId && !c.plate && !c.reservation).length
  }

  getCounterAt(x: number, y: number): CounterRecord | null {
    return this.counters.find(c => c.x === x && c.y === y) ?? null
  }

  reserveChefCounter(buildingId: string, botId: string, canUse: (c: CounterRecord) => boolean): CounterRecord | null {
    return this.reservations.reserveCounter(buildingId, botId, 'chef_dropoff', canUse)
  }

  canPlaceOnReservedCounter(botId: string, x: number, y: number): boolean {
    return this.reservations.canPlaceOnReservedCounter(botId, x, y)
  }

  reserveReturnCounter(buildingId: string, botId: string, canUse: (c: CounterRecord) => boolean): CounterRecord | null {
    return this.reservations.reserveCounter(buildingId, botId, 'waiter_return', canUse)
  }

  claimWaiterService(
    buildingId: string,
    botId: string,
    canUseCounter: (c: CounterRecord) => boolean,
    canUseTable: (t: TableRecord) => boolean,
  ): WaiterServiceClaim | null {
    return this.reservations.claimWaiterService(buildingId, botId, canUseCounter, canUseTable)
  }

  getWaiterClaim(botId: string): WaiterServiceClaim | null { return this.reservations.getWaiterClaim(botId) }
  markWaiterPickedUp(botId: string): void { this.reservations.markWaiterPickedUp(botId) }
  canDeliverWaiterClaim(botId: string): boolean { return this.reservations.canDeliverWaiterClaim(botId) }
  releaseWaiterClaim(botId: string): void { this.reservations.releaseWaiterClaim(botId) }
  releaseCounterReservationForBot(botId: string): void { this.reservations.releaseCounterForBot(botId) }

  update(delta: number): void {
    this.timeSinceCheck += delta
    checkFoodService(this.tables, this.chairs, (ax, ay, bx, by) => this.isGridAdjacent(ax, ay, bx, by), this.onPlateConsumed)
    checkArrivals(this.chairs, this.buildings)
    if (this.timeSinceCheck < CHECK_INTERVAL) return
    this.timeSinceCheck = 0
    tryAssignRestaurantBots(
      this.chairs,
      this.buildings,
      this.bots,
      this.staffBotFilter,
      this.relationshipSystem
        ? (idA: string, idB: string) => this.relationshipSystem?.getPairSocialBias(idA, idB, 'private') ?? 0
        : undefined,
      this.relationshipSystem
        ? (subjectId: string, otherId: string, weight: number) =>
            this.relationshipSystem?.registerJealousyExposure(subjectId, otherId, weight)
        : undefined,
    )
  }

  cleanupUnseated(): void { cleanupUnseated(this.chairs, this.reservations) }
  releaseChairForBot(bot: BotNirv): void { releaseChairForBot(this.chairs, this.reservations, bot) }

  private placeInSlot(table: TableRecord, slot: PlateSlot, recipeId: string, sprite: Phaser.GameObjects.Sprite): boolean {
    if (slot.plate) return false
    slot.plate = { recipeId, sprite }
    sprite.setPosition(table.x + slot.offsetX, table.y + slot.offsetY)
    return true
  }

  private findContainingBuilding(x: number, y: number): string | null {
    return this.buildings.find(b => b.containsPixel(x, y))?.id ?? null
  }

  actorInsideObjectBuilding(actorX: number, actorY: number, objectX: number, objectY: number): boolean {
    return actorInsideObjectBuilding(this.buildings, actorX, actorY, objectX, objectY)
  }

  private isAdjacentToTable(cx: number, cy: number): boolean {
    return this.tables.some(t => this.isGridAdjacent(cx, cy, t.x, t.y))
  }

  isGridAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    const ga = screenToGrid(ax, ay)
    const gb = screenToGrid(bx, by)
    const gdx = Math.abs(Math.round(ga.gx) - Math.round(gb.gx))
    const gdy = Math.abs(Math.round(ga.gy) - Math.round(gb.gy))
    return gdx + gdy <= 1
  }

  private recalcChairAdjacency(): void {
    for (const chair of this.chairs) chair.nextToTable = this.isAdjacentToTable(chair.x, chair.y)
  }
}
