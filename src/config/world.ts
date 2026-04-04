import { GRID_SIZE, OBJECT_SIZE } from '../objects/objectTypes'

export { GRID_SIZE, OBJECT_SIZE }

export const CANVAS_WIDTH = 800
export const CANVAS_HEIGHT = 600

// Original grid was 20x15; expanded by 16 squares on each side
export const GRID_COLS = 52 // 20 + 16*2
export const GRID_ROWS = 47 // 15 + 16*2

export const WORLD_WIDTH = GRID_COLS * GRID_SIZE  // 2080
export const WORLD_HEIGHT = GRID_ROWS * GRID_SIZE // 1880
