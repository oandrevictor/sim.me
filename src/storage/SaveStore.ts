import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { SaveKey } from './saveSchema'

/**
 * Async KV abstraction over IndexedDB. Writes are coalesced per key — rapid
 * `set()` calls collapse to a single IDB write per microtask flush. `flush()`
 * awaits all in-flight writes (use on `beforeunload` / `visibilitychange`).
 */

type PendingWrite = { value: unknown; resolve: () => void; reject: (e: unknown) => void }

const pending = new Map<SaveKey, PendingWrite>()
const inflight = new Set<Promise<void>>()
let flushScheduled = false

function scheduleFlush(): void {
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    const entries = Array.from(pending.entries())
    pending.clear()
    for (const [key, write] of entries) {
      const p = idbSet(key, write.value).then(write.resolve, write.reject)
      inflight.add(p)
      p.finally(() => inflight.delete(p))
    }
  })
}

export const SaveStore = {
  async get<T>(key: SaveKey): Promise<T | null> {
    const v = await idbGet<T>(key)
    return v ?? null
  },

  set<T>(key: SaveKey, value: T): Promise<void> {
    const existing = pending.get(key)
    if (existing) existing.resolve() // superseded — never written, but treat as resolved
    return new Promise<void>((resolve, reject) => {
      pending.set(key, { value, resolve, reject })
      scheduleFlush()
    })
  },

  async delete(key: SaveKey): Promise<void> {
    pending.delete(key)
    await idbDel(key)
  },

  async flush(): Promise<void> {
    // Drain pending into IDB synchronously-ish, then wait for all in-flight.
    if (pending.size > 0) {
      const entries = Array.from(pending.entries())
      pending.clear()
      for (const [key, write] of entries) {
        const p = idbSet(key, write.value).then(write.resolve, write.reject)
        inflight.add(p)
        p.finally(() => inflight.delete(p))
      }
    }
    await Promise.all(inflight)
  },
}
