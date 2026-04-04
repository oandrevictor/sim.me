/** Classic 2:1 isometric tile dimensions */
export const TILE_W = 64
export const TILE_H = 32

// World offset — set once by world.ts after computing bounds.
// This shifts all coordinates so the top-left of the bounding box is at (0,0).
let _offsetX = 0
let _offsetY = 0

export function setWorldOffset(ox: number, oy: number): void {
  _offsetX = ox
  _offsetY = oy
}

/**
 * Convert grid coordinates to screen (pixel) coordinates.
 * Returns the center of the tile in screen space (with world offset applied).
 */
export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W / 2) + _offsetX,
    y: (gx + gy) * (TILE_H / 2) + _offsetY,
  }
}

/**
 * Convert screen (pixel) coordinates to grid coordinates.
 * Returns floating-point grid coords; round/floor as needed.
 */
export function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  // Remove offset before converting
  const rx = sx - _offsetX
  const ry = sy - _offsetY
  const gx = (rx / (TILE_W / 2) + ry / (TILE_H / 2)) / 2
  const gy = (ry / (TILE_H / 2) - rx / (TILE_W / 2)) / 2
  return { gx, gy }
}

/**
 * Snap screen coordinates to the nearest grid cell center.
 */
export function snapToIsoGrid(sx: number, sy: number): { x: number; y: number; gx: number; gy: number } {
  const { gx, gy } = screenToGrid(sx, sy)
  const snappedGX = Math.round(gx)
  const snappedGY = Math.round(gy)
  const screen = gridToScreen(snappedGX, snappedGY)
  return { x: screen.x, y: screen.y, gx: snappedGX, gy: snappedGY }
}

/**
 * Get the bounding box of the isometric world in screen space.
 * The iso diamond is rotated, so the bounding box is larger than a simple cols*rows rectangle.
 */
export function getWorldBounds(cols: number, rows: number): { width: number; height: number; offsetX: number; offsetY: number } {
  // Compute raw iso positions (without offset) for bound calculation
  const rawToScreen = (gx: number, gy: number) => ({
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  })

  const top = rawToScreen(0, 0)
  const right = rawToScreen(cols - 1, 0)
  const bottom = rawToScreen(cols - 1, rows - 1)
  const left = rawToScreen(0, rows - 1)

  const minX = left.x - TILE_W / 2
  const maxX = right.x + TILE_W / 2
  const minY = top.y - TILE_H / 2
  const maxY = bottom.y + TILE_H / 2

  return {
    width: maxX - minX,
    height: maxY - minY,
    offsetX: -minX,  // shift to make minX = 0
    offsetY: -minY,  // shift to make minY = 0
  }
}

/**
 * Get the 4 corner vertices of an isometric tile (for drawing diamond outlines).
 */
export function getTileCorners(gx: number, gy: number): { top: {x:number,y:number}; right: {x:number,y:number}; bottom: {x:number,y:number}; left: {x:number,y:number} } {
  const center = gridToScreen(gx, gy)
  return {
    top:    { x: center.x,              y: center.y - TILE_H / 2 },
    right:  { x: center.x + TILE_W / 2, y: center.y },
    bottom: { x: center.x,              y: center.y + TILE_H / 2 },
    left:   { x: center.x - TILE_W / 2, y: center.y },
  }
}
