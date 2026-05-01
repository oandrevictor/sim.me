import { cacheDelete, cacheGet, cacheSet } from './saveCache'
import { SAVE_KEYS } from './saveSchema'
import { GRID_COLS, GRID_ROWS } from '../config/world'

export type WallSide = 'n' | 's' | 'e' | 'w'

export interface WallRecord {
  gx: number
  gy: number
  side: WallSide
}

export function wallCellKey(record: WallRecord): string {
  return `${record.gx},${record.gy},${record.side}`
}

const STORAGE_KEY = SAVE_KEYS.walls

function isInBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < GRID_COLS && gy < GRID_ROWS
}

function normalize(record: WallRecord): WallRecord | null {
  const gx = Math.floor(record.gx)
  const gy = Math.floor(record.gy)
  if (!isInBounds(gx, gy)) return null
  const side = record.side
  if (side !== 'n' && side !== 's' && side !== 'e' && side !== 'w') return null
  return { gx, gy, side }
}

/** Convert a legacy edge-based record to the new cell-internal format. */
function migrateLegacyRecord(raw: any): WallRecord | null {
  if (!raw || typeof raw.gx !== 'number' || typeof raw.gy !== 'number') return null
  // New format already has `side`
  if (typeof raw.side === 'string') return normalize(raw)
  // Legacy edge format: { orientation: 'h' | 'v', gx, gy }
  if (raw.orientation === 'h') {
    // Horizontal edge at top of row gy → north wall of cell (gx, gy)
    return normalize({ gx: raw.gx, gy: raw.gy, side: 'n' })
  }
  if (raw.orientation === 'v') {
    // Vertical edge at left of column gx → west wall of cell (gx, gy)
    return normalize({ gx: raw.gx, gy: raw.gy, side: 'w' })
  }
  return null
}

function persist(records: WallRecord[]): void {
  const walls = new Map<string, WallRecord>()
  for (const record of records) {
    const wall = normalize(record)
    if (wall) walls.set(wallCellKey(wall), wall)
  }
  cacheSet(STORAGE_KEY, JSON.stringify([...walls.values()]))
}

export function loadWalls(): WallRecord[] {
  try {
    const records = JSON.parse(cacheGet(STORAGE_KEY) ?? '[]') as any[]
    return records.map(migrateLegacyRecord).filter((r): r is WallRecord => !!r)
  } catch {
    return []
  }
}

export function saveWalls(records: WallRecord[]): void {
  persist(records)
}

export function clearWalls(): void {
  cacheDelete(STORAGE_KEY)
}
