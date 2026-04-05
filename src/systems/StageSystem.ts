import type { Stage } from '../entities/Stage'
import type { BotNirv } from '../entities/BotNirv'
import type { BandRecord } from '../storage/bandPersistence'
import type { StageAttraction, StageRecord } from '../storage/stagePersistence'
import {
  createRuntimeState,
  cycleEndsAt,
  setAttractionOnState,
  type StagePerformanceRuntimeState,
} from './stagePerformanceRuntime'
import type { StagePerformanceView } from './stagePerformanceTypes'
import {
  advancePerformanceCycles,
  cleanupDetachedWatchers,
  registerWatcherArrivals,
  tryAttractBotsToStages,
  updateConcurrentWatcherMax,
} from './stageAudienceTick'
import { getPerformerBotIdsForAttraction } from './stagePerformerIds'
import { placeBotsAsStagePerformers } from './stagePerformerPlacement'

export type { StagePerformanceView } from './stagePerformanceTypes'

const CHECK_INTERVAL = 3000

export class StageSystem {
  private runtimeByStageId = new Map<string, StagePerformanceRuntimeState>()
  private timeSinceCheck = 0
  private watchingBots = new Map<BotNirv, { stageId: string; x: number; y: number }>()
  private arrivalRegistered = new Set<string>()

  constructor(
    private readonly stages: Stage[],
    private readonly bots: BotNirv[],
    private readonly getBands: () => BandRecord[],
  ) {}

  private tickCtx() {
    return {
      stages: this.stages,
      bots: this.bots,
      getBands: this.getBands,
      runtimeByStageId: this.runtimeByStageId,
      watchingBots: this.watchingBots,
      arrivalRegistered: this.arrivalRegistered,
    }
  }

  initFromRecords(records: StageRecord[]): void {
    const now = performance.now()
    for (const r of records) {
      this.runtimeByStageId.set(
        r.id,
        createRuntimeState(r.attraction ?? null, now, r.performanceHistory ?? []),
      )
    }
  }

  ensureRuntimeForStage(stageId: string): void {
    if (this.runtimeByStageId.has(stageId)) return
    this.runtimeByStageId.set(stageId, createRuntimeState(null, performance.now(), []))
  }

  private syncRuntimesWithStageList(): void {
    const now = performance.now()
    for (const s of this.stages) {
      if (!this.runtimeByStageId.has(s.id)) {
        this.runtimeByStageId.set(s.id, createRuntimeState(null, now, []))
      }
    }
  }

  setStageAttraction(stageId: string, attraction: StageAttraction | null): void {
    this.ensureRuntimeForStage(stageId)
    const st = this.runtimeByStageId.get(stageId)!
    this.kickWatchersForStage(stageId)
    for (const k of [...this.arrivalRegistered]) {
      if (k.startsWith(`${stageId}:`)) this.arrivalRegistered.delete(k)
    }
    setAttractionOnState(stageId, st, attraction, performance.now())
    if (attraction) {
      const stage = this.stages.find(s => s.id === stageId)
      if (stage) placeBotsAsStagePerformers(stage, this.bots, attraction, this.getBands)
    }
  }

  /** After bots exist, move saved solo/band acts onto their stages */
  syncPerformersAfterBotsSpawned(): void {
    for (const stage of this.stages) {
      const att = this.getStageAttraction(stage.id)
      if (!att) continue
      const ids = getPerformerBotIdsForAttraction(att, this.getBands)
      if (ids.length === 0) {
        this.setStageAttraction(stage.id, null)
        continue
      }
      if (att.kind === 'solo' && !this.bots.some(b => b.id === att.botId)) {
        this.setStageAttraction(stage.id, null)
        continue
      }
      placeBotsAsStagePerformers(stage, this.bots, att, this.getBands)
    }
  }

  getStageAttraction(stageId: string): StageAttraction | null {
    return this.runtimeByStageId.get(stageId)?.attraction ?? null
  }

  getPerformanceView(stageId: string): StagePerformanceView | null {
    this.ensureRuntimeForStage(stageId)
    const st = this.runtimeByStageId.get(stageId)
    if (!st) return null
    const now = performance.now()
    const ends = cycleEndsAt(st)
    return {
      attraction: st.attraction,
      currentUnique: st.uniqueWatcherIds.size,
      maxConcurrent: st.maxConcurrent,
      cycleRemainingMs: st.attraction ? Math.max(0, ends - now) : 0,
      history: [...st.history],
    }
  }

  removeRuntime(stageId: string): void {
    this.runtimeByStageId.delete(stageId)
    this.kickWatchersForStage(stageId)
    for (const k of [...this.arrivalRegistered]) {
      if (k.startsWith(`${stageId}:`)) this.arrivalRegistered.delete(k)
    }
  }

  private kickWatchersForStage(stageId: string): void {
    for (const [bot, meta] of [...this.watchingBots]) {
      if (meta.stageId !== stageId) continue
      this.watchingBots.delete(bot)
      if (bot.state === 'watching_stage' || bot.state === 'walking_to_stage') bot.leaveStage()
    }
    for (const bot of this.bots) {
      if (bot.stageId !== stageId) continue
      if (bot.state === 'performing_on_stage' || bot.state === 'walking_to_perform') bot.leaveStage()
    }
  }

  update(delta: number): void {
    this.syncRuntimesWithStageList()
    const ctx = this.tickCtx()
    const now = performance.now()

    advancePerformanceCycles(ctx, now)
    registerWatcherArrivals(ctx)
    updateConcurrentWatcherMax(ctx)

    this.timeSinceCheck += delta
    if (this.timeSinceCheck < CHECK_INTERVAL) return
    this.timeSinceCheck = 0

    cleanupDetachedWatchers(ctx)
    tryAttractBotsToStages(ctx)

    // Pick up performers who were busy (restaurant) when line-up was set, or missed placement
    for (const stage of this.stages) {
      const att = this.getStageAttraction(stage.id)
      if (att) placeBotsAsStagePerformers(stage, this.bots, att, this.getBands)
    }
  }
}
