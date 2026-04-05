import type { ObjectType } from './persistence'

export interface InventoryItem {
  type: ObjectType
  count: number
}

const STORAGE_KEY = 'simme_inventory'

export function loadInventory(): InventoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as InventoryItem[]
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  return true
}
