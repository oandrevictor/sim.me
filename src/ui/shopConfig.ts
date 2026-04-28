import type { ObjectType } from '../objects/objectTypes'

export type Category = 'build' | 'farm' | 'dine' | 'bedroom' | 'decoration' | 'misc' | 'inventory'

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'build', label: 'Build' },
  { key: 'farm', label: 'Farm' },
  { key: 'dine', label: 'Dine' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'decoration', label: 'Decor' },
  { key: 'misc', label: 'Misc' },
  { key: 'inventory', label: 'Inventory' },
]

export const CATEGORY_MAP: Record<string, Category> = {
  obstacle: 'build',
  floor_yellow: 'build',
  portable_toilet: 'build',
  crop: 'farm',
  table2: 'dine',
  table4: 'dine',
  chair: 'dine',
  stove: 'dine',
  stove_white_clay: 'dine',
  counter: 'dine',
  drinking_water: 'dine',
  snack_machine: 'dine',
  fruit_crate: 'dine',
  background: 'decoration',
  interactable: 'misc',
  trash: 'misc',
  bed_ms_blue: 'bedroom',
  bed_ms_red: 'bedroom',
  bed_ms_grey: 'bedroom',
  bed_ms_space: 'bedroom',
  bed_ws_blue: 'bedroom',
  bed_ws_red: 'bedroom',
  bed_ws_grey: 'bedroom',
  bed_ws_space: 'bedroom',
}

export const HIDDEN_TYPES = new Set<ObjectType>(['food_plate'])
