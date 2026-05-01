import type { RelationshipEvent, RelationshipStage } from '../systems/RelationshipSystem'

const STAGE_LABEL: Record<RelationshipStage, string> = {
  acquaintance: 'acquaintance',
  colleague: 'colleague',
  friend: 'friend',
  lover: 'lover',
  dating: 'dating',
  engaged: 'engaged',
  married: 'married',
}

export function relationshipEventLabel(event: RelationshipEvent): string {
  if (event.type === 'became_friend') return 'became friends'
  if (event.type === 'started_dating') return 'started dating'
  if (event.type === 'got_engaged') return 'got engaged'
  if (event.type === 'moved_in_together') return 'moved in together'
  if (event.type === 'need_stress') return 'had stress from unmet needs'
  if (event.type === 'ignored_at_door') return 'had a tense door rejection'
  if (event.type === 'crowding_conflict') return 'got irritated by crowding'
  if (event.type === 'jealousy_spike') return 'had a jealousy spike'
  if (event.type === 'interest_mismatch') return 'clashed on interests'
  if (event.type === 'relationship_decayed') return 'drifted apart'
  return event.toStage ? `moved to ${STAGE_LABEL[event.toStage]}` : 'relationship changed'
}
