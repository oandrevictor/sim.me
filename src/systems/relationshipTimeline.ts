import type {
  NirvInteractionKind,
  NirvInteractionRecord,
  RelationshipEventRecord,
  RelationshipEventSource,
  RelationshipEventType,
  RelationshipStage,
} from '../storage/relationshipPersistence'
import { buildRelationshipEvent, relationshipEventTypeForStage } from './relationshipEventUtils'
import { pairKey, type Relationship } from './relationshipTypes'
import { debugLog } from '../debug/DebugLogger'

const MAX_INTERACTIONS_TOTAL = 500
const MAX_INTERACTIONS_PER_PAIR = 30

export function isRelationshipHistoryEvent(event: RelationshipEventRecord): boolean {
  if (event.type === 'first_interaction') return true
  if (event.type === 'moved_in_together') return true
  if (event.type === 'became_friend' || event.type === 'started_dating' || event.type === 'got_engaged') return true
  return event.type === 'relationship_decayed' && !!event.fromStage && !!event.toStage && event.fromStage !== event.toStage
}

export function recordFirstInteractionEvent(
  events: RelationshipEventRecord[],
  rel: Relationship,
  dayCount: number,
): boolean {
  if (events.some(e => e.pairKey === rel.pairKey && e.type === 'first_interaction')) return false
  const event = buildRelationshipEvent({
    pairKey: rel.pairKey,
    idA: rel.idA,
    idB: rel.idB,
    type: 'first_interaction',
    fromStage: rel.stage,
    toStage: rel.stage,
    dayCount,
    source: 'first_interaction',
  })
  events.push(event)
  logRelationshipEvent(event)
  return true
}

export function recordStageTransitionEvent(
  events: RelationshipEventRecord[],
  interactions: NirvInteractionRecord[],
  rel: Relationship,
  fromStage: RelationshipStage,
  toStage: RelationshipStage,
  dayCount: number,
): void {
  const type = relationshipEventTypeForStage(toStage)
  if (!type) return
  const event = buildRelationshipEvent({
    pairKey: rel.pairKey,
    idA: rel.idA,
    idB: rel.idB,
    type,
    fromStage,
    toStage,
    dayCount,
    source: 'stage_transition',
  })
  events.push(event)
  logRelationshipEvent(event)
  recordNirvInteraction(interactions, rel.idA, rel.idB, 'relationship_stage_change', dayCount, {
    eventType: type,
    fromStage,
    toStage,
  })
}

export function recordCohabitingEvent(
  events: RelationshipEventRecord[],
  rel: Relationship,
  source: RelationshipEventSource,
  dayCount: number,
): boolean {
  if (events.some(e => e.pairKey === rel.pairKey && e.type === 'moved_in_together')) return false
  const event = buildRelationshipEvent({
    pairKey: rel.pairKey,
    idA: rel.idA,
    idB: rel.idB,
    type: 'moved_in_together',
    fromStage: rel.stage,
    toStage: rel.stage,
    dayCount,
    source,
  })
  events.push(event)
  logRelationshipEvent(event)
  return true
}

export function recordRelationshipTensionEvent(
  events: RelationshipEventRecord[],
  interactions: NirvInteractionRecord[],
  rel: Relationship,
  type: RelationshipEventType,
  source: RelationshipEventSource,
  dayCount: number,
  affinityDelta?: number,
  fromStage?: RelationshipStage,
  toStage?: RelationshipStage,
): void {
  const event = buildRelationshipEvent({
    pairKey: rel.pairKey,
    idA: rel.idA,
    idB: rel.idB,
    type,
    fromStage,
    toStage,
    dayCount,
    source,
    affinityDelta,
  })
  if (isRelationshipHistoryEvent(event)) events.push(event)
  logRelationshipEvent(event, type === 'relationship_decayed' ? 'warn' : 'info')
  recordNirvInteraction(interactions, rel.idA, rel.idB, type === 'relationship_decayed' ? 'decay' : 'conflict', dayCount, {
    source,
    eventType: type,
    affinityDelta,
    fromStage,
    toStage,
  })
}

