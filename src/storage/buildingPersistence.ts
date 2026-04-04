export interface BuildingRecord {
  id: string
  gridX: number
  gridY: number
}

const STORAGE_KEY = 'simme_placed_buildings'

export function loadPlacedBuildings(): BuildingRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as BuildingRecord[]
  } catch {
    return []
  }
}

export function savePlacedBuilding(record: BuildingRecord): void {
  const records = loadPlacedBuildings()
  records.push(record)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function clearPlacedBuildings(): void {
  localStorage.removeItem(STORAGE_KEY)
}
