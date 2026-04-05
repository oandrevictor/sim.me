import type { StageAttraction } from '../storage/stagePersistence'
import type { BandRecord } from '../storage/bandPersistence'

export function getPerformerBotIdsForAttraction(
  attraction: StageAttraction,
  getBands: () => BandRecord[],
): string[] {
  if (attraction.kind === 'solo') return [attraction.botId]
  const band = getBands().find(b => b.id === attraction.bandId)
  return band ? [...band.memberBotIds] : []
}

export function botIsStagePerformer(
  botId: string,
  attraction: StageAttraction | null | undefined,
  getBands: () => BandRecord[],
): boolean {
  if (!attraction) return false
  return getPerformerBotIdsForAttraction(attraction, getBands).includes(botId)
}
