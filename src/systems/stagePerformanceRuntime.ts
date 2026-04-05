import type { StageAttraction, PerformanceCycleRecord } from '../storage/stagePersistence'
import { MAX_PERFORMANCE_HISTORY, updateStageRecord } from '../storage/stagePersistence'

export const PERFORMANCE_DURATION_MS = 120_000
export const EARLY_LEAVE_CHECK_INTERVAL_MS = 5_000

export interface StagePerformanceRuntimeState {
  attraction: StageAttraction | null
  cycleStartTime: number
  uniqueWatcherIds: Set<string>
  maxConcurrent: number
  history: PerformanceCycleRecord[]
}

export function createRuntimeState(
  attraction: StageAttraction | null,
  cycleStartTime: number,
  history: PerformanceCycleRecord[],
): StagePerformanceRuntimeState {
  const h = history.length > MAX_PERFORMANCE_HISTORY
    ? history.slice(-MAX_PERFORMANCE_HISTORY)
    : [...history]
  return {
    attraction,
    cycleStartTime,
    uniqueWatcherIds: new Set(),
    maxConcurrent: 0,
    history: h,
  }
}

export function cycleEndsAt(state: StagePerformanceRuntimeState): number {
  return state.cycleStartTime + PERFORMANCE_DURATION_MS
}

export function onWatcherArrived(state: StagePerformanceRuntimeState, botId: string): void {
  state.uniqueWatcherIds.add(botId)
}

export function tickMaxConcurrent(state: StagePerformanceRuntimeState, currentCount: number): void {
  if (currentCount > state.maxConcurrent) state.maxConcurrent = currentCount
}

export function endCycleAndPersist(
  stageId: string,
  state: StagePerformanceRuntimeState,
  now: number,
): void {
  const record: PerformanceCycleRecord = {
    cycleIndex: state.history.length,
    endedAt: now,
    totalUniqueWatchers: state.uniqueWatcherIds.size,
    maxConcurrent: state.maxConcurrent,
  }
  state.history.push(record)
  if (state.history.length > MAX_PERFORMANCE_HISTORY) {
    state.history = state.history.slice(-MAX_PERFORMANCE_HISTORY)
  }
  updateStageRecord(stageId, { performanceHistory: [...state.history] })
  state.uniqueWatcherIds.clear()
  state.maxConcurrent = 0
  state.cycleStartTime = now
}

export function setAttractionOnState(
  stageId: string,
  state: StagePerformanceRuntimeState,
  attraction: StageAttraction | null,
  now: number,
): void {
  state.attraction = attraction
  state.cycleStartTime = now
  state.uniqueWatcherIds.clear()
  state.maxConcurrent = 0
  updateStageRecord(stageId, {
    attraction: attraction === null ? null : attraction,
  })
}
