export interface FarmRecord {
  cornCount: number
  farmerBotIds: string[]
}

const STORAGE_KEY = 'simme_farm_v1'

export function loadFarmRecord(): FarmRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { cornCount: 0, farmerBotIds: [] }
    const parsed = JSON.parse(raw) as Partial<FarmRecord>
    return {
      cornCount: Math.max(0, Math.floor(parsed.cornCount ?? 0)),
      farmerBotIds: Array.isArray(parsed.farmerBotIds) ? [...new Set(parsed.farmerBotIds)] : [],
    }
  } catch {
    return { cornCount: 0, farmerBotIds: [] }
  }
}

export function saveFarmRecord(record: FarmRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    cornCount: Math.max(0, Math.floor(record.cornCount)),
    farmerBotIds: [...new Set(record.farmerBotIds)],
  }))
}

export function addCorn(amount: number): number {
  const record = loadFarmRecord()
  record.cornCount = Math.max(0, record.cornCount + amount)
  saveFarmRecord(record)
  return record.cornCount
}

export function saveFarmerBotIds(ids: string[]): void {
  const record = loadFarmRecord()
  record.farmerBotIds = [...new Set(ids)]
  saveFarmRecord(record)
}
