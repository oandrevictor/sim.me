import type { BotNirv } from '../entities/BotNirv'
import type {
  ChairRecord,
  CounterRecord,
  CounterReservationKind,
  PlateSlot,
  TableRecord,
  WaiterServiceClaim,
} from './restaurantTypes'

export class RestaurantReservations {
  private waiterClaims = new Map<string, WaiterServiceClaim>()

  constructor(
    private readonly counters: CounterRecord[],
    private readonly tables: TableRecord[],
    private readonly chairs: ChairRecord[],
    private readonly isGridAdjacent: (ax: number, ay: number, bx: number, by: number) => boolean,
  ) {}

  reserveCounter(
    buildingId: string,
    botId: string,
    kind: CounterReservationKind,
    canUse: (counter: CounterRecord) => boolean = () => true,
  ): CounterRecord | null {
    const existing = this.counters.find(c => c.reservation?.botId === botId && c.reservation.kind === kind)
    if (existing && !existing.plate && canUse(existing)) return existing
    if (existing) existing.reservation = null
    for (const c of this.counters) {
      if (c.buildingId !== buildingId || c.plate || c.reservation || !canUse(c)) continue
      c.reservation = { kind, botId }
      return c
    }
    return null
  }

  releaseCounterForBot(botId: string): void {
    for (const c of this.counters) {
      if (c.reservation?.botId === botId) c.reservation = null
    }
  }

  canPlaceOnReservedCounter(botId: string, x: number, y: number): boolean {
    const c = this.counters.find(counter => counter.x === x && counter.y === y)
    return !!c && !c.plate && c.reservation?.botId === botId
  }

  claimWaiterService(
    buildingId: string,
    botId: string,
    canUseCounter: (counter: CounterRecord) => boolean,
    canUseTable: (table: TableRecord) => boolean,
  ): WaiterServiceClaim | null {
    const existing = this.waiterClaims.get(botId)
    if (existing && this.isClaimUsable(existing)) return existing
    if (existing) this.releaseWaiterClaim(botId)

    const target = this.findServiceTarget(buildingId, canUseTable)
    if (!target) return null
    const counter = this.counters.find(c =>
      c.buildingId === buildingId && c.plate && !c.reservation && canUseCounter(c),
    )
    if (!counter) return null

    counter.reservation = { kind: 'waiter_pickup', botId }
    target.chair.serviceClaimedByWaiterBotId = botId
    target.slot.reservedByWaiterBotId = botId
    const claim = { botId, counter, chair: target.chair, table: target.table, slot: target.slot, pickedUp: false }
    this.waiterClaims.set(botId, claim)
    return claim
  }

  getWaiterClaim(botId: string): WaiterServiceClaim | null {
    return this.waiterClaims.get(botId) ?? null
  }

  markWaiterPickedUp(botId: string): void {
    const claim = this.waiterClaims.get(botId)
    if (!claim) return
    claim.pickedUp = true
    if (claim.counter.reservation?.botId === botId) claim.counter.reservation = null
  }

  canDeliverWaiterClaim(botId: string): boolean {
    const claim = this.waiterClaims.get(botId)
    return !!claim &&
      claim.chair.occupiedBy?.state === 'awaiting_service' &&
      claim.slot.plate === null &&
      claim.slot.reservedByWaiterBotId === botId
  }

  releaseWaiterClaim(botId: string): void {
    const claim = this.waiterClaims.get(botId)
    if (!claim) return
    if (claim.counter.reservation?.botId === botId) claim.counter.reservation = null
    if (claim.chair.serviceClaimedByWaiterBotId === botId) claim.chair.serviceClaimedByWaiterBotId = null
    if (claim.slot.reservedByWaiterBotId === botId) claim.slot.reservedByWaiterBotId = null
    this.waiterClaims.delete(botId)
  }

  releaseAllForBot(botId: string): void {
    this.releaseCounterForBot(botId)
    this.releaseWaiterClaim(botId)
  }

  releaseForCounter(counter: CounterRecord): void {
    if (counter.reservation) counter.reservation = null
    for (const claim of [...this.waiterClaims.values()]) {
      if (claim.counter === counter) this.releaseWaiterClaim(claim.botId)
    }
  }

  releaseForTable(table: TableRecord): void {
    for (const claim of [...this.waiterClaims.values()]) {
      if (claim.table === table) this.releaseWaiterClaim(claim.botId)
    }
  }

  releaseForChair(chair: ChairRecord): void {
    const botId = chair.serviceClaimedByWaiterBotId
    if (botId) this.releaseWaiterClaim(botId)
  }

  releaseForCustomer(bot: BotNirv): void {
    for (const claim of [...this.waiterClaims.values()]) {
      if (claim.chair.occupiedBy === bot) this.releaseWaiterClaim(claim.botId)
    }
  }

  private findServiceTarget(
    buildingId: string,
    canUseTable: (table: TableRecord) => boolean,
  ): { chair: ChairRecord; table: TableRecord; slot: PlateSlot } | null {
    for (const table of this.tables) {
      if (table.buildingId !== buildingId || !canUseTable(table)) continue
      const slot = table.slots.find(s => !s.plate && !s.reservedByWaiterBotId)
      if (!slot) continue
      const chair = this.chairs.find(c =>
        c.buildingId === buildingId &&
        c.occupiedBy?.state === 'awaiting_service' &&
        !c.serviceClaimedByWaiterBotId &&
        this.isGridAdjacent(c.x, c.y, table.x, table.y),
      )
      if (chair) return { chair, table, slot }
    }
    return null
  }

  private isClaimUsable(claim: WaiterServiceClaim): boolean {
    return claim.chair.occupiedBy?.state === 'awaiting_service' && claim.slot.plate === null
  }
}
