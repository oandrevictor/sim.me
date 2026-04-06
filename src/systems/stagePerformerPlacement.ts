import type { Stage } from '../entities/Stage'
import type { BotNirv } from '../entities/BotNirv'
import type { StageAttraction } from '../storage/stagePersistence'
import type { BandRecord } from '../storage/bandPersistence'
import { computeSoloPlatformPerformPlacement, computeStagePerformPlacement } from '../utils/stagePerformLayout'
import { gridToScreen } from '../utils/isoGrid'
import { getPerformerBotIdsForAttraction } from './stagePerformerIds'

/**
 * Send solo/band members onto the stage platform.
 * Skips bots busy in the restaurant until they are free (StageSystem retries periodically).
 * Does not restart path if already heading to / on this stage (idempotent).
 */
export function placeBotsAsStagePerformers(
  stage: Stage,
  bots: BotNirv[],
  attraction: StageAttraction,
  getBands: () => BandRecord[],
): void {
  const ids = getPerformerBotIdsForAttraction(attraction, getBands).slice(0, stage.maxPerformerCount)
  if (ids.length === 0) return

  const { gridX, gridY, gridW, gridH } = stage
  const { cells, interior: stageInterior } = stage.soloOnly
    ? computeSoloPlatformPerformPlacement(gridX, gridY, gridW, gridH)
    : computeStagePerformPlacement(gridX, gridY, gridW, gridH, ids.length)
  ids.forEach((id, i) => {
    const bot = bots.find(b => b.id === id)
    if (!bot) return
    if (
      bot.state === 'eating' ||
      bot.state === 'awaiting_service' ||
      bot.state === 'seated' ||
      bot.state === 'walking_to_chair' ||
      bot.state === 'walking_to_water' ||
      bot.state === 'walking_to_water_queue' ||
      bot.state === 'waiting_at_water_queue' ||
      bot.state === 'drinking_water' ||
      bot.state === 'walking_to_bed' ||
      bot.state === 'sleeping'
    ) return

    const enRouteHere =
      bot.stageId === stage.id &&
      (bot.state === 'walking_to_perform' || bot.state === 'performing_on_stage')
    if (enRouteHere) return

    if (
      bot.state === 'watching_stage' ||
      bot.state === 'walking_to_stage' ||
      bot.state === 'performing_on_stage' ||
      bot.state === 'walking_to_perform'
    ) {
      bot.leaveStage()
    }

    const cell = cells[i]
    if (!cell) return
    const pos = gridToScreen(cell.gx, cell.gy)
    bot.redirectToPerformSpot(pos.x, pos.y, stage.id, cell, stageInterior)
  })
}
