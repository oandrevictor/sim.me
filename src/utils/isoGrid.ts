/** Square top-down tiles (orthogonal projection) — 16 px cells. */
export const TILE_W = 16
export const TILE_H = 16

/**
 * Legacy scale factor — kept for persistence migration.
 * Old saves used a 64 px grid; multiply old coords by this to convert.
 */
export const OLD_TILE_SCALE = 4

export interface GridRect {
  x: number
  y: number
  width: number
  height: number
}

// World offset — set once by world.ts after computing bounds.
// Shifts all coordinates so the world’s top-left aligns with (0,0).
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
    x: gx * TILE_W + TILE_W / 2 + _offsetX,
    y: gy * TILE_H + TILE_H / 2 + _offsetY,
  }
}

/** Top-left pixel of a grid cell or grid line intersection. */
export function gridToTopLeft(gx: number, gy: number): { x: number; y: number } {
  return {
    x: gx * TILE_W + _offsetX,
    y: gy * TILE_H + _offsetY,
  }
}

/** Pixel rectangle covered by a rectangular grid footprint. */
export function getGridRect(gx: number, gy: number, gw = 1, gh = 1): GridRect {
  const topLeft = gridToTopLeft(gx, gy)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: gw * TILE_W,
    height: gh * TILE_H,
  }
}

/** Center pixel of a rectangular grid footprint. */
export function gridRectCenter(gx: number, gy: number, gw: number, gh: number): { x: number; y: number } {
  const rect = getGridRect(gx, gy, gw, gh)
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/**
 * Convert screen (pixel) coordinates to grid coordinates.
 * Returns floating-point grid coords; round/floor as needed.
 */
export function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  const rx = sx - _offsetX
  const ry = sy - _offsetY
  return {
    gx: (rx - TILE_W / 2) / TILE_W,
    gy: (ry - TILE_H / 2) / TILE_H,
  }
}

/** Cell containing a screen pixel. */
export function screenToCell(sx: number, sy: number): { gx: number; gy: number } {
  return {
    gx: Math.floor((sx - _offsetX) / TILE_W),
    gy: Math.floor((sy - _offsetY) / TILE_H),
  }
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
 * Pixel size of the world rectangle covering all grid cells.
 */
export function getWorldBounds(cols: number, rows: number): { width: number; height: number; offsetX: number; offsetY: number } {
  return {
    width: cols * TILE_W,
    height: rows * TILE_H,
    offsetX: 0,
    offsetY: 0,
  }
}

/**
 * Tile footprint as four corners (clockwise from top-left) for fills and outlines.
 */
export function getTileCorners(gx: number, gy: number): { top: { x: number; y: number }; right: { x: number; y: number }; bottom: { x: number; y: number }; left: { x: number; y: number } } {
  const r = getGridRect(gx, gy)
  return {
    top: { x: r.x, y: r.y },
    right: { x: r.x + r.width, y: r.y },
    bottom: { x: r.x + r.width, y: r.y + r.height },
    left: { x: r.x, y: r.y + r.height },
  }
}

// ---------------------------------------------------------------------------
// Aliases — the "nav grid" is now the same as the world grid.
// These exist solely so callers that imported the nav names still compile.
// ---------------------------------------------------------------------------

/** @deprecated Use screenToGrid */
export function screenToNavGrid(sx: number, sy: number): { nx: number; ny: number } {
  const g = screenToGrid(sx, sy)
  return { nx: g.gx, ny: g.gy }
}

/** @deprecated Use gridToScreen */
export function navGridToScreen(nx: number, ny: number): { x: number; y: number } {
  return gridToScreen(nx, ny)
}

/** @deprecated Identity — world grid IS nav grid now */
export function worldToNav(gx: number, gy: number): { nx: number; ny: number } {
  return { nx: gx, ny: gy }
}

/** @deprecated Identity */
export function navToWorld(nx: number, ny: number): { gx: number; gy: number } {
  return { gx: nx, gy: ny }
}
