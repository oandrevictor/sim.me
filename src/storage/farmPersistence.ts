import { cacheGet, cacheSet } from './saveCache'
import { SAVE_KEYS } from './saveSchema'

export interface FarmRecord {
  cornCount: number
  farmerBotIds: string[]
  stockerBotIds: string[]
}

const STORAGE_KEY = SAVE_KEYS.farm

export function loadFarmRecord(): FarmRecord {
  try {
    const raw = cacheGet(STORAGE_KEY)
    if (!raw) return emptyFarmRecord()
    const parsed = JSON.parse(raw) as Partial<FarmRecord>
    return {
      cornCount: Math.max(0, Math.floor(parsed.cornCount ?? 0)),
      farmerBotIds: Array.isArray(parsed.farmerBotIds) ? [...new Set(parsed.farmerBotIds)] : [],
      stockerBotIds: Array.isArray(parsed.stockerBotIds) ? [...new Set(parsed.stockerBotIds)] : [],
    }
  } catch {
    return emptyFarmRecord()
  }
}

export function saveFarmRecord(record: FarmRecord): void {
  cacheSet(STORAGE_KEY, JSON.stringify({
    cornCount: Math.max(0, Math.floor(record.cornCount)),
    farmerBotIds: [...new Set(record.farmerBotIds)],
    stockerBotIds: [...new Set(record.stockerBotIds)],
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

export function saveStockerBotIds(ids: string[]): void {
  const record = loadFarmRecord()
  record.stockerBotIds = [...new Set(ids)]
  saveFarmRecord(record)
}

export function spendCorn(maxAmount: number): number {
  const record = loadFarmRecord()
  const spent = Math.min(record.cornCount, Math.max(0, Math.floor(maxAmount)))
  if (spent <= 0) return 0
  record.cornCount -= spent
  saveFarmRecord(record)
  return spent
}

function emptyFarmRecord(): FarmRecord {
  return { cornCount: 0, farmerBotIds: [], stockerBotIds: [] }
}
