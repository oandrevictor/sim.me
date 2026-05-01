import type { BotNirv } from '../entities/BotNirv'
import type { RelationshipEventSource, RelationshipEventType, RelationshipNegativeSource, RelationshipStage } from '../storage/relationshipPersistence'
import { isRomantic } from './relationshipStage'

export interface RuntimeRelationship {
  idA: string
  idB: string
  stage: RelationshipStage
  affinity: number
}

export interface RuntimeBehavior {
  conflictScore: number
  recentNegativeTicks: number
  recentPositiveTicks: number
  jealousyPressure: number
  crowdingStrikes: number
  negativeBySource: Partial<Record<RelationshipNegativeSource, number>>
  lastInteractionDay: number
}

export function applyPairTensionMutation(
  rel: RuntimeRelationship,
  behavior: RuntimeBehavior,
  severity: number,
  source: RelationshipNegativeSource,
): void {
  const delta = Math.max(0.3, severity)
  rel.affinity = Math.max(-100, rel.affinity - delta * 1.5)
  behavior.conflictScore = Math.min(140, behavior.conflictScore + delta)
  behavior.recentNegativeTicks = Math.min(70, behavior.recentNegativeTicks + delta)
  behavior.recentPositiveTicks = Math.max(0, behavior.recentPositiveTicks - delta * 0.5)
  behavior.negativeBySource[source] = (behavior.negativeBySource[source] ?? 0) + delta
  if (source === 'jealousy') behavior.jealousyPressure = Math.min(100, behavior.jealousyPressure + delta)
  if (source === 'crowding') behavior.crowdingStrikes = Math.min(100, behavior.crowdingStrikes + delta)
}

export function collectRomanticPartners(rels: Iterable<RuntimeRelationship>, id: string): string[] {
  const ids: string[] = []
  for (const rel of rels) {
    if (!isRomantic(rel.stage)) continue
    if (rel.idA === id) ids.push(rel.idB)
    else if (rel.idB === id) ids.push(rel.idA)
  }
  return ids
}

export function bondWeightFromStage(stage: RelationshipStage, isCohabiting: boolean): number {
  if (isCohabiting) return 0.65
  if (stage === 'married') return 0.85
  if (stage === 'engaged' || stage === 'dating' || stage === 'lover') return 0.7
  if (stage === 'friend') return 0.45
  if (stage === 'colleague') return 0.2
  return 0
}

export function negativeEventTypeForSource(source: RelationshipNegativeSource): RelationshipEventType {
  if (source === 'need_stress') return 'need_stress'
  if (source === 'ignored_at_door') return 'ignored_at_door'
  if (source === 'crowding') return 'crowding_conflict'
  if (source === 'jealousy') return 'jealousy_spike'
  return 'interest_mismatch'
}

export function jealousySeverity(multiplierBot: BotNirv | undefined, weight: number): number {
  return weight * (multiplierBot?.jealousyTendencyMultiplier ?? 1)
}

export function decayAmount(idleDays: number, conflictScore: number): number {
  return Math.min(6, idleDays * 0.45 + conflictScore * 0.015)
}

export function decayEventSource(): RelationshipEventSource {
  return 'decay_tick'
}
