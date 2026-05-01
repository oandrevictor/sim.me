export type BuildingType = 'empty' | 'restaurant' | 'house'

export interface BuildingRecord {
  id: string
  gridX: number
  gridY: number
  type: BuildingType
  /** Single-owner accessor — kept in sync with `ownerBotIds[0]`. */
  ownerBotId?: string | null
  ownerBotIds?: string[]
}

const STORAGE_KEY = 'simme_placed_buildings'

function normalize(record: BuildingRecord): BuildingRecord {
  const type = record.type ?? 'empty'
  let ids: string[] = []
  if (type === 'house') {
    if (record.ownerBotIds && record.ownerBotIds.length > 0) ids = [...record.ownerBotIds]
    else if (record.ownerBotId) ids = [record.ownerBotId]
  }
  return { ...record, type, ownerBotIds: ids, ownerBotId: ids[0] ?? null }
}

function persist(records: BuildingRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.map(normalize)))
}

export function loadPlacedBuildings(): BuildingRecord[] {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as BuildingRecord[]
    return records.map(normalize)
  } catch {
    return []
  }
}

export function savePlacedBuilding(record: BuildingRecord): void {
  const records = loadPlacedBuildings()
  records.push(normalize(record))
  persist(records)
}

export function updateBuildingType(id: string, type: BuildingType): void {
  const records = loadPlacedBuildings()
  const record = records.find(r => r.id === id)
  if (!record) return
  record.type = type
  if (type !== 'house') record.ownerBotIds = []
  persist(records)
}

export function assignHouseOwner(buildingId: string, ownerBotId: string): boolean {
  const records = loadPlacedBuildings()
  const target = records.find(r => r.id === buildingId && r.type === 'house')
  if (!target || (target.ownerBotIds && target.ownerBotIds.length > 0)) return false
  for (const r of records) {
    if (r.ownerBotIds) r.ownerBotIds = r.ownerBotIds.filter(id => id !== ownerBotId)
  }
  target.ownerBotIds = [ownerBotId]
  persist(records)
  return true
}

export function setHouseOwner(buildingId: string, ownerBotId: string | null): void {
  const records = loadPlacedBuildings()
  const target = records.find(r => r.id === buildingId)
  if (!target) return
  if (target.type !== 'house') target.ownerBotIds = []
  else target.ownerBotIds = ownerBotId ? [ownerBotId] : []
  persist(records)
}

export function setHouseOwners(buildingId: string, ownerBotIds: readonly string[]): void {
  const records = loadPlacedBuildings()
  const target = records.find(r => r.id === buildingId)
  if (!target) return
  target.ownerBotIds = target.type === 'house' ? [...ownerBotIds] : []
  persist(records)
}

export function addHouseOwner(buildingId: string, ownerBotId: string): void {
  const records = loadPlacedBuildings()
  const target = records.find(r => r.id === buildingId && r.type === 'house')
  if (!target) return
  const ids = target.ownerBotIds ?? []
  if (!ids.includes(ownerBotId)) ids.push(ownerBotId)
  target.ownerBotIds = ids
  persist(records)
}

export function removeHouseOwner(buildingId: string, ownerBotId: string): void {
  const records = loadPlacedBuildings()
  const target = records.find(r => r.id === buildingId)
  if (!target) return
  target.ownerBotIds = (target.ownerBotIds ?? []).filter(id => id !== ownerBotId)
  persist(records)
}

export function clearPlacedBuildings(): void {
  localStorage.removeItem(STORAGE_KEY)
}