export function recordNirvInteraction(
  interactions: NirvInteractionRecord[],
  idA: string,
  idB: string,
  kind: NirvInteractionKind,
  dayCount: number,
  meta?: NirvInteractionRecord['meta'],
  strength?: number,
): void {
  const key = pairKey(idA, idB)
  const [firstId, secondId] = key.split(':') as [string, string]
  const interaction = {
    id: `${key}:${kind}:${Date.now()}`,
    pairKey: key,
    idA: firstId,
    idB: secondId,
    kind,
    dayCount,
    timestamp: Date.now(),
    strength,
    meta,
  }
  interactions.push(interaction)
  debugLog.log('relationship.interaction_recorded', {
    pairKey: key,
    idA: firstId,
    idB: secondId,
    interactionKind: kind,
    dayCount,
    strength,
    source: meta?.source ?? '',
    relationshipEventType: meta?.eventType ?? '',
    sharedInterestCount: meta?.sharedInterestCount,
    affinityDelta: meta?.affinityDelta,
    fromStage: meta?.fromStage ?? '',
    toStage: meta?.toStage ?? '',
  }, kind === 'conflict' || kind === 'decay' ? 'warn' : 'debug')
  trimInteractions(interactions)
}

export function listRelationshipEvents(
  events: RelationshipEventRecord[],
  pairKeyValue: string,
): RelationshipEventRecord[] {
  return events
    .filter(e => e.pairKey === pairKeyValue && isRelationshipHistoryEvent(e))
    .sort(sortNewestFirst)
}

export function listRecentRelationshipEvents(
  events: RelationshipEventRecord[],
  limit: number,
): RelationshipEventRecord[] {
  return events
    .filter(isRelationshipHistoryEvent)
    .sort(sortNewestFirst)
    .slice(0, Math.max(0, limit))
}

export function listRecentInteractionsForPair(
  interactions: NirvInteractionRecord[],
  idA: string,
  idB: string,
  limit = 10,
): NirvInteractionRecord[] {
  const key = pairKey(idA, idB)
  return interactions
    .filter(i => i.pairKey === key)
    .sort(sortNewestFirst)
    .slice(0, Math.max(0, limit))
}

export function listRecentInteractionsForNirv(
  interactions: NirvInteractionRecord[],
  id: string,
  limit = 30,
): NirvInteractionRecord[] {
  return interactions
    .filter(i => i.idA === id || i.idB === id)
    .sort(sortNewestFirst)
    .slice(0, Math.max(0, limit))
}

export function listRecentInteractions(
  interactions: NirvInteractionRecord[],
  limit = 50,
): NirvInteractionRecord[] {
  return [...interactions]
    .sort(sortNewestFirst)
    .slice(0, Math.max(0, limit))
}

function trimInteractions(interactions: NirvInteractionRecord[]): void {
  const byPair = new Map<string, NirvInteractionRecord[]>()
  for (const interaction of interactions.sort(sortNewestFirst)) {
    const arr = byPair.get(interaction.pairKey) ?? []
    if (arr.length < MAX_INTERACTIONS_PER_PAIR) arr.push(interaction)
    byPair.set(interaction.pairKey, arr)
  }
  const flattened = [...byPair.values()].flat().sort(sortNewestFirst)
  interactions.splice(0, interactions.length, ...flattened.slice(0, MAX_INTERACTIONS_TOTAL))
}

function sortNewestFirst(a: { timestamp: number }, b: { timestamp: number }): number {
  return b.timestamp - a.timestamp
}

function logRelationshipEvent(event: RelationshipEventRecord, level: 'info' | 'warn' = 'info'): void {
  debugLog.log('relationship.event_recorded', {
    pairKey: event.pairKey,
    idA: event.idA,
    idB: event.idB,
    relationshipEventType: event.type,
    source: event.source,
    dayCount: event.dayCount,
    fromStage: event.fromStage ?? '',
    toStage: event.toStage ?? '',
    affinityDelta: event.affinityDelta,
  }, level)
}
