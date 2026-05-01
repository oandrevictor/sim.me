import { cacheDelete, cacheGet, cacheSet } from './saveCache'
import { SAVE_KEYS } from './saveSchema'

export type LotType = 'residential' | 'commercial' | 'public'

export interface LotCell {
  gx: number
  gy: number
}

export interface LotRecord {
  id: string
  type: LotType
  cells: LotCell[]
  /** Single-owner accessor, kept in sync with `ownerBotIds[0]`. */
  ownerBotId?: string | null
  ownerBotIds?: string[]
}

const STORAGE_KEY = SAVE_KEYS.lots
const LOT_TYPES = new Set<LotType>(['residential', 'commercial', 'public'])

function cellKey(cell: LotCell): string {
  return `${cell.gx},${cell.gy}`
}

function normalize(record: LotRecord): LotRecord | null {
  const type = LOT_TYPES.has(record.type) ? record.type : 'residential'
  const ownerBotIds = type === 'residential'
    ? [...(record.ownerBotIds?.length ? record.ownerBotIds : record.ownerBotId ? [record.ownerBotId] : [])]
    : []
  const cells = new Map<string, LotCell>()
  for (const cell of record.cells ?? []) {
    if (!Number.isFinite(cell.gx) || !Number.isFinite(cell.gy)) continue
    const normalized = { gx: Math.floor(cell.gx), gy: Math.floor(cell.gy) }
    cells.set(cellKey(normalized), normalized)
  }
  const normalizedCells = [...cells.values()].sort((a, b) => a.gy - b.gy || a.gx - b.gx)
  if (normalizedCells.length === 0) return null
  return {
    id: record.id || crypto.randomUUID(),
    type,
    cells: normalizedCells,
    ownerBotId: ownerBotIds[0] ?? null,
    ownerBotIds,
  }
}

function persist(records: LotRecord[]): void {
  cacheSet(STORAGE_KEY, JSON.stringify(records.map(normalize).filter((r): r is LotRecord => !!r)))
}

export function loadLots(): LotRecord[] {
  try {
    const records = JSON.parse(cacheGet(STORAGE_KEY) ?? '[]') as LotRecord[]
    return records.map(normalize).filter((r): r is LotRecord => !!r)
  } catch {
    return []
  }
}

export function saveLots(records: LotRecord[]): void {
  persist(records)
}

export function clearLots(): void {
  cacheDelete(STORAGE_KEY)
}
