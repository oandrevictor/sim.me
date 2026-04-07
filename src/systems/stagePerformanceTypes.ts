import type { PerformanceCycleRecord, StageAttraction } from '../storage/stagePersistence'

export interface StagePerformanceView {
  attraction: StageAttraction | null
  currentUnique: number
  maxConcurrent: number
  cycleRemainingMs: number
  history: PerformanceCycleRecord[]
}
