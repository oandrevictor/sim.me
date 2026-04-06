import { GRID_SIZE, OBJECT_SIZE } from '../objects/objectTypes'
import { getWorldBounds, setWorldOffset } from '../utils/isoGrid'

export { GRID_SIZE, OBJECT_SIZE }

// Grid dimensions (in cells)
export const GRID_COLS = 52
export const GRID_ROWS = 47

// Isometric world bounds (in pixels)
const bounds = getWorldBounds(GRID_COLS, GRID_ROWS)
export const WORLD_WIDTH = bounds.width
export const WORLD_HEIGHT = bounds.height
export const WORLD_OFFSET_X = bounds.offsetX
export const WORLD_OFFSET_Y = bounds.offsetY

// Apply offset so all gridToScreen calls produce positive coordinates
setWorldOffset(WORLD_OFFSET_X, WORLD_OFFSET_Y)

/** Depth offset for UI/overlay elements that must render above all Y-sorted world sprites. */
export const DEPTH_UI = WORLD_HEIGHT + 100
