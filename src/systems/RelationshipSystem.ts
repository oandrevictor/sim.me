import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Building } from '../entities/Building'
import type { WorldClock } from './WorldClock'
import { loadRestaurantStaffRecords } from '../storage/restaurantStaffPersistence'
import {
  loadRelationshipBehaviorRecords,
  loadRelationshipEventRecords,
  loadNirvInteractionRecords,
  loadRelationships,
  saveRelationshipBehaviorRecords,
  saveRelationshipEventRecords,
  saveNirvInteractionRecords,
  saveRelationships,
  type NirvInteractionKind,
  type NirvInteractionRecord,
  type RelationshipBondTier,
  type RelationshipBehaviorRecord,
  type RelationshipEventRecord,
  type RelationshipEventSource,
  type RelationshipEventType,
  type RelationshipNegativeSource,
  type RelationshipRecord,
  type RelationshipStage,
} from '../storage/relationshipPersistence'
import { addHouseOwner, removeHouseOwner } from '../storage/buildingPersistence'
import { buildRelationshipEvent, relationshipEventTypeForStage } from './relationshipEventUtils'
import { computeStageWithConflict, isRomantic } from './relationshipStage'
import {
  applyPairTensionMutation,
  bondWeightFromStage,
  collectRomanticPartners,
  decayAmount,
  decayEventSource,
  jealousySeverity,
  negativeEventTypeForSource,
} from './relationshipTensionRuntime'

const AFFINITY_PER_TICK = 2
const AFFINITY_SHARED_BONUS = 3
const AFFINITY_NOVELTY_BONUS = 5
const AFFINITY_CAP = 200
const FLIRT_BASE_CHANCE = 0.05
const FLIRT_PER_SHARED_INTEREST = 0.05
const FLIRT_CHANCE_CAP = 0.5
const SAVE_DEBOUNCE_MS = 1000
export type { RelationshipStage } from '../storage/relationshipPersistence'

interface Relationship {
  pairKey: string
  idA: string
  idB: string
  stage: RelationshipStage
  affinity: number
  flirtCount: number
  flirtDays: Set<number>
  isCohabiting: boolean
}

