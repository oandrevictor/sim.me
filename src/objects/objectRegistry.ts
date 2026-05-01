import type { ObjectType } from '../storage/persistence'
import { BED_REGISTRY_ENTRIES } from './bedTypes'
import type { ObjectTypeConfig } from './objectTypes'

export const OBJECT_TYPE_REGISTRY = {
  obstacle: {
    type: 'obstacle', label: 'Obstacle', description: 'Blocks movement',
    textureKey: 'obj_obstacle', previewColor: 0x555555,
    depth: 2, hasPhysicsBody: true, isInteractable: false,
  },
  interactable: {
    type: 'interactable', label: 'Interactable', description: 'Click or walk through',
    textureKey: 'obj_interactable', previewColor: 0x4488ff,
    depth: 3, hasPhysicsBody: false, isInteractable: true,
  },
  background: {
    type: 'background', label: 'Decoration', description: 'Decorative, no interaction',
    textureKey: 'obj_background', previewColor: 0x8aab7a,
    depth: 1, hasPhysicsBody: false, isInteractable: false,
  },
  table2: {
    type: 'table2', label: 'Table (2)', description: '2-seat table',
    textureKey: 'furniture_table', frame: 0, previewColor: 0x8b6914,
    depth: 2, hasPhysicsBody: true, isInteractable: false,
  },
  table4: {
    type: 'table4', label: 'Table (4)', description: '4-seat table',
    textureKey: 'furniture_table', frame: 1, previewColor: 0x8b6914,
    depth: 2, hasPhysicsBody: true, isInteractable: false,
  },
  chair: {
    type: 'chair', label: 'Chair', description: 'Seat for Nirvs',
    textureKey: 'furniture_chair', frame: 0, previewColor: 0xa0784c,
    depth: 2, hasPhysicsBody: false, isInteractable: false,
  },
  stove: {
    type: 'stove', label: 'Stove', description: 'Cook recipes',
    textureKey: 'furniture_stove', frame: 0, displayAspectWidthOverHeight: 528 / 288,
    previewColor: 0x444444, depth: 2, hasPhysicsBody: true, isInteractable: true,
  },
  stove_white_clay: {
    type: 'stove_white_clay', label: 'White clay oven', description: 'Cook recipes',
    textureKey: 'white_clay_oven', frame: 0, displayAspectWidthOverHeight: 450 / 555,
    previewColor: 0xe8e4dc, depth: 2, hasPhysicsBody: true, isInteractable: true,
  },
  counter: {
    type: 'counter', label: 'Counter', description: 'Kitchen surface',
    textureKey: 'obj_counter', previewColor: 0x9b8b6b,
    depth: 2, hasPhysicsBody: true, isInteractable: false,
  },
  food_plate: {
    type: 'food_plate', label: 'Food Plate', description: 'A prepared dish',
    textureKey: 'obj_food_plate', previewColor: 0xffffff,
    depth: 3, hasPhysicsBody: false, isInteractable: false,
  },
  trash: {
    type: 'trash', label: 'Trash', description: 'Discard carried items',
    textureKey: 'obj_trash', previewColor: 0x4a5a4a,
    depth: 2, hasPhysicsBody: true, isInteractable: true,
  },
  floor_yellow: {
    type: 'floor_yellow', label: 'Floor (Yellow)', description: 'Yellow floor tile',
    textureKey: 'floor_yellow', previewColor: 0xf0c060,
    depth: 1, hasPhysicsBody: false, isInteractable: false,
  },
  drinking_water: {
    type: 'drinking_water', label: 'Drinking Water station',
    description: 'Nirvs drink here when thirsty', textureKey: 'water_station',
    previewColor: 0x4488cc, depth: 2, hasPhysicsBody: false, isInteractable: true,
  },
  snack_machine: {
    type: 'snack_machine', label: 'Snack machine',
    description: 'Nirvs buy snacks when hungry', textureKey: 'snack_machine',
    displayAspectWidthOverHeight: 450 / 555,
    previewColor: 0x8b6914, depth: 2, hasPhysicsBody: false, isInteractable: true,
  },
  fruit_crate: {
    type: 'fruit_crate', label: 'Fruit crates',
    description: 'Up to three Nirvs can grab fruit when hungry', textureKey: 'fruit_crate',
    displayAspectWidthOverHeight: 359 / 331,
    previewColor: 0x6b9c4a, depth: 2, hasPhysicsBody: false, isInteractable: true,
  },
  fridge: {
    type: 'fridge', label: 'Fridge',
    description: 'Stores ingredients for restaurant chefs', textureKey: 'fridge',
    displayAspectWidthOverHeight: 1,
    previewColor: 0xb8d9e6, depth: 2, hasPhysicsBody: false, isInteractable: true,
  },
  portable_toilet: {
    type: 'portable_toilet', label: 'Toilet',
    description: 'Nirvs use when they need to go',
    textureKey: 'fixtures_BA',
    frame: 3,
    displayAspectWidthOverHeight: 48 / 64,
    previewColor: 0x9a9aaa, depth: 2, hasPhysicsBody: false, isInteractable: true,
  },
  crop: {
    type: 'crop', label: 'Crop', description: 'Plant and harvest corn',
    textureKey: 'crop_empty', displayAspectWidthOverHeight: 384 / 390,
    previewColor: 0xd69a35, depth: 2, hasPhysicsBody: false, isInteractable: true,
  },
  lamp_post: {
    type: 'lamp_post', label: 'Lamp', description: 'Illuminates the area at night',
    textureKey: 'lamp_post',
    previewColor: 0xffd966, depth: 3, hasPhysicsBody: false, isInteractable: false,
  },
  tv: {
    type: 'tv', label: 'TV', description: 'Bots gather to play games together at night',
    textureKey: 'tv', displayAspectWidthOverHeight: 1.5,
    previewColor: 0x2a3f5f, depth: 3, hasPhysicsBody: false, isInteractable: false,
  },
  ...BED_REGISTRY_ENTRIES,
} as Record<ObjectType, ObjectTypeConfig>
