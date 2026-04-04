export type ObjectType = 'obstacle' | 'interactable' | 'background'

export interface PlacedObjectRecord {
  id: string
  type: ObjectType
  x: number
  y: number
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

export function clearPlacedObjects(): void {
  localStorage.removeItem(STORAGE_KEY)
}
