export type ObjectType = 'obstacle' | 'interactable' | 'background' | 'table2' | 'table4' | 'chair' | 'stove' | 'counter' | 'food_plate' | 'trash'

export interface PlacedObjectRecord {
  id: string
  type: ObjectType
  x: number
  y: number
  recipeId?: string
  rotation?: number
}

const STORAGE_KEY = 'simme_placed_objects'

export function loadPlacedObjects(): PlacedObjectRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PlacedObjectRecord[]
  } catch {
    return []
  }
}

export function savePlacedObject(record: PlacedObjectRecord): void {
  const records = loadPlacedObjects()
  records.push(record)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function removeObjectAt(x: number, y: number): PlacedObjectRecord | null {
  const records = loadPlacedObjects()
  const idx = records.findIndex(r => r.x === x && r.y === y)
  if (idx === -1) return null
  const [removed] = records.splice(idx, 1)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  return removed
}

export function removeObjectByType(x: number, y: number, type: ObjectType): PlacedObjectRecord | null {
  const records = loadPlacedObjects()
  const idx = records.findIndex(r => r.x === x && r.y === y && r.type === type)
  if (idx === -1) return null
  const [removed] = records.splice(idx, 1)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  return removed
}

export function clearPlacedObjects(): void {
  localStorage.removeItem(STORAGE_KEY)
}
