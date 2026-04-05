export interface StageRecord {
  id: string
  gridX: number
  gridY: number
  rotation?: 0 | 1
}

const STORAGE_KEY = 'simme_placed_stages'

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
