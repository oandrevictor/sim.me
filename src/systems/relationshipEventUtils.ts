import type { RelationshipEvent, RelationshipEventSource, RelationshipEventType, RelationshipStage } from '../storage/relationshipPersistence'

export function relationshipEventTypeForStage(stage: RelationshipStage): RelationshipEventType | null {
  if (stage === 'friend') return 'became_friend'
  if (stage === 'dating') return 'started_dating'
  if (stage === 'engaged') return 'got_engaged'
  return null
}

export function buildRelationshipEvent(params: {
  pairKey: string
  idA: string
  idB: string
  type: RelationshipEventType
  fromStage?: RelationshipStage
  toStage?: RelationshipStage
  dayCount: number
  source: RelationshipEventSource
}): RelationshipEvent {
  const now = Date.now()
  return {
    id: `${params.pairKey}:${params.type}:${now}`,
    pairKey: params.pairKey,
    idA: params.idA,
    idB: params.idB,
    type: params.type,
    fromStage: params.fromStage,
    toStage: params.toStage,
    dayCount: params.dayCount,
    timestamp: now,
    source: params.source,
  }
}
