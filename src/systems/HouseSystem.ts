import Phaser from 'phaser'
import { type BotNirv, isHouseState, isWorkJobState } from '../entities/BotNirv'
import type { Building } from '../entities/Building'
import { buildingHomeSpace, type HomeSpace } from './HomeSpace'
import type { RelationshipSystem } from './RelationshipSystem'

const CHECK_INTERVAL_MS = 2500
const DOOR_REACH_PX = 34
const INTERIOR_REACH_PX = 28
const OWNER_STAY_MS = 14_000
const VISITOR_STAY_MS = 22_000
const RING_WAIT_MS = 2400
const MAX_HOUSE_RANGE_PX = 900

type VisitTimer = {
  bot: BotNirv
  kind: 'ring' | 'inside'
  remainingMs: number
}

export class HouseSystem {
  private assignAccum = 0
  private timers = new Map<string, VisitTimer>()
  private schedule: import('./ScheduleSystem').ScheduleSystem | null = null
  private relationshipSystem: RelationshipSystem | null = null

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void { this.schedule = s }
  setRelationshipSystem(system: RelationshipSystem): void { this.relationshipSystem = system }

  constructor(
    private readonly buildings: Building[],
    private readonly bots: BotNirv[],
    private readonly getLotHomes: () => HomeSpace[] = () => [],
  ) {}

  update(delta: number): void {
    this.syncBuildingRecords()
    this.checkDoorArrivals()
    this.checkInteriorArrivals()
    this.checkExitArrivals()
    this.advanceTimers(delta)
    this.repairTimers()

    this.assignAccum += delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryStartClaims()
    this.tryStartHomeTimeReturns()
    this.tryStartOwnerVisits()
    this.tryStartGuestVisits()
  }

