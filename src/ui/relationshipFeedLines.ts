import type { BotNirv } from '../entities/BotNirv'
import type { NirvInteraction, RelationshipEvent } from '../systems/RelationshipSystem'
import { relationshipEventLabel } from './relationshipEventLabels'
import { relationshipInteractionLabel } from './relationshipInteractionLabels'

export function relationshipEventLine(
  event: RelationshipEvent,
  byId: Map<string, BotNirv>,
  maxLength = 80,
): string {
  const impact = event.affinityDelta === undefined
    ? ''
    : ` (${event.affinityDelta >= 0 ? '+' : ''}${Math.round(event.affinityDelta)} affinity)`
  return truncate(`Day ${event.dayCount}: ${pairNames(event.idA, event.idB, byId)} ${relationshipEventLabel(event)}${impact}`, maxLength)
}

export function relationshipInteractionLine(
  interaction: NirvInteraction,
  byId: Map<string, BotNirv>,
  maxLength = 80,
): string {
  return truncate(
    `Day ${interaction.dayCount}: ${pairNames(interaction.idA, interaction.idB, byId)} ${relationshipInteractionLabel(interaction)}`,
    maxLength,
  )
}

function pairNames(idA: string, idB: string, byId: Map<string, BotNirv>): string {
  const a = byId.get(idA)?.nirv.name ?? idA
  const b = byId.get(idB)?.nirv.name ?? idB
  return `${a} & ${b}`
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}
