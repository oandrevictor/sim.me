export type RelationshipStage =
  | 'acquaintance'
  | 'colleague'
  | 'friend'
  | 'lover'
  | 'dating'
  | 'engaged'
  | 'married'

export interface RelationshipRecord {
  pairKey: string
  idA: string
  idB: string
  stage: RelationshipStage
  affinity: number
  flirtCount: number
  flirtDays: number[]
  isCohabiting: boolean
}

const STORAGE_KEY = 'simme_relationships_v1'
const BEHAVIOR_STORAGE_KEY = 'simme_relationship_behavior_v1'
const EVENT_STORAGE_KEY = 'simme_relationship_events_v1'
const INTERACTION_STORAGE_KEY = 'simme_nirv_interactions_v1'

export type RelationshipBondTier = 'none' | 'friend' | 'lover' | 'spouse' | 'housemate'

export interface RelationshipBehaviorRecord {
  pairKey: string
  conflictScore: number
  recentPositiveTicks: number
  recentNegativeTicks: number
  bondTier?: RelationshipBondTier
  lastInteractionDay?: number
  jealousyPressure?: number
  crowdingStrikes?: number
  negativeBySource?: Partial<Record<RelationshipNegativeSource, number>>
}

export type RelationshipEventType =
  | 'became_friend'
  | 'started_dating'
  | 'got_engaged'
  | 'moved_in_together'
  | 'need_stress'
  | 'ignored_at_door'
  | 'crowding_conflict'
  | 'jealousy_spike'
  | 'interest_mismatch'
  | 'relationship_decayed'

export type RelationshipEventSource =
  | 'stage_transition'
  | 'cohabitation_merge'
  | 'already_cohabiting'
  | 'need_pressure'
  | 'door_rejection'
  | 'crowding'
  | 'jealousy'
  | 'interest_conflict'
  | 'decay_tick'

export type RelationshipNegativeSource =
  | 'need_stress'
  | 'ignored_at_door'
  | 'crowding'
  | 'jealousy'
  | 'interest_mismatch'

export interface RelationshipEventRecord {
  id: string
  pairKey: string
  idA: string
  idB: string
  type: RelationshipEventType
  fromStage?: RelationshipStage
  toStage?: RelationshipStage
  dayCount: number
  timestamp: number
  source: RelationshipEventSource
}

export type NirvInteractionKind =
  | 'chat_tick'
  | 'shared_interest_chat'
  | 'relationship_event'
  | 'relationship_stage_change'
  | 'conflict'
  | 'decay'

export interface NirvInteractionRecord {
  id: string
  pairKey: string
  idA: string
  idB: string
  kind: NirvInteractionKind
  dayCount: number
  timestamp: number
  strength?: number
  meta?: {
    source?: string
    eventType?: RelationshipEventType
    sharedInterestCount?: number
    fromStage?: RelationshipStage
    toStage?: RelationshipStage
  }
}

export function loadRelationships(): RelationshipRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RelationshipRecord[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(r => ({
      pairKey: r.pairKey,
      idA: r.idA,
      idB: r.idB,
      stage: r.stage,
      affinity: r.affinity ?? 0,
      flirtCount: r.flirtCount ?? 0,
      flirtDays: Array.isArray(r.flirtDays) ? [...r.flirtDays] : [],
      isCohabiting: !!r.isCohabiting,
    }))
  } catch {
    return []
  }
}

export function saveRelationships(records: RelationshipRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function loadRelationshipBehaviorRecords(): RelationshipBehaviorRecord[] {
  try {
    const raw = localStorage.getItem(BEHAVIOR_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RelationshipBehaviorRecord[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(r => !!r?.pairKey)
      .map(r => ({
        pairKey: r.pairKey,
        conflictScore: Math.max(0, r.conflictScore ?? 0),
        recentPositiveTicks: Math.max(0, r.recentPositiveTicks ?? 0),
        recentNegativeTicks: Math.max(0, r.recentNegativeTicks ?? 0),
        bondTier: r.bondTier ?? 'none',
        lastInteractionDay: Number.isFinite(r.lastInteractionDay) ? r.lastInteractionDay : 0,
        jealousyPressure: Math.max(0, r.jealousyPressure ?? 0),
        crowdingStrikes: Math.max(0, r.crowdingStrikes ?? 0),
        negativeBySource: r.negativeBySource ?? {},
      }))
  } catch {
    return []
  }
}

export function saveRelationshipBehaviorRecords(records: RelationshipBehaviorRecord[]): void {
  localStorage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify(records))
}

export function loadRelationshipEventRecords(): RelationshipEventRecord[] {
  try {
    const raw = localStorage.getItem(EVENT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RelationshipEventRecord[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(r => !!r?.id && !!r?.pairKey && !!r?.idA && !!r?.idB)
      .map(r => ({
        id: r.id,
        pairKey: r.pairKey,
        idA: r.idA,
        idB: r.idB,
        type: r.type,
        fromStage: r.fromStage,
        toStage: r.toStage,
        dayCount: Number.isFinite(r.dayCount) ? r.dayCount : 0,
        timestamp: Number.isFinite(r.timestamp) ? r.timestamp : Date.now(),
        source: r.source ?? 'stage_transition',
      }))
  } catch {
    return []
  }
}

export function saveRelationshipEventRecords(records: RelationshipEventRecord[]): void {
  localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(records))
}

export function loadNirvInteractionRecords(): NirvInteractionRecord[] {
  try {
    const raw = localStorage.getItem(INTERACTION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as NirvInteractionRecord[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(r => !!r?.id && !!r?.pairKey && !!r?.idA && !!r?.idB)
      .map(r => ({
        id: r.id,
        pairKey: r.pairKey,
        idA: r.idA,
        idB: r.idB,
        kind: r.kind ?? 'chat_tick',
        dayCount: Number.isFinite(r.dayCount) ? r.dayCount : 0,
        timestamp: Number.isFinite(r.timestamp) ? r.timestamp : Date.now(),
        strength: Number.isFinite(r.strength) ? r.strength : undefined,
        meta: r.meta ?? {},
      }))
  } catch {
    return []
  }
}

export function saveNirvInteractionRecords(records: NirvInteractionRecord[]): void {
  localStorage.setItem(INTERACTION_STORAGE_KEY, JSON.stringify(records))
}
