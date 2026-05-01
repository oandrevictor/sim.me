/**
 * Single source of truth for storage keys. Each persistence module references
 * one entry here instead of hardcoding a `simme_*` string literal.
 *
 * Values double as IndexedDB keys and as the legacy localStorage keys we
 * migrate from on first boot — keep them stable.
 */
export const SAVE_KEYS = {
  placedObjects: 'simme_placed_objects',
  placedStages: 'simme_placed_stages',
  placedBuildings: 'simme_placed_buildings',
  lots: 'simme_lots_v1',
  walls: 'simme_walls_v1',
  inventory: 'simme_inventory',
  bands: 'simme_bands',
  relationships: 'simme_relationships_v1',
  relationshipBehavior: 'simme_relationship_behavior_v1',
  relationshipEvents: 'simme_relationship_events_v1',
  nirvInteractions: 'simme_nirv_interactions_v1',
  farm: 'simme_farm_v1',
  restaurantStaff: 'simme_restaurant_staff_v1',
} as const

export type SaveKey = (typeof SAVE_KEYS)[keyof typeof SAVE_KEYS]

export const ALL_SAVE_KEYS: readonly SaveKey[] = Object.values(SAVE_KEYS)
