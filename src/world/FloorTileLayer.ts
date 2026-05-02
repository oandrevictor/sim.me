import Phaser from 'phaser'
import { getTileCorners } from '../utils/isoGrid'

export type FloorTileVariant = 'floor' | 'path'

const TILE_STYLES: Record<FloorTileVariant, { fill: number; edge: number }> = {
  floor: { fill: 0xf0c060, edge: 0xc09040 },
  path: { fill: 0xb88245, edge: 0x7a4f2a },
}
const EDGE_WIDTH = 1.5

/**
 * Renders all floor tiles onto a single Graphics layer.
 * Interior edges are hidden; only outer edges facing non-floor neighbors are drawn.
 */
export class FloorTileLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly cells = new Map<string, Set<FloorTileVariant>>()

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics()
    this.gfx.setDepth(1)
  }

  private key(gx: number, gy: number): string { return `${gx},${gy}` }

  has(gx: number, gy: number): boolean { return this.cells.has(this.key(gx, gy)) }

  add(gx: number, gy: number, variant: FloorTileVariant = 'floor'): void {
    const key = this.key(gx, gy)
    const variants = this.cells.get(key) ?? new Set<FloorTileVariant>()
    variants.add(variant)
    this.cells.set(key, variants)
    this.redraw()
  }

  remove(gx: number, gy: number, variant: FloorTileVariant = 'floor'): void {
    const key = this.key(gx, gy)
    const variants = this.cells.get(key)
    if (!variants) return
    variants.delete(variant)
    if (variants.size === 0) this.cells.delete(key)
    this.redraw()
  }

  private redraw(): void {
    this.gfx.clear()

    // Fill all tiles
    for (const key of this.cells.keys()) {
      const [gx, gy] = key.split(',').map(Number)
      const c = getTileCorners(gx, gy)
      const style = TILE_STYLES[this.variantFor(key)]
      this.gfx.fillStyle(style.fill, 1)
      this.gfx.beginPath()
      this.gfx.moveTo(c.top.x, c.top.y)
      this.gfx.lineTo(c.right.x, c.right.y)
      this.gfx.lineTo(c.bottom.x, c.bottom.y)
      this.gfx.lineTo(c.left.x, c.left.y)
      this.gfx.closePath()
      this.gfx.fillPath()
    }

    // Draw only outer edges
    for (const key of this.cells.keys()) {
      const [gx, gy] = key.split(',').map(Number)
      const c = getTileCorners(gx, gy)
      const style = TILE_STYLES[this.variantFor(key)]
      this.gfx.lineStyle(EDGE_WIDTH, style.edge, 0.6)
      // Outer edges only: cardinal neighbors share full tile sides.
      if (!this.has(gx, gy - 1)) this.gfx.lineBetween(c.top.x, c.top.y, c.right.x, c.right.y)
      if (!this.has(gx + 1, gy)) this.gfx.lineBetween(c.right.x, c.right.y, c.bottom.x, c.bottom.y)
      if (!this.has(gx, gy + 1)) this.gfx.lineBetween(c.bottom.x, c.bottom.y, c.left.x, c.left.y)
      if (!this.has(gx - 1, gy)) this.gfx.lineBetween(c.left.x, c.left.y, c.top.x, c.top.y)
    }
  }

  private variantFor(key: string): FloorTileVariant {
    return this.cells.get(key)?.has('path') ? 'path' : 'floor'
  }
}
