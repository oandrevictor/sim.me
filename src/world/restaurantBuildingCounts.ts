import type { Building } from '../entities/Building'
import type { SpawnerState } from './ObjectSpawner'

/** Count stoves, counters, and tables whose placement lies inside the restaurant building footprint. */
export function countRestaurantEquipment(
  building: Building,
  state: SpawnerState,
): { stoves: number; counters: number; tables: number } {
  let stoves = 0
  for (const p of state.placedSprites) {
    if ((p.type === 'stove' || p.type === 'stove_white_clay') && building.containsPixel(p.x, p.y)) stoves++
  }
  let counters = 0
  for (const c of state.counterSprites) {
    if (building.containsPixel(c.x, c.y)) counters++
  }
  let tables = 0
  for (const t of state.tableSprites) {
    if (building.containsPixel(t.x, t.y)) tables++
  }
  return { stoves, counters, tables }
}
