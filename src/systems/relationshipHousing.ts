import type { BotNirv } from '../entities/BotNirv'
import type { RelationshipEventRecord } from '../storage/relationshipPersistence'
import type { HomeSpace } from './HomeSpace'
import { recordCohabitingEvent } from './relationshipTimeline'
import type { Relationship } from './relationshipTypes'

export function tryMergeRelationshipHouses(params: {
  rel: Relationship
  homes: readonly HomeSpace[]
  bots: readonly BotNirv[]
  events: RelationshipEventRecord[]
  dayCount: number
}): boolean {
  const { rel, homes, bots, events, dayCount } = params
  const houseA = homes.find(h => h.ownerBotIds.includes(rel.idA))
  const houseB = homes.find(h => h.ownerBotIds.includes(rel.idB))
  if (!houseA || !houseB || houseA.id === houseB.id) {
    if (houseA && houseB && houseA.id === houseB.id) {
      rel.isCohabiting = true
      return recordCohabitingEvent(events, rel, 'already_cohabiting', dayCount)
    }
    return false
  }

  const keep = rel.idA < rel.idB ? houseA : houseB
  const leave = keep === houseA ? houseB : houseA
  const movingBotId = keep === houseA ? rel.idB : rel.idA

  keep.addOwnerBotId(movingBotId)
  leave.removeOwnerBotId(movingBotId)

  const movingBot = bots.find(b => b.id === movingBotId)
  if (movingBot) movingBot.houseId = keep.id

  rel.isCohabiting = true
  recordCohabitingEvent(events, rel, 'cohabitation_merge', dayCount)
  return true
}