  private tryStartHomeTimeReturns(): void {
    if (!this.schedule) return
    for (const bot of this.bots) {
      if (!this.schedule.isHomeWindow(bot)) continue
      if (!this.canStartHouseFlow(bot)) continue
      const house = this.houseForOwner(bot.id)
      if (!house) continue
      if (this.hasAnyHouseBot(house.id) && bot.houseId === house.id) continue
      const door = house.getDoorPosition()
      if (Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, door.x, door.y) < DOOR_REACH_PX) continue
      bot.redirectToHouseDoor(door.x, door.y, house.id, 'owner')
    }
  }

  syncBuildingRecords(): void {
    const validBotIds = new Set(this.bots.map(b => b.id))
    const claimedBotIds = new Set<string>()
    for (const house of this.houses()) {
      const owner = house.ownerBotId
      if (!owner) continue
      if (!validBotIds.has(owner) || claimedBotIds.has(owner)) {
        house.setOwnerBotId(null)
        continue
      }
      claimedBotIds.add(owner)
    }
    for (const building of this.buildings) {
      if (building.type !== 'house' && building.ownerBotId) building.setOwnerBotId(null)
    }
  }

  canBotUseObjectAt(bot: BotNirv, x: number, y: number): boolean {
    const house = this.assignedHouseAt(x, y)
    if (!house) return true
    if (house.ownerBotId === bot.id) return true
    return (
      bot.houseId === house.id &&
      bot.houseMode === 'visitor' &&
      (bot.state === 'inside_house' || bot.state === 'walking_into_house')
    )
  }

  canPlayerUseObjectAt(x: number, y: number): boolean {
    return this.assignedHouseAt(x, y) === null
  }

  private tryStartClaims(): void {
    for (const house of this.houses()) {
      if (house.ownerBotId || this.hasIncomingClaim(house.id)) continue
      const bot = this.nearestEligibleBot(house)
      if (!bot) continue
      const door = house.getDoorPosition()
      bot.redirectToHouseDoor(door.x, door.y, house.id, 'claim')
    }
  }

  private tryStartOwnerVisits(): void {
    for (const house of this.houses()) {
      if (!house.ownerBotId || this.hasAnyHouseBot(house.id)) continue
      if (Math.random() > 0.22) continue
      const owner = this.bots.find(b => b.id === house.ownerBotId)
      if (!owner || !this.canStartHouseFlow(owner)) continue
      const door = house.getDoorPosition()
      if (Phaser.Math.Distance.Between(owner.nirv.sprite.x, owner.nirv.sprite.y, door.x, door.y) > MAX_HOUSE_RANGE_PX) continue
      owner.redirectToHouseDoor(door.x, door.y, house.id, 'owner')
    }
  }

  private tryStartGuestVisits(): void {
    const occupiedHomes = this.houses().filter(h => h.ownerBotId && this.ownerInside(h))
    if (occupiedHomes.length === 0) return
    for (const visitor of this.bots) {
      if (!this.canStartHouseFlow(visitor)) continue
      if (Math.random() > 0.18) continue
      const house = this.pickKnownOccupiedHouse(visitor, occupiedHomes)
      if (!house || house.ownerBotId === visitor.id || this.hasVisitorForHouse(house.id)) continue
      const door = house.getDoorPosition()
      visitor.redirectToHouseDoor(door.x, door.y, house.id, 'visitor', house.ownerBotId)
    }
  }

  private checkDoorArrivals(): void {
    for (const bot of this.bots) {
      if (bot.state !== 'walking_to_house_door' || !bot.houseId) continue
      const house = this.houseById(bot.houseId)
      if (!house) {
        bot.finishHouseFlow()
        continue
      }
      const door = house.getDoorPosition()
      if (Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, door.x, door.y) > DOOR_REACH_PX) continue
      if (bot.houseMode === 'claim') this.handleClaimArrival(bot, house)
      else if (bot.houseMode === 'owner') this.sendInside(bot, house, OWNER_STAY_MS)
      else if (bot.houseMode === 'visitor') this.handleVisitorArrival(bot, house)
    }
  }

  private handleClaimArrival(bot: BotNirv, house: HomeSpace): void {
    if (house.ownerBotId || this.houseForOwner(bot.id)) {
      bot.finishHouseFlow()
      return
    }
    if (!house.assignOwner(bot.id)) {
      bot.finishHouseFlow()
      return
    }
    bot.houseMode = 'owner'
    this.sendInside(bot, house, OWNER_STAY_MS)
  }

  private handleVisitorArrival(bot: BotNirv, house: HomeSpace): void {
    const owner = this.ownerForHouse(house)
    if (!owner || owner.state !== 'inside_house') {
      if (house.ownerBotId) this.relationshipSystem?.registerIgnoredAtDoor(bot.id, house.ownerBotId)
      bot.finishHouseFlow()
      return
    }
    bot.startRingingHouse()
    owner.nirv.showChatBubble('Come in')
    this.timers.set(bot.id, { bot, kind: 'ring', remainingMs: RING_WAIT_MS })
  }

  private sendInside(bot: BotNirv, house: HomeSpace, stayMs: number): void {
    const slot = this.occupantsInHouse(house.id).length
    const p = house.getInteriorSpot(slot)
    bot.redirectIntoHouse(p.x, p.y)
    this.timers.set(bot.id, { bot, kind: 'inside', remainingMs: stayMs })
  }

  private checkInteriorArrivals(): void {
    for (const bot of this.bots) {
      if (bot.state !== 'walking_into_house' || !bot.houseId) continue
      const house = this.houseById(bot.houseId)
      if (!house) {
        bot.finishHouseFlow()
        continue
      }
      const target = bot.getWalkRedirectTarget()
      if (!target) continue
      if (Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, target.x, target.y) <= INTERIOR_REACH_PX) {
        bot.arriveInsideHouse()
      }
    }
  }

  private checkExitArrivals(): void {
    for (const bot of this.bots) {
      if (bot.state !== 'walking_out_of_house' || !bot.houseId) continue
      const house = this.houseById(bot.houseId)
      if (!house) {
        bot.finishHouseFlow()
        continue
      }
      const door = house.getDoorPosition()
      if (Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, door.x, door.y) <= DOOR_REACH_PX) {
        bot.finishHouseFlow()
      }
    }
  }

  private advanceTimers(delta: number): void {
    for (const [id, timer] of this.timers) {
      if (timer.kind === 'ring') {
        this.advanceRingTimer(id, timer, delta)
      } else {
        this.advanceInsideTimer(id, timer, delta)
      }
    }
  }

  private advanceRingTimer(id: string, timer: VisitTimer, delta: number): void {
    const visitor = timer.bot
    const house = visitor.houseId ? this.houseById(visitor.houseId) : null
    const owner = house ? this.ownerForHouse(house) : null
    if (visitor.state !== 'ringing_house' || !house || owner?.state !== 'inside_house') {
      if (owner) this.relationshipSystem?.registerIgnoredAtDoor(visitor.id, owner.id)
      this.timers.delete(id)
      visitor.finishHouseFlow()
      return
    }
    timer.remainingMs -= delta
    if (timer.remainingMs > 0) return
    owner.nirv.hideChatBubble()
    visitor.nirv.rememberKnownNirv(owner.nirv.name)
    owner.nirv.rememberKnownNirv(visitor.nirv.name)
    this.sendInside(visitor, house, VISITOR_STAY_MS)
  }

  private advanceInsideTimer(id: string, timer: VisitTimer, delta: number): void {
    const bot = timer.bot
    if (bot.state === 'walking_into_house') return
    if (bot.state !== 'inside_house' || !bot.houseId) {
      this.timers.delete(id)
      return
    }
    timer.remainingMs -= delta
    if (timer.remainingMs > 0) return
    const house = this.houseById(bot.houseId)
    if (!house) {
      bot.finishHouseFlow()
      this.timers.delete(id)
      return
    }
    const door = house.getDoorPosition()
    bot.redirectOutOfHouse(door.x, door.y)
    this.timers.delete(id)
  }

  private repairTimers(): void {
    for (const [id, timer] of this.timers) {
      if (!isHouseState(timer.bot.state)) this.timers.delete(id)
    }
  }

  private canStartHouseFlow(bot: BotNirv): boolean {
    if (isHouseState(bot.state) || isWorkJobState(bot.state)) return false
    return bot.state === 'walking' || bot.state === 'waiting'
  }

  private nearestEligibleBot(house: HomeSpace): BotNirv | null {
    const door = house.getDoorPosition()
    let best: BotNirv | null = null
    let bestD = Infinity
    for (const bot of this.bots) {
      if (!this.canStartHouseFlow(bot) || this.houseForOwner(bot.id)) continue
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, door.x, door.y)
      if (d < MAX_HOUSE_RANGE_PX && d < bestD) {
        best = bot
        bestD = d
      }
    }
    return best
  }

  private pickKnownOccupiedHouse(visitor: BotNirv, houses: HomeSpace[]): HomeSpace | null {
    const scored = houses
      .map(h => {
        const owner = this.ownerForHouse(h)
        if (!owner) return null
        const knownBoost = visitor.nirv.knowsNirv(owner.nirv.name) ? 0.2 : 0
        const relationshipBias = this.relationshipSystem?.getPairSocialBias(visitor.id, owner.id, 'private') ?? 0
        const score = knownBoost + relationshipBias
        return { house: h, score }
      })
      .filter((entry): entry is { house: HomeSpace; score: number } => !!entry)
      .sort((a, b) => b.score - a.score)
    if (scored.length === 0) return null
    const capped = scored.slice(0, Math.min(3, scored.length))
    const positive = capped.filter(c => c.score >= -0.3)
    const pool = positive.length > 0 ? positive : capped
    return Phaser.Utils.Array.GetRandom(pool)?.house ?? null
  }

  private ownerInside(house: HomeSpace): boolean {
    const owner = this.ownerForHouse(house)
    return owner?.state === 'inside_house' && owner.houseId === house.id && owner.houseMode === 'owner'
  }

  private ownerForHouse(house: HomeSpace): BotNirv | null {
    return house.ownerBotId ? this.bots.find(b => b.id === house.ownerBotId) ?? null : null
  }

  private houseForOwner(botId: string): HomeSpace | null {
    return this.houses().find(h => h.ownerBotId === botId) ?? null
  }

  private houseById(id: string): HomeSpace | null {
    return this.houses().find(h => h.id === id) ?? null
  }

  getHomes(): HomeSpace[] {
    return this.houses()
  }

  private houses(): HomeSpace[] {
    return [
      ...this.buildings.filter(b => b.type === 'house').map(buildingHomeSpace),
      ...this.getLotHomes(),
    ]
  }

  private assignedHouseAt(x: number, y: number): HomeSpace | null {
    return this.houses().find(h => h.ownerBotId && h.containsPixel(x, y)) ?? null
  }

  private occupantsInHouse(houseId: string): BotNirv[] {
    return this.bots.filter(b => b.houseId === houseId && (b.state === 'inside_house' || b.state === 'walking_into_house'))
  }

  private hasIncomingClaim(houseId: string): boolean {
    return this.bots.some(b => b.houseId === houseId && b.houseMode === 'claim' && isHouseState(b.state))
  }

  private hasAnyHouseBot(houseId: string): boolean {
    return this.bots.some(b => b.houseId === houseId && isHouseState(b.state))
  }

  private hasVisitorForHouse(houseId: string): boolean {
    return this.bots.some(b => b.houseId === houseId && b.houseMode === 'visitor' && isHouseState(b.state))
  }
}
