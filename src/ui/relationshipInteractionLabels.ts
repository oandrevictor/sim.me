import type { NirvInteractionRecord } from '../storage/relationshipPersistence'
import { relationshipEventTypeLabel } from './relationshipEventLabels'

export function relationshipInteractionLabel(interaction: NirvInteractionRecord): string {
  const eventType = interaction.meta?.eventType
  if (interaction.kind === 'shared_interest_chat') return 'bonded over shared interests'
  if (interaction.kind === 'chat_tick') return 'chatted'
  if (interaction.kind === 'relationship_stage_change' && eventType) {
    return relationshipEventTypeLabel(eventType, interaction.meta?.toStage)
  }
  if (interaction.kind === 'relationship_event' && eventType) {
    return relationshipEventTypeLabel(eventType, interaction.meta?.toStage)
  }
  if (interaction.kind === 'conflict' && eventType) {
    return relationshipEventTypeLabel(eventType, interaction.meta?.toStage)
  }
  if (interaction.kind === 'decay') return 'drifted apart'
  if (interaction.kind === 'conflict') return 'had tension'
  return 'interacted'
}
