import {
  loadNirvInteractionRecords,
  loadRelationshipBehaviorRecords,
  loadRelationshipEventRecords,
  loadRelationships,
  saveNirvInteractionRecords,
  saveRelationshipBehaviorRecords,
  saveRelationshipEventRecords,
  saveRelationships,
  type NirvInteractionRecord,
  type RelationshipBehaviorRecord,
  type RelationshipEventRecord,
  type RelationshipRecord,
} from '../storage/relationshipPersistence'
import type { Relationship, RelationshipBehavior } from './relationshipTypes'

export function hydrateRelationshipRuntime(
  rels: Map<string, Relationship>,
  behavior: Map<string, RelationshipBehavior>,
): { events: RelationshipEventRecord[]; interactions: NirvInteractionRecord[] } {
  for (const r of loadRelationships()) {
    rels.set(r.pairKey, {
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
    behavior.set(b.pairKey, {
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
  return {
    events: loadRelationshipEventRecords(),
    interactions: loadNirvInteractionRecords(),
  }
}

export function flushRelationshipRuntime(
  rels: Iterable<Relationship>,
  behavior: Iterable<RelationshipBehavior>,
  events: RelationshipEventRecord[],
  interactions: NirvInteractionRecord[],
): void {
  const records: RelationshipRecord[] = [...rels].map(r => ({
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

  const behaviorRecords: RelationshipBehaviorRecord[] = [...behavior].map(b => ({
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
  saveRelationshipEventRecords(events)
  saveNirvInteractionRecords(interactions)
}
