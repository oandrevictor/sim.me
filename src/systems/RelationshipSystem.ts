import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { WorldClock } from './WorldClock'
import { loadRestaurantStaffRecords } from '../storage/restaurantStaffPersistence'
import {
  type NirvInteractionRecord,
  type RelationshipEventRecord,
  type RelationshipEventSource,
  type RelationshipNegativeSource,
  type RelationshipStage,
} from '../storage/relationshipPersistence'
import { computeStageWithConflict, isRomantic } from './relationshipStage'
import { tryMergeRelationshipHouses } from './relationshipHousing'
import type { HomeSpace } from './HomeSpace'
import { flushRelationshipRuntime, hydrateRelationshipRuntime } from './relationshipStorageRuntime'
import {
  applyPairTensionMutation,
  bondWeightFromStage,
  collectRomanticPartners,
  decayAmount,
  decayEventSource,
  jealousySeverity,
  negativeEventTypeForSource,
  shouldApplyNeedStress,
} from './relationshipTensionRuntime'
import {
  createRelationship,
  createRelationshipBehavior,
  pairKey,
  relationshipBondTier,
  updateRelationshipBehaviorFromChat,
  type Relationship,
  type RelationshipBehavior,
} from './relationshipTypes'
import {
  listRecentInteractions as listTimelineRecentInteractions,
  listRecentInteractionsForNirv as listTimelineRecentInteractionsForNirv,
  listRecentInteractionsForPair as listTimelineRecentInteractionsForPair,
  listRecentRelationshipEvents as listTimelineRecentRelationshipEvents,
  listRelationshipEvents as listTimelineRelationshipEvents,
  recordFirstInteractionEvent,
  recordNirvInteraction,
  recordRelationshipTensionEvent,
  recordStageTransitionEvent,
} from './relationshipTimeline'

