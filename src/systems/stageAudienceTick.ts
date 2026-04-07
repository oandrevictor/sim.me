import Phaser from 'phaser'
import type { Stage } from '../entities/Stage'
import type { BotNirv } from '../entities/BotNirv'
import { gridToScreen } from '../utils/isoGrid'
import type { BandRecord } from '../storage/bandPersistence'
import type { MusicTag } from '../data/musicTags'
import { affinityScore, rollAttractedToStage } from './stageAffinity'
import { interestOverlapsPerformance } from '../entities/nirvFun'
import {
  cycleEndsAt,
  endCycleAndPersist,
  onWatcherArrived,
  tickMaxConcurrent,
  type StagePerformanceRuntimeState,
} from './stagePerformanceRuntime'
import { botIsStagePerformer } from './stagePerformerIds'

const MAX_WATCHERS_PER_STAGE = 5
const WATCH_RADIUS_TILES = 20
const TILE_W = 64

export interface StageAudienceTickContext {
  readonly stages: Stage[]
  readonly bots: BotNirv[]
  readonly getBands: () => BandRecord[]
  readonly runtimeByStageId: Map<string, StagePerformanceRuntimeState>
  readonly watchingBots: Map<BotNirv, { stageId: string; x: number; y: number }>
  readonly arrivalRegistered: Set<string>
}

function resolvePerformanceTags(
  ctx: StageAudienceTickContext,
  stageId: string,
): readonly MusicTag[] {
  const rt = ctx.runtimeByStageId.get(stageId)
  if (!rt?.attraction) return []
  const a = rt.attraction
  if (a.kind === 'solo') {
    const b = ctx.bots.find(x => x.id === a.botId)
    return b?.performerTags ?? []
  }
  return ctx.getBands().find(b => b.id === a.bandId)?.tags ?? []
}

function getStageCenterPixel(stage: Stage): { x: number; y: number } {
  return gridToScreen(stage.gridX + stage.gridW / 2, stage.gridY + stage.gridH / 2)
}

export function advancePerformanceCycles(ctx: StageAudienceTickContext, now: number): void {
  for (const stage of ctx.stages) {
    const rt = ctx.runtimeByStageId.get(stage.id)
    if (!rt?.attraction) continue
    if (now < cycleEndsAt(rt)) continue
    endCycleAndPersist(stage.id, rt, now)
    for (const bot of ctx.bots) {
      if (bot.stageId !== stage.id) continue
      if (
        bot.state !== 'watching_stage' &&
        bot.state !== 'walking_to_stage' &&
        bot.state !== 'performing_on_stage' &&
        bot.state !== 'walking_to_perform'
      ) continue
      ctx.watchingBots.delete(bot)
      bot.leaveStage()
    }
    for (const k of [...ctx.arrivalRegistered]) {
      if (k.startsWith(`${stage.id}:`)) ctx.arrivalRegistered.delete(k)
    }
  }
}

export function registerWatcherArrivals(ctx: StageAudienceTickContext): void {
  for (const bot of ctx.bots) {
    if (bot.state !== 'watching_stage' || !bot.stageId) continue
    const key = `${bot.stageId}:${bot.id}`
    if (ctx.arrivalRegistered.has(key)) continue
    const rt = ctx.runtimeByStageId.get(bot.stageId)
    if (rt?.attraction && botIsStagePerformer(bot.id, rt.attraction, ctx.getBands)) continue
    if (rt?.attraction) {
      ctx.arrivalRegistered.add(key)
      onWatcherArrived(rt, bot.id)
    }
  }
}

export function updateConcurrentWatcherMax(ctx: StageAudienceTickContext): void {
  for (const stage of ctx.stages) {
    const rt = ctx.runtimeByStageId.get(stage.id)
    if (!rt?.attraction) continue
    let n = 0
    for (const bot of ctx.bots) {
      if (bot.stageId !== stage.id) continue
      if (botIsStagePerformer(bot.id, rt.attraction, ctx.getBands)) continue
      if (bot.state === 'watching_stage' || bot.state === 'walking_to_stage') n++
    }
    tickMaxConcurrent(rt, n)
  }
}

export function cleanupDetachedWatchers(ctx: StageAudienceTickContext): void {
  for (const [bot] of [...ctx.watchingBots]) {
    if (bot.state === 'walking' || bot.state === 'waiting') {
      ctx.watchingBots.delete(bot)
    }
  }
}

export function tryAttractBotsToStages(ctx: StageAudienceTickContext): void {
  if (ctx.stages.length === 0) return

  for (const bot of ctx.bots) {
    const funSeeking = bot.nirv.getFunLevel() <= bot.nirv.getFunThreshold()
    if (!funSeeking && bot.state !== 'waiting') continue
    if (funSeeking && bot.state !== 'waiting' && bot.state !== 'walking') continue
    if (ctx.watchingBots.has(bot)) continue

    let bestStage: Stage | null = null
    let bestDist = Infinity
    let bestTags: readonly MusicTag[] = []

    for (const stage of ctx.stages) {
      const rt = ctx.runtimeByStageId.get(stage.id)
      if (!rt?.attraction) continue

      const watcherCount = [...ctx.watchingBots.values()].filter(w => w.stageId === stage.id).length
      if (watcherCount >= MAX_WATCHERS_PER_STAGE) continue

      const stageCenter = getStageCenterPixel(stage)
      const dist = Phaser.Math.Distance.Between(
        bot.nirv.sprite.x, bot.nirv.sprite.y,
        stageCenter.x, stageCenter.y,
      )

      if (dist < TILE_W * WATCH_RADIUS_TILES && dist < bestDist) {
        bestDist = dist
        bestStage = stage
        bestTags = resolvePerformanceTags(ctx, stage.id)
      }
    }

    if (!bestStage) continue

    const rtBest = ctx.runtimeByStageId.get(bestStage.id)
    if (rtBest?.attraction && botIsStagePerformer(bot.id, rtBest.attraction, ctx.getBands)) continue

    const affinity = affinityScore(bot.interests, bestTags)
    if (!funSeeking && !rollAttractedToStage(affinity)) continue

    const allPositions = bestStage.getWatchPositions()
    const occupiedPixels = new Set(
      [...ctx.watchingBots.values()]
        .filter(w => w.stageId === bestStage.id)
        .map(w => `${Math.round(w.x)},${Math.round(w.y)}`),
    )
    const available = allPositions.filter(
      p => !occupiedPixels.has(`${Math.round(p.x)},${Math.round(p.y)}`),
    )
    if (available.length === 0) continue

    const spot = available[Math.floor(Math.random() * available.length)]
    bot.setStageWatchAffinity(affinity)
    bot.setStageWatchInterestMatch(interestOverlapsPerformance(bot.interests, bestTags))
    ctx.watchingBots.set(bot, { stageId: bestStage.id, x: spot.x, y: spot.y })
    bot.redirectToStage(spot.x, spot.y, bestStage.id)
  }
}
