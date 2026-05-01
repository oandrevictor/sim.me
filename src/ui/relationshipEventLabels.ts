import type {
  RelationshipEventRecord,
  RelationshipEventType,
  RelationshipStage,
} from '../storage/relationshipPersistence'

const STAGE_LABEL: Record<RelationshipStage, string> = {
  acquaintance: 'acquaintance',
  colleague: 'colleague',
  friend: 'friend',
  lover: 'lover',
  dating: 'dating',
  engaged: 'engaged',
  married: 'married',
}

export function relationshipEventTypeLabel(type: RelationshipEventType, toStage?: RelationshipStage): string {
  if (type === 'first_interaction') return 'met for the first time'
  if (type === 'became_friend') return 'became friends'
  if (type === 'started_dating') return 'started dating'
  if (type === 'got_engaged') return 'got engaged'
  if (type === 'moved_in_together') return 'moved in together'
  if (type === 'positive_chat') return 'had a positive chat'
  if (type === 'need_stress') return 'had stress from unmet physical needs'
  if (type === 'ignored_at_door') return 'had a tense door rejection'
  if (type === 'crowding_conflict') return 'had a relationship shift'
  if (type === 'jealousy_spike') return 'had a jealousy spike'
  if (type === 'interest_mismatch') return 'clashed on interests'
  if (type === 'relationship_decayed') return 'drifted apart'
  return toStage ? `moved to ${STAGE_LABEL[toStage]}` : 'relationship changed'
}

export function relationshipEventLabel(event: RelationshipEventRecord): string {
  return relationshipEventTypeLabel(event.type, event.toStage)
}
