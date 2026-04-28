export interface RestaurantStaffRecord {
  buildingId: string
  chefBotIds: string[]
  waiterBotIds: string[]
}

const STORAGE_KEY = 'simme_restaurant_staff_v1'

export function loadRestaurantStaffRecords(): RestaurantStaffRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RestaurantStaffRecord[]
    if (!Array.isArray(parsed)) return []
    return parsed.map(r => ({
      buildingId: r.buildingId,
      chefBotIds: Array.isArray(r.chefBotIds) ? [...r.chefBotIds] : [],
      waiterBotIds: Array.isArray(r.waiterBotIds) ? [...r.waiterBotIds] : [],
    }))
  } catch {
    return []
  }
}

export function saveRestaurantStaffRecords(records: RestaurantStaffRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}
