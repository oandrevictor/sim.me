import { cacheGet, cacheSet } from './saveCache'
import { SAVE_KEYS } from './saveSchema'
import { CROP_SEEDS, DEFAULT_CROP_SEED, type CropSeed } from '../data/crops'

export type CropCounts = Partial<Record<CropSeed, number>>

export interface FarmRecord {
  cropCounts: CropCounts
  farmerBotIds: string[]
  stockerBotIds: string[]
}

const STORAGE_KEY = SAVE_KEYS.farm

export function loadFarmRecord(): FarmRecord {
  try {
    const raw = cacheGet(STORAGE_KEY)
    if (!raw) return emptyFarmRecord()
    const parsed = JSON.parse(raw) as Partial<FarmRecord> & { cornCount?: number }
    return {
      cropCounts: normalizeCropCounts(parsed.cropCounts, parsed.cornCount),
      farmerBotIds: Array.isArray(parsed.farmerBotIds) ? [...new Set(parsed.farmerBotIds)] : [],
      stockerBotIds: Array.isArray(parsed.stockerBotIds) ? [...new Set(parsed.stockerBotIds)] : [],
    }
  } catch {
    return emptyFarmRecord()
  }
}

export function saveFarmRecord(record: FarmRecord): void {
  cacheSet(STORAGE_KEY, JSON.stringify({
    cropCounts: normalizeCropCounts(record.cropCounts),
    farmerBotIds: [...new Set(record.farmerBotIds)],
    stockerBotIds: [...new Set(record.stockerBotIds)],
  }))
}

export function addCrop(seed: CropSeed, amount: number): number {
  const record = loadFarmRecord()
  const current = record.cropCounts[seed] ?? 0
  record.cropCounts[seed] = Math.max(0, current + Math.floor(amount))
  saveFarmRecord(record)
  return record.cropCounts[seed] ?? 0
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

export function totalCropCount(record = loadFarmRecord()): number {
  return CROP_SEEDS.reduce((sum, seed) => sum + (record.cropCounts[seed] ?? 0), 0)
}

export function spendAnyCrop(maxAmount: number): number {
  const record = loadFarmRecord()
  let remaining = Math.max(0, Math.floor(maxAmount))
  let spent = 0
  for (const seed of CROP_SEEDS) {
    if (remaining <= 0) break
    const available = record.cropCounts[seed] ?? 0
    const used = Math.min(available, remaining)
    if (used <= 0) continue
    record.cropCounts[seed] = available - used
    remaining -= used
    spent += used
  }
  if (spent <= 0) return 0
  saveFarmRecord(record)
  return spent
}

function emptyFarmRecord(): FarmRecord {
  return { cropCounts: {}, farmerBotIds: [], stockerBotIds: [] }
}

function normalizeCropCounts(counts?: CropCounts, legacyCornCount = 0): CropCounts {
  const normalized: CropCounts = {}
  for (const seed of CROP_SEEDS) {
    const count = Math.max(0, Math.floor(counts?.[seed] ?? 0))
    if (count > 0) normalized[seed] = count
  }
  const legacyCorn = Math.max(0, Math.floor(legacyCornCount))
  if (legacyCorn > 0 && normalized[DEFAULT_CROP_SEED] === undefined) {
    normalized[DEFAULT_CROP_SEED] = legacyCorn
  }
  return normalized
}
