export type BuildingType = 'empty' | 'restaurant'

export interface BuildingRecord {
  id: string
  gridX: number
  gridY: number
  type: BuildingType
}

const STORAGE_KEY = 'simme_placed_buildings'

export function loadPlacedBuildings(): BuildingRecord[] {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as BuildingRecord[]
    // Backward compat: records without type default to 'empty'
    return records.map(r => ({ ...r, type: r.type ?? 'empty' }))
  } catch {
    return []
  }
}

export function savePlacedBuilding(record: BuildingRecord): void {
  const records = loadPlacedBuildings()
  records.push(record)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function updateBuildingType(id: string, type: BuildingType): void {
  const records = loadPlacedBuildings()
  const record = records.find(r => r.id === id)
  if (record) {
    record.type = type
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }
}

export function clearPlacedBuildings(): void {
  localStorage.removeItem(STORAGE_KEY)
}
