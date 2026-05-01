import LZString from 'lz-string'
import { cacheGet, cacheSet, cacheDelete } from './saveCache'
import { SAVE_KEYS } from './saveSchema'

export type CropStage = 'empty' | 'seeded' | 'early' | 'ready'
export type CropSeed = 'corn'

export type ObjectType = 'obstacle' | 'interactable' | 'background' | 'table2' | 'table4' | 'chair' | 'stove' | 'stove_white_clay' | 'counter' | 'food_plate' | 'trash' | 'drinking_water' | 'snack_machine' | 'fruit_crate' | 'fridge' | 'floor_yellow' | 'portable_toilet' | 'crop' | 'bed_ms_blue' | 'bed_ms_red' | 'bed_ms_grey' | 'bed_ms_space' | 'bed_ws_blue' | 'bed_ws_red' | 'bed_ws_grey' | 'bed_ws_space' | 'lamp_post' | 'tv'

export interface PlacedObjectRecord {
  id: string
  type: ObjectType
  x: number
  y: number
  recipeId?: string
  rotation?: number
  stock?: number
  cropStage?: CropStage
  cropSeed?: CropSeed
  cropStageStartedAt?: number
}

const STORAGE_KEY = SAVE_KEYS.placedObjects
/** Legacy plain JSON array, or compressed payload (smaller for large worlds). */
const LZ_PREFIX = '__LZ1__'

function serialize(records: PlacedObjectRecord[]): string {
  const json = JSON.stringify(records)
  try {
    const compressed = LZString.compressToUTF16(json)
    const packed = LZ_PREFIX + compressed
    if (packed.length < json.length) return packed
  } catch {
    // fall through to raw JSON
  }
  return json
}

function deserialize(raw: string | null): PlacedObjectRecord[] {
  if (raw == null || raw === '') return []
  if (raw.startsWith(LZ_PREFIX)) {
    const decoded = LZString.decompressFromUTF16(raw.slice(LZ_PREFIX.length))
    if (decoded) {
      try {
        return JSON.parse(decoded) as PlacedObjectRecord[]
      } catch {
        return []
      }
    }
    return []
  }
  try {
    return JSON.parse(raw) as PlacedObjectRecord[]
  } catch {
    return []
  }
}

function persistRecords(records: PlacedObjectRecord[]): boolean {
  cacheSet(STORAGE_KEY, serialize(records))
  return true
}

export function loadPlacedObjects(): PlacedObjectRecord[] {
  try {
    return deserialize(cacheGet(STORAGE_KEY))
  } catch {
    return []
  }
}

export function savePlacedObject(record: PlacedObjectRecord): void {
  const records = loadPlacedObjects()
  records.push(record)
  persistRecords(records)
}

export function removeObjectAt(x: number, y: number): PlacedObjectRecord | null {
  const records = loadPlacedObjects()
  const idx = records.findIndex(r => r.x === x && r.y === y)
  if (idx === -1) return null
  const [removed] = records.splice(idx, 1)
  persistRecords(records)
  return removed
}

export function removeObjectByType(x: number, y: number, type: ObjectType): PlacedObjectRecord | null {
  const records = loadPlacedObjects()
  const idx = records.findIndex(r => r.x === x && r.y === y && r.type === type)
  if (idx === -1) return null
  const [removed] = records.splice(idx, 1)
  persistRecords(records)
  return removed
}

export function updatePlacedObjectAt(
  x: number,
  y: number,
  type: ObjectType,
  patch: Partial<PlacedObjectRecord>,
): PlacedObjectRecord | null {
  const records = loadPlacedObjects()
  const idx = records.findIndex(r => r.x === x && r.y === y && r.type === type)
  if (idx === -1) return null
  records[idx] = { ...records[idx]!, ...patch }
  persistRecords(records)
  return records[idx]!
}

export function clearPlacedObjects(): void {
  cacheDelete(STORAGE_KEY)
}
