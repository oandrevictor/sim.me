import type { RelationshipStage } from '../storage/relationshipPersistence'

const FRIEND_AFFINITY = 50
const LOVER_FLIRTS = 3
const DATING_DAYS = 2
const ENGAGED_DAYS = 5
const MARRIED_DAYS = 7

export interface StageInput {
  readonly stage: RelationshipStage
  readonly affinity: number
  readonly flirtCount: number
  readonly flirtDaysSize: number
  readonly sameWorkplace: boolean
  readonly conflictScore: number
}

export function isRomantic(stage: RelationshipStage): boolean {
  return stage === 'lover' || stage === 'dating' || stage === 'engaged' || stage === 'married'
}

export function computeStageWithConflict(input: StageInput): RelationshipStage {
  const conflictPenalty = Math.floor(input.conflictScore / 14)
  const flirtScore = Math.max(0, input.flirtCount - conflictPenalty)
  const dayScore = Math.max(0, input.flirtDaysSize - Math.floor(input.conflictScore / 18))
  if (flirtScore >= LOVER_FLIRTS) {
    if (dayScore >= MARRIED_DAYS) return 'married'
    if (dayScore >= ENGAGED_DAYS) return 'engaged'
    if (dayScore >= DATING_DAYS) return 'dating'
    return 'lover'
  }
  if (input.affinity >= FRIEND_AFFINITY) return 'friend'
  if (input.sameWorkplace) return 'colleague'
  return 'acquaintance'
}