interface RelationshipBehavior {
  pairKey: string
  conflictScore: number
  recentPositiveTicks: number
  recentNegativeTicks: number
  bondTier: RelationshipBondTier
  lastInteractionDay: number
  jealousyPressure: number
  crowdingStrikes: number
  negativeBySource: Partial<Record<RelationshipNegativeSource, number>>
}
export type SocialBiasContext = 'private' | 'public' | 'group'
export type RelationshipEvent = RelationshipEventRecord
export type NirvInteraction = NirvInteractionRecord
const MAX_INTERACTIONS_TOTAL = 500
const MAX_INTERACTIONS_PER_PAIR = 30
function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`
}
export class RelationshipSystem {
  private rels = new Map<string, Relationship>()
  private behavior = new Map<string, RelationshipBehavior>()
  private events: RelationshipEvent[] = []
  private interactions: NirvInteraction[] = []
  private lastNeedStressAt = new Map<string, number>()
  private lastCrowdingAt = new Map<string, number>()
  private dirty = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly clock: WorldClock,
    private readonly getBots: () => readonly BotNirv[],
    private readonly getBuildings: () => readonly Building[],
  ) {
    this.hydrateFromStorage()
  }

  private hydrateFromStorage(): void {
    for (const r of loadRelationships()) {
      this.rels.set(r.pairKey, {
        pairKey: r.pairKey,
        idA: r.idA,
        idB: r.idB,
        stage: r.stage,
        affinity: r.affinity,
        flirtCount: r.flirtCount,
        flirtDays: new Set(r.flirtDays),
        isCohabiting: r.isCohabiting,
      })
    }
    for (const b of loadRelationshipBehaviorRecords()) {
      this.behavior.set(b.pairKey, {
        pairKey: b.pairKey,
        conflictScore: b.conflictScore,
        recentPositiveTicks: b.recentPositiveTicks,
        recentNegativeTicks: b.recentNegativeTicks,
        bondTier: b.bondTier ?? 'none',
        lastInteractionDay: b.lastInteractionDay ?? 0,
        jealousyPressure: b.jealousyPressure ?? 0,
        crowdingStrikes: b.crowdingStrikes ?? 0,
        negativeBySource: b.negativeBySource ?? {},
      })
    }
    this.events = loadRelationshipEventRecords()
    this.interactions = loadNirvInteractionRecords()
  }

  /** Wire this into SocialSystem.onChatTick. */
  handleChatTick = (
    a: BotNirv,
    b: BotNirv,
    ctx: { sharedInterestCount: number; firstMeeting: boolean },
  ): void => {
    const rel = this.getOrCreate(a.id, b.id)
    const bonus =
      ctx.sharedInterestCount * AFFINITY_SHARED_BONUS +
      (ctx.firstMeeting ? AFFINITY_NOVELTY_BONUS : 0)
    rel.affinity = Math.min(AFFINITY_CAP, rel.affinity + AFFINITY_PER_TICK + bonus)

    const prevStage = rel.stage
    const behavior = this.getOrCreateBehavior(rel.pairKey)
    const sameWorkplace = this.areColleagues(a.id, b.id)
    rel.stage = this.computeStage(rel, sameWorkplace, behavior.conflictScore)
    behavior.lastInteractionDay = this.clock.getDayCount()
    this.recordInteraction(a.id, b.id, ctx.sharedInterestCount > 0 ? 'shared_interest_chat' : 'chat_tick', {
      sharedInterestCount: ctx.sharedInterestCount,
    })
    this.updateBehaviorFromChat(behavior, rel, ctx.sharedInterestCount)

    if (rel.stage === 'friend' || isRomantic(rel.stage)) {
      const flirtChance = Math.min(
        FLIRT_CHANCE_CAP,
        FLIRT_BASE_CHANCE + ctx.sharedInterestCount * FLIRT_PER_SHARED_INTEREST,
      )
      if (Math.random() < flirtChance) {
        rel.flirtCount++
        rel.flirtDays.add(this.clock.getDayCount())
        rel.stage = this.computeStage(rel, sameWorkplace, behavior.conflictScore)
      }
    }
    if (ctx.sharedInterestCount === 0) {
      this.applyPairTension(a.id, b.id, 0.6, 'interest_mismatch', 'interest_conflict')
    }

    if (rel.stage === 'married' && !rel.isCohabiting) {
      this.tryMergeHouses(rel)
    }

    if (rel.stage !== prevStage) {
      this.recordStageTransitionEvent(rel, prevStage, rel.stage)
      this.markDirty()
    }
    else if (ctx.firstMeeting || ctx.sharedInterestCount > 0) this.markDirty()
  }

  private getOrCreate(idA: string, idB: string): Relationship {
    const key = pairKey(idA, idB)
    let rel = this.rels.get(key)
    if (!rel) {
      const [a, b] = idA < idB ? [idA, idB] : [idB, idA]
      rel = {
        pairKey: key,
        idA: a,
        idB: b,
        stage: 'acquaintance',
        affinity: 0,
        flirtCount: 0,
        flirtDays: new Set(),
        isCohabiting: false,
      }
      this.rels.set(key, rel)
    }
    return rel
  }

  private areColleagues(idA: string, idB: string): boolean {
    const records = loadRestaurantStaffRecords()
    for (const r of records) {
      const all = [...r.chefBotIds, ...r.waiterBotIds]
      if (all.includes(idA) && all.includes(idB)) return true
    }
    return false
  }

  private getOrCreateBehavior(key: string): RelationshipBehavior {
    let behavior = this.behavior.get(key)
    if (!behavior) {
      behavior = {
        pairKey: key,
        conflictScore: 0,
        recentPositiveTicks: 0,
        recentNegativeTicks: 0,
        bondTier: 'none',
        lastInteractionDay: this.clock.getDayCount(),
        jealousyPressure: 0,
        crowdingStrikes: 0,
        negativeBySource: {},
      }
      this.behavior.set(key, behavior)
    }
    return behavior
  }

  private updateBehaviorFromChat(
    behavior: RelationshipBehavior,
    rel: Relationship,
    sharedInterestCount: number,
  ): void {
    behavior.bondTier = this.toBondTier(rel)
    const positiveSignal = 1 + Math.min(2, sharedInterestCount)
    behavior.recentPositiveTicks = Math.min(40, behavior.recentPositiveTicks + positiveSignal)
    behavior.recentNegativeTicks = Math.max(0, behavior.recentNegativeTicks - 1)
    if (rel.affinity >= 30) behavior.conflictScore = Math.max(0, behavior.conflictScore - 1)
    behavior.jealousyPressure = Math.max(0, behavior.jealousyPressure - 0.5)
  }

  private toBondTier(rel: Relationship): RelationshipBondTier {
    if (rel.isCohabiting) return 'housemate'
    if (rel.stage === 'married') return 'spouse'
    if (rel.stage === 'lover' || rel.stage === 'dating' || rel.stage === 'engaged') return 'lover'
    if (rel.stage === 'friend') return 'friend'
    return 'none'
  }

  private tryMergeHouses(rel: Relationship): void {
    const buildings = this.getBuildings()
    const houseA = buildings.find(b => b.type === 'house' && b.ownerBotIds.includes(rel.idA))
    const houseB = buildings.find(b => b.type === 'house' && b.ownerBotIds.includes(rel.idB))
    if (!houseA || !houseB || houseA.id === houseB.id) {
      // already share a house, or one of them is unhoused
      if (houseA && houseB && houseA.id === houseB.id) {
        rel.isCohabiting = true
        if (this.recordCohabitingEvent(rel, 'already_cohabiting')) this.markDirty()
      }
      return
    }
    // Keep the lower-id-owned house; vacate the other
    const keep = rel.idA < rel.idB ? houseA : houseB
    const leave = keep === houseA ? houseB : houseA
    const movingBotId = keep === houseA ? rel.idB : rel.idA

    keep.addOwnerBotId(movingBotId)
    leave.removeOwnerBotId(movingBotId)
    addHouseOwner(keep.id, movingBotId)
    removeHouseOwner(leave.id, movingBotId)

    // If the leaving house is now empty, also persist clear (already done by removeHouseOwner)
    const movingBot = this.getBots().find(b => b.id === movingBotId)
    if (movingBot) movingBot.houseId = keep.id

    rel.isCohabiting = true
    this.recordCohabitingEvent(rel, 'cohabitation_merge')
    this.markDirty()
  }

  private recordStageTransitionEvent(rel: Relationship, fromStage: RelationshipStage, toStage: RelationshipStage): void {
    const type = relationshipEventTypeForStage(toStage)
    if (!type) return
    this.events.push(buildRelationshipEvent({
      pairKey: rel.pairKey,
      idA: rel.idA,
      idB: rel.idB,
      type,
      fromStage,
      toStage,
      dayCount: this.clock.getDayCount(),
      source: 'stage_transition',
    }))
    this.recordInteraction(rel.idA, rel.idB, 'relationship_stage_change', {
      eventType: type,
      fromStage,
      toStage,
    })
  }

  private recordCohabitingEvent(rel: Relationship, source: RelationshipEventSource): boolean {
    const hasMovedInEvent = this.events.some(
      e => e.pairKey === rel.pairKey && e.type === 'moved_in_together',
    )
    if (hasMovedInEvent) return false
    this.events.push(buildRelationshipEvent({
      pairKey: rel.pairKey,
      idA: rel.idA,
      idB: rel.idB,
      type: 'moved_in_together',
      fromStage: rel.stage,
      toStage: rel.stage,
      dayCount: this.clock.getDayCount(),
      source,
    }))
    return true
  }

  // --- Read APIs for UI ---

  getRelationship(idA: string, idB: string): Relationship | null {
    return this.rels.get(pairKey(idA, idB)) ?? null
  }

  addConflict(idA: string, idB: string, delta = 1): void {
    const rel = this.getOrCreate(idA, idB)
    const behavior = this.getOrCreateBehavior(rel.pairKey)
    behavior.conflictScore = Math.min(100, behavior.conflictScore + Math.max(0, delta))
    behavior.recentNegativeTicks = Math.min(40, behavior.recentNegativeTicks + Math.max(1, delta))
    behavior.recentPositiveTicks = Math.max(0, behavior.recentPositiveTicks - 1)
    this.markDirty()
  }

  applyPairTension(
    idA: string,
    idB: string,
    severity: number,
    source: RelationshipNegativeSource,
    eventSource: RelationshipEventSource,
  ): void {
    const rel = this.getOrCreate(idA, idB)
    const behavior = this.getOrCreateBehavior(rel.pairKey)
    const prevStage = rel.stage
    applyPairTensionMutation(rel, behavior, severity, source)
    rel.stage = this.computeStage(rel, this.areColleagues(idA, idB), behavior.conflictScore)
    if (rel.stage !== prevStage) this.recordNegativeEvent(rel, 'relationship_decayed', eventSource, prevStage, rel.stage)
    else this.recordNegativeEvent(rel, negativeEventTypeForSource(source), eventSource)
    this.markDirty()
  }

  applyNeedStress(bot: BotNirv, severity: number): void {
    if (!this.shouldApplyNeedStress(bot.id, severity)) return
    for (const rel of this.rels.values()) {
      if (rel.idA !== bot.id && rel.idB !== bot.id) continue
      this.applyPairTension(rel.idA, rel.idB, severity * bot.badMoodEffect * 0.45, 'need_stress', 'need_pressure')
    }
  }

  registerIgnoredAtDoor(visitorId: string, ownerId: string): void {
    this.applyPairTension(visitorId, ownerId, 1.5, 'ignored_at_door', 'door_rejection')
  }

  registerCrowdingPair(botA: BotNirv, botB: BotNirv, distance: number): void {
    const threshold = Math.max(10, Math.min(botA.crowdThreshold, botB.crowdThreshold))
    const effectiveThreshold = Math.max(8, threshold * 0.58)
    if (distance > effectiveThreshold) return
    if (!this.shouldApplyCrowding(botA.id, botB.id)) return
    const intensity = (effectiveThreshold - distance + 1) / effectiveThreshold
    this.applyPairTension(botA.id, botB.id, intensity * 0.28, 'crowding', 'crowding')
  }

  registerJealousyExposure(subjectId: string, otherId: string, weight: number): void {
    const romanticPartners = collectRomanticPartners(this.rels.values(), subjectId).filter(p => p !== otherId)
    if (romanticPartners.length === 0) return
    for (const partnerId of romanticPartners) {
      const subjectBot = this.getBots().find(b => b.id === partnerId)
      this.applyPairTension(partnerId, subjectId, jealousySeverity(subjectBot, weight), 'jealousy', 'jealousy')
    }
  }

  tickDailyDecay(dayCount: number): void {
    for (const rel of this.rels.values()) {
      const behavior = this.getOrCreateBehavior(rel.pairKey)
      const idleDays = dayCount - behavior.lastInteractionDay
      if (idleDays < 3) continue
      const prevStage = rel.stage
      const decay = decayAmount(idleDays, behavior.conflictScore)
      rel.affinity = Math.max(-100, rel.affinity - decay)
      rel.stage = this.computeStage(rel, this.areColleagues(rel.idA, rel.idB), behavior.conflictScore)
      if (rel.stage !== prevStage) this.recordNegativeEvent(rel, 'relationship_decayed', decayEventSource(), prevStage, rel.stage)
      this.markDirty()
    }
  }

  isHighBondPair(idA: string, idB: string): boolean {
    const rel = this.getRelationship(idA, idB)
    if (!rel) return false
    return this.toBondTier(rel) !== 'none'
  }

  isConflictPair(idA: string, idB: string): boolean {
    const rel = this.getRelationship(idA, idB)
    if (!rel) return false
    const behavior = this.getOrCreateBehavior(rel.pairKey)
    return behavior.conflictScore > 0 || rel.affinity < 0
  }

  getPairSocialBias(idA: string, idB: string, context: SocialBiasContext): number {
    const rel = this.getRelationship(idA, idB)
    const key = pairKey(idA, idB)
    const behavior = this.behavior.get(key) ?? this.getOrCreateBehavior(key)
    const stage = rel ? this.getDerivedStage(idA, idB) : 'acquaintance'
    const bondWeight = bondWeightFromStage(stage, rel?.isCohabiting ?? false)
    const affinitySignal = Phaser.Math.Clamp((rel?.affinity ?? 0) / 120, -0.7, 0.8)
    const positiveSignal = Phaser.Math.Clamp(behavior.recentPositiveTicks / 30, 0, 0.45)
    const conflictBase = behavior.conflictScore / 18 + Phaser.Math.Clamp((-(rel?.affinity ?? 0)) / 90, 0, 1)
    const contextPenalty = context === 'private' ? 1.15 : context === 'group' ? 0.55 : 0.7
    const conflictPenalty = Math.min(1.8, conflictBase * contextPenalty)
    return Phaser.Math.Clamp(bondWeight + affinitySignal + positiveSignal - conflictPenalty, -1, 1.2)
  }

  /** Returns relationship view, recomputing colleague stage on the fly so workplace changes show up immediately. */
  getDerivedStage(idA: string, idB: string): RelationshipStage {
    const rel = this.getRelationship(idA, idB)
    const sameWorkplace = this.areColleagues(idA, idB)
    if (!rel) return sameWorkplace ? 'colleague' : 'acquaintance'
    return this.computeStage(rel, sameWorkplace, this.getOrCreateBehavior(rel.pairKey).conflictScore)
  }

  listAll(): Relationship[] {
    return [...this.rels.values()]
  }

  listRelationshipEvents(pairKeyValue: string): RelationshipEvent[] {
    return this.events
      .filter(e => e.pairKey === pairKeyValue)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  listEventsForPair(idA: string, idB: string): RelationshipEvent[] {
    return this.listRelationshipEvents(pairKey(idA, idB))
  }

  listRecentRelationshipEvents(limit: number): RelationshipEvent[] {
    return [...this.events]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(0, limit))
  }

  // --- Persistence ---

  private markDirty(): void {
    this.dirty = true
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (this.dirty) this.flush()
    }, SAVE_DEBOUNCE_MS)
  }

  flush(): void {
    this.dirty = false
    const records: RelationshipRecord[] = [...this.rels.values()].map(r => ({
      pairKey: r.pairKey,
      idA: r.idA,
      idB: r.idB,
      stage: r.stage,
      affinity: r.affinity,
      flirtCount: r.flirtCount,
      flirtDays: [...r.flirtDays],
      isCohabiting: r.isCohabiting,
    }))
    saveRelationships(records)
    const behaviorRecords: RelationshipBehaviorRecord[] = [...this.behavior.values()].map(b => ({
      pairKey: b.pairKey,
      conflictScore: b.conflictScore,
      recentPositiveTicks: b.recentPositiveTicks,
      recentNegativeTicks: b.recentNegativeTicks,
      bondTier: b.bondTier,
      lastInteractionDay: b.lastInteractionDay,
      jealousyPressure: b.jealousyPressure,
      crowdingStrikes: b.crowdingStrikes,
      negativeBySource: b.negativeBySource,
    }))
    saveRelationshipBehaviorRecords(behaviorRecords)
    saveRelationshipEventRecords(this.events)
    saveNirvInteractionRecords(this.interactions)
  }

  private computeStage(rel: Relationship, sameWorkplace: boolean, conflictScore: number): RelationshipStage {
    return computeStageWithConflict({
      stage: rel.stage,
      affinity: rel.affinity,
      flirtCount: rel.flirtCount,
      flirtDaysSize: rel.flirtDays.size,
      sameWorkplace,
      conflictScore,
    })
  }

  private recordNegativeEvent(
    rel: Relationship,
    type: RelationshipEventType,
    source: RelationshipEventSource,
    fromStage?: RelationshipStage,
    toStage?: RelationshipStage,
  ): void {
    this.events.push(buildRelationshipEvent({
      pairKey: rel.pairKey,
      idA: rel.idA,
      idB: rel.idB,
      type,
      fromStage,
      toStage,
      dayCount: this.clock.getDayCount(),
      source,
    }))
    this.recordInteraction(rel.idA, rel.idB, type === 'relationship_decayed' ? 'decay' : 'relationship_event', {
      source,
      eventType: type,
      fromStage,
      toStage,
    })
  }

  private recordInteraction(
    idA: string,
    idB: string,
    kind: NirvInteractionKind,
    meta?: NirvInteraction['meta'],
    strength?: number,
  ): void {
    const key = pairKey(idA, idB)
    this.interactions.push({
      id: `${key}:${kind}:${Date.now()}`,
      pairKey: key,
      idA: key.split(':')[0]!,
      idB: key.split(':')[1]!,
      kind,
      dayCount: this.clock.getDayCount(),
      timestamp: Date.now(),
      strength,
      meta,
    })
    this.trimInteractions()
  }

  listRecentInteractionsForPair(idA: string, idB: string, limit = 10): NirvInteraction[] {
    const key = pairKey(idA, idB)
    return this.interactions
      .filter(i => i.pairKey === key)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(0, limit))
  }

  listRecentInteractionsForNirv(id: string, limit = 30): NirvInteraction[] {
    return this.interactions
      .filter(i => i.idA === id || i.idB === id)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(0, limit))
  }

  listRecentInteractions(limit = 50): NirvInteraction[] {
    return [...this.interactions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(0, limit))
  }

  private trimInteractions(): void {
    const byPair = new Map<string, NirvInteraction[]>()
    for (const interaction of this.interactions.sort((a, b) => b.timestamp - a.timestamp)) {
      const arr = byPair.get(interaction.pairKey) ?? []
      if (arr.length < MAX_INTERACTIONS_PER_PAIR) arr.push(interaction)
      byPair.set(interaction.pairKey, arr)
    }
    const flattened = [...byPair.values()].flat().sort((a, b) => b.timestamp - a.timestamp)
    this.interactions = flattened.slice(0, MAX_INTERACTIONS_TOTAL)
  }

  private shouldApplyNeedStress(botId: string, severity: number): boolean {
    if (severity < 1.35) return false
    const now = Date.now()
    const last = this.lastNeedStressAt.get(botId) ?? 0
    if (now - last < 90_000) return false
    const chance = Phaser.Math.Clamp(0.12 + (severity - 1.35) * 0.12, 0.12, 0.42)
    if (Math.random() > chance) return false
    this.lastNeedStressAt.set(botId, now)
    return true
  }

  private shouldApplyCrowding(idA: string, idB: string): boolean {
    const key = pairKey(idA, idB)
    const now = Date.now()
    const last = this.lastCrowdingAt.get(key) ?? 0
    if (now - last < 45_000) return false
    if (Math.random() > 0.28) return false
    this.lastCrowdingAt.set(key, now)
    return true
  }
}
