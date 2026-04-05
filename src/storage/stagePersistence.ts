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
  attraction?: StageAttraction | null
  performanceHistory?: PerformanceCycleRecord[]
}

export const MAX_PERFORMANCE_HISTORY = 20

const STORAGE_KEY = 'simme_placed_stages'

function trimHistory(h: PerformanceCycleRecord[]): PerformanceCycleRecord[] {
  return h.length <= MAX_PERFORMANCE_HISTORY ? h : h.slice(-MAX_PERFORMANCE_HISTORY)
}

export function loadPlacedStages(): StageRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as StageRecord[]
  } catch {
    return []
  }
}

export function savePlacedStage(record: StageRecord): void {
  const records = loadPlacedStages()
  records.push(record)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function removePlacedStage(id: string): void {
  const records = loadPlacedStages().filter(r => r.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function clearPlacedStages(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function updateStageRecord(id: string, patch: Partial<StageRecord>): void {
  const records = loadPlacedStages()
  const i = records.findIndex(r => r.id === id)
  if (i === -1) return
  const next = { ...records[i]!, ...patch }
  if (next.performanceHistory) next.performanceHistory = trimHistory(next.performanceHistory)
  records[i] = next
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}
