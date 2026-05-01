import type { ObjectType } from './persistence'
import { cacheGet, cacheSet } from './saveCache'
import { SAVE_KEYS } from './saveSchema'

export interface InventoryItem {
  type: ObjectType
  count: number
}

const STORAGE_KEY = SAVE_KEYS.inventory

export function loadInventory(): InventoryItem[] {
  try {
    return JSON.parse(cacheGet(STORAGE_KEY) ?? '[]') as InventoryItem[]
  } catch {
    return []
  }
}

export function addToInventory(type: ObjectType): void {
  const items = loadInventory()
  const existing = items.find(i => i.type === type)
  if (existing) {
    existing.count++
  } else {
    items.push({ type, count: 1 })
  }
  cacheSet(STORAGE_KEY, JSON.stringify(items))
}

export function removeFromInventory(type: ObjectType): boolean {
  const items = loadInventory()
  const existing = items.find(i => i.type === type)
  if (!existing || existing.count <= 0) return false
  existing.count--
  if (existing.count <= 0) {
    const idx = items.indexOf(existing)
    items.splice(idx, 1)
  }
  cacheSet(STORAGE_KEY, JSON.stringify(items))
  return true
}
