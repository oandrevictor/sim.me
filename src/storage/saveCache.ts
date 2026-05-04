import { SaveStore } from './SaveStore'
import { ALL_SAVE_KEYS, type SaveKey } from './saveSchema'

/**
 * In-memory authoritative cache, hydrated once at boot. Persistence modules
 * read from this synchronously (preserving their existing sync API) and write
 * through `cacheSet`, which updates memory and queues an async IDB write.
 *
 * Stored values are RAW STRINGS to keep parsing semantics identical to the
 * old localStorage flow — each persistence module already does its own
 * JSON.parse + normalization, and the placed-objects module relies on raw
 * string detection (`__LZ1__` prefix). Keeping strings means zero behavior
 * change at the call sites.
 */

const cache = new Map<SaveKey, string>()
let hydrated = false

export function cacheGet(key: SaveKey): string | null {
  return cache.get(key) ?? null
}

export function cacheSet(key: SaveKey, value: string): void {
  cache.set(key, value)
  // Fire-and-forget; SaveStore coalesces rapid writes per key.
  SaveStore.set(key, value).catch(err => {
    console.error(`[sim.me] Failed to persist ${key}`, err)
  })
}

export function cacheDelete(key: SaveKey): void {
  cache.delete(key)
  SaveStore.delete(key).catch(err => {
    console.error(`[sim.me] Failed to delete ${key}`, err)
  })
}

export function isHydrated(): boolean {
  return hydrated
}

/**
 * Pull every known key from IndexedDB into the in-memory cache. On first run
 * after the localStorage→IDB upgrade, also migrates any legacy `simme_*`
 * values from localStorage into IDB and removes them.
 *
 * Idempotent and safe to call multiple times.
 */
export async function hydrateSaveCache(): Promise<void> {
  if (hydrated) return

  // Migration: copy any legacy localStorage values into IDB before reading.
  // We only migrate keys that are NOT already in IDB to avoid clobbering
  // newer IDB writes if hydrate happens to run twice.
  const ls = typeof localStorage !== 'undefined' ? localStorage : null
  if (ls) {
    for (const key of ALL_SAVE_KEYS) {
      const legacy = ls.getItem(key)
      if (legacy == null) continue
      const existing = await SaveStore.get<string>(key)
      if (existing == null) {
        await SaveStore.set(key, legacy)
      }
      ls.removeItem(key)
    }
    await SaveStore.flush()
  }

  for (const key of ALL_SAVE_KEYS) {
    const v = await SaveStore.get<string>(key)
    if (v != null) cache.set(key, v)
  }

  hydrated = true
}
