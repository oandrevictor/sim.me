import type {
  RelationshipBondTier,
  RelationshipNegativeSource,
  RelationshipStage,
} from '../storage/relationshipPersistence'

export interface Relationship {
  pairKey: string
  idA: string
  idB: string
  stage: RelationshipStage
  affinity: number
  flirtCount: number
  flirtDays: Set<number>
  isCohabiting: boolean
}

export interface RelationshipBehavior {
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

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`
}

export function createRelationship(idA: string, idB: string): Relationship {
  const [a, b] = idA < idB ? [idA, idB] : [idB, idA]
  return {
    pairKey: pairKey(idA, idB),
    idA: a,
    idB: b,
    stage: 'acquaintance',
    affinity: 0,
    flirtCount: 0,
    flirtDays: new Set(),
    isCohabiting: false,
  }
}

export function createRelationshipBehavior(key: string, dayCount: number): RelationshipBehavior {
  return {
    pairKey: key,
    conflictScore: 0,
    recentPositiveTicks: 0,
    recentNegativeTicks: 0,
    bondTier: 'none',
    lastInteractionDay: dayCount,
    jealousyPressure: 0,
    crowdingStrikes: 0,
    negativeBySource: {},
  }
}

export function relationshipBondTier(rel: Relationship): RelationshipBondTier {
  if (rel.isCohabiting) return 'housemate'
  if (rel.stage === 'married') return 'spouse'
  if (rel.stage === 'lover' || rel.stage === 'dating' || rel.stage === 'engaged') return 'lover'
  if (rel.stage === 'friend') return 'friend'
  return 'none'
}

export function updateRelationshipBehaviorFromChat(
  behavior: RelationshipBehavior,
  rel: Relationship,
  sharedInterestCount: number,
): void {
  behavior.bondTier = relationshipBondTier(rel)
  const positiveSignal = 1 + Math.min(2, sharedInterestCount)
  behavior.recentPositiveTicks = Math.min(40, behavior.recentPositiveTicks + positiveSignal)
  behavior.recentNegativeTicks = Math.max(0, behavior.recentNegativeTicks - 1)
  if (rel.affinity >= 30) behavior.conflictScore = Math.max(0, behavior.conflictScore - 1)
  behavior.jealousyPressure = Math.max(0, behavior.jealousyPressure - 0.5)
}
