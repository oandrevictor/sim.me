import type { StageVariant } from '../config/stageVariants'
import { cacheGet, cacheSet, cacheDelete } from './saveCache'
import { SAVE_KEYS } from './saveSchema'

export type StageAttraction =
  | { kind: 'solo'; botId: string }
  | { kind: 'band'; bandId: string }

export interface PerformanceCycleRecord {
  cycleIndex: number
  endedAt: number
  totalUniqueWatchers: number
  maxConcurrent: number
}

export interface StageRecord {
  id: string
  gridX: number
  gridY: number
  rotation?: 0 | 1
  /** Omit or `default` — procedural stage. `solo_platform` uses the festival deck sprite (solo acts only). */
  variant?: StageVariant
  attraction?: StageAttraction | null
  performanceHistory?: PerformanceCycleRecord[]
}

export const MAX_PERFORMANCE_HISTORY = 20

const STORAGE_KEY = SAVE_KEYS.placedStages

function trimHistory(h: PerformanceCycleRecord[]): PerformanceCycleRecord[] {
  return h.length <= MAX_PERFORMANCE_HISTORY ? h : h.slice(-MAX_PERFORMANCE_HISTORY)
}

function persist(records: StageRecord[]): void {
  cacheSet(STORAGE_KEY, JSON.stringify(records))
}

export function loadPlacedStages(): StageRecord[] {
  try {
    return JSON.parse(cacheGet(STORAGE_KEY) ?? '[]') as StageRecord[]
  } catch {
    return []
  }
}

export function savePlacedStage(record: StageRecord): void {
  const records = loadPlacedStages()
  records.push(record)
  persist(records)
}

export function removePlacedStage(id: string): void {
  persist(loadPlacedStages().filter(r => r.id !== id))
}

export function clearPlacedStages(): void {
  cacheDelete(STORAGE_KEY)
}

export function updateStageRecord(id: string, patch: Partial<StageRecord>): void {
  const records = loadPlacedStages()
  const i = records.findIndex(r => r.id === id)
  if (i === -1) return
  const next = { ...records[i]!, ...patch }
  if (next.performanceHistory) next.performanceHistory = trimHistory(next.performanceHistory)
  records[i] = next
  persist(records)
}
