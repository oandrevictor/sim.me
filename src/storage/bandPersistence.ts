import type { MusicTag } from '../data/musicTags'
import { isMusicTag } from '../data/musicTags'

export interface BandRecord {
  id: string
  name: string
  memberBotIds: string[]
  tags: MusicTag[]
}

const STORAGE_KEY = 'simme_bands'

export function loadBands(): BandRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown[]
    if (!Array.isArray(raw)) return []
    return raw.map(normalizeBand).filter((b): b is BandRecord => b !== null)
  } catch {
    return []
  }
}

function normalizeBand(x: unknown): BandRecord | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  if (!Array.isArray(o.memberBotIds) || o.memberBotIds.length < 2) return null
  const memberBotIds = o.memberBotIds.filter((id): id is string => typeof id === 'string')
  if (memberBotIds.length < 2) return null
  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t): t is MusicTag => typeof t === 'string' && isMusicTag(t))
    : []
  return { id: o.id, name: o.name, memberBotIds, tags }
}

export function saveBands(bands: BandRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bands))
}

export function addBand(record: BandRecord): void {
  const bands = loadBands()
  bands.push(record)
  saveBands(bands)
}

export function removeBand(id: string): void {
  saveBands(loadBands().filter(b => b.id !== id))
}