const AFFINITY_PER_TICK = 2
const AFFINITY_SHARED_BONUS = 3
const AFFINITY_NOVELTY_BONUS = 5
const AFFINITY_CAP = 200
const FLIRT_BASE_CHANCE = 0.05
const FLIRT_PER_SHARED_INTEREST = 0.05
const FLIRT_CHANCE_CAP = 0.5
const SAVE_DEBOUNCE_MS = 1000
export type { RelationshipStage } from '../storage/relationshipPersistence'
export type SocialBiasContext = 'private' | 'public' | 'group'
export type NeedStressSource = 'hunger' | 'hydration' | 'bladder'
export type RelationshipEvent = RelationshipEventRecord
export type NirvInteraction = NirvInteractionRecord
export class RelationshipSystem {
  private rels = new Map<string, Relationship>()
  private behavior = new Map<string, RelationshipBehavior>()
  private events: RelationshipEvent[] = []
  private interactions: NirvInteraction[] = []
  private lastNeedStressAt = new Map<string, number>()
  private dirty = false
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly clock: WorldClock,
    private readonly getBots: () => readonly BotNirv[],
    private readonly getHomes: () => readonly HomeSpace[],
  ) {
    this.hydrateFromStorage()
  }

  private hydrateFromStorage(): void {
    const runtime = hydrateRelationshipRuntime(this.rels, this.behavior)
    this.events = runtime.events
    this.interactions = runtime.interactions
  }

  /** Wire this into SocialSystem.onChatTick. */
  handleChatTick = (
    a: BotNirv,
    b: BotNirv,
    ctx: { sharedInterestCount: number; firstMeeting: boolean },
  ): void => {
    const rel = this.getOrCreate(a.id, b.id)
    if (ctx.firstMeeting && recordFirstInteractionEvent(this.events, rel, this.clock.getDayCount())) {
      this.markDirty()
    }
    const bonus =
      ctx.sharedInterestCount * AFFINITY_SHARED_BONUS +
      (ctx.firstMeeting ? AFFINITY_NOVELTY_BONUS : 0)
    rel.affinity = Math.min(AFFINITY_CAP, rel.affinity + AFFINITY_PER_TICK + bonus)

    const prevStage = rel.stage
    const behavior = this.getOrCreateBehavior(rel.pairKey)
    const sameWorkplace = this.areColleagues(a.id, b.id)
    rel.stage = this.computeStage(rel, sameWorkplace, behavior.conflictScore)
    behavior.lastInteractionDay = this.clock.getDayCount()
    recordNirvInteraction(
      this.interactions,
      a.id,
      b.id,
      ctx.sharedInterestCount > 0 ? 'shared_interest_chat' : 'chat_tick',
      this.clock.getDayCount(),
      { sharedInterestCount: ctx.sharedInterestCount },
    )
    updateRelationshipBehaviorFromChat(behavior, rel, ctx.sharedInterestCount)

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
      recordStageTransitionEvent(this.events, this.interactions, rel, prevStage, rel.stage, this.clock.getDayCount())
      this.markDirty()
    }
    else if (ctx.firstMeeting || ctx.sharedInterestCount > 0) this.markDirty()
  }

  /** Used by GroupActivitySystem to check Game Night eligibility. */
  getRelationshipStage(idA: string, idB: string): RelationshipStage | null {
    return this.rels.get(pairKey(idA, idB))?.stage ?? null
  }

  /**
   * Called once per group activity tick for all bots in the session.
   * Applies a chat tick to every pair — group bonding counts as quality time.
   * activityBonus elevates the shared-interest count so group activities
   * build relationships faster than incidental 1-on-1 chats.
   */
  handleGroupTick(bots: BotNirv[], activityBonus: number): void {
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) {
        this.handleChatTick(bots[i]!, bots[j]!, {
          sharedInterestCount: activityBonus,
          firstMeeting: false,
        })
      }
    }
  }

  private getOrCreate(idA: string, idB: string): Relationship {
    const key = pairKey(idA, idB)
    let rel = this.rels.get(key)
    if (!rel) {
      rel = createRelationship(idA, idB)
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
      behavior = createRelationshipBehavior(key, this.clock.getDayCount())
      this.behavior.set(key, behavior)
    }
    return behavior
  }

  private tryMergeHouses(rel: Relationship): void {
    const changed = tryMergeRelationshipHouses({
      rel,
      homes: this.getHomes(),
      bots: this.getBots(),
      events: this.events,
      dayCount: this.clock.getDayCount(),
    })
    if (changed) this.markDirty()
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
    const prevAffinity = rel.affinity
    applyPairTensionMutation(rel, behavior, severity, source)
    const affinityDelta = rel.affinity - prevAffinity
    rel.stage = this.computeStage(rel, this.areColleagues(idA, idB), behavior.conflictScore)
    if (rel.stage !== prevStage) {
      recordRelationshipTensionEvent(
        this.events,
        this.interactions,
        rel,
        'relationship_decayed',
        eventSource,
        this.clock.getDayCount(),
        affinityDelta,
        prevStage,
        rel.stage,
      )
    } else {
      recordRelationshipTensionEvent(
        this.events,
        this.interactions,
        rel,
        negativeEventTypeForSource(source),
        eventSource,
        this.clock.getDayCount(),
        affinityDelta,
      )
    }
    this.markDirty()
  }

  applyNeedStress(bot: BotNirv, severity: number, _source: NeedStressSource): void {
    if (!shouldApplyNeedStress(this.lastNeedStressAt, bot.id, severity)) return
    for (const rel of this.rels.values()) {
      if (rel.idA !== bot.id && rel.idB !== bot.id) continue
      this.applyPairTension(rel.idA, rel.idB, severity * bot.badMoodEffect * 0.45, 'need_stress', 'need_pressure')
    }
  }

  registerIgnoredAtDoor(visitorId: string, ownerId: string): void {
    this.applyPairTension(visitorId, ownerId, 1.5, 'ignored_at_door', 'door_rejection')
  }

  registerCrowdingPair(botA: BotNirv, botB: BotNirv, distance: number): void {
    void botA
    void botB
    void distance
    // Crowding irritation disabled by design.
    return
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
      if (rel.stage !== prevStage) {
        recordRelationshipTensionEvent(
          this.events,
          this.interactions,
          rel,
          'relationship_decayed',
          decayEventSource(),
          dayCount,
          undefined,
          prevStage,
          rel.stage,
        )
      }
      this.markDirty()
    }
  }

  isHighBondPair(idA: string, idB: string): boolean {
    const rel = this.getRelationship(idA, idB)
    if (!rel) return false
    return relationshipBondTier(rel) !== 'none'
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
    return listTimelineRelationshipEvents(this.events, pairKeyValue)
  }

  listEventsForPair(idA: string, idB: string): RelationshipEvent[] {
    return this.listRelationshipEvents(pairKey(idA, idB))
  }

  listRecentRelationshipEvents(limit: number): RelationshipEvent[] {
    return listTimelineRecentRelationshipEvents(this.events, limit)
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
    flushRelationshipRuntime(this.rels.values(), this.behavior.values(), this.events, this.interactions)
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

  listRecentInteractionsForPair(idA: string, idB: string, limit = 10): NirvInteraction[] {
    return listTimelineRecentInteractionsForPair(this.interactions, idA, idB, limit)
  }

  listRecentInteractionsForNirv(id: string, limit = 30): NirvInteraction[] {
    return listTimelineRecentInteractionsForNirv(this.interactions, id, limit)
  }

  listRecentInteractions(limit = 50): NirvInteraction[] {
    return listTimelineRecentInteractions(this.interactions, limit)
  }
}
