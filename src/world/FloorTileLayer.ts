import Phaser from 'phaser'
import { getTileCorners } from '../utils/isoGrid'

const FLOOR_FILL = 0xf0c060
const EDGE_COLOR = 0xc09040
const EDGE_WIDTH = 1.5

/**
 * Renders all floor tiles onto a single Graphics layer.
 * Interior edges are hidden; only outer edges facing non-floor neighbors are drawn.
 */
export class FloorTileLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly cells = new Set<string>()

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics()
    this.gfx.setDepth(1)
  }

  private key(gx: number, gy: number): string { return `${gx},${gy}` }

  has(gx: number, gy: number): boolean { return this.cells.has(this.key(gx, gy)) }

  add(gx: number, gy: number): void {
    this.cells.add(this.key(gx, gy))
    this.redraw()
  }

  remove(gx: number, gy: number): void {
    this.cells.delete(this.key(gx, gy))
    this.redraw()
  }

  private redraw(): void {
    this.gfx.clear()

    // Fill all tiles
    for (const key of this.cells) {
      const [gx, gy] = key.split(',').map(Number)
      const c = getTileCorners(gx, gy)
      this.gfx.fillStyle(FLOOR_FILL, 1)
      this.gfx.beginPath()
      this.gfx.moveTo(c.top.x, c.top.y)
      this.gfx.lineTo(c.right.x, c.right.y)
      this.gfx.lineTo(c.bottom.x, c.bottom.y)
      this.gfx.lineTo(c.left.x, c.left.y)
      this.gfx.closePath()
      this.gfx.fillPath()
    }

    // Draw only outer edges
    this.gfx.lineStyle(EDGE_WIDTH, EDGE_COLOR, 0.6)
    for (const key of this.cells) {
      const [gx, gy] = key.split(',').map(Number)
      const c = getTileCorners(gx, gy)
      // top-right edge: neighbor at (gx+1, gy-1)... no, iso neighbors:
      // top    edge (top→right):  neighbor sharing this edge is (gx, gy-1)
      // right  edge (right→bottom): neighbor is (gx+1, gy)
      // bottom edge (bottom→left):  neighbor is (gx, gy+1)
      // left   edge (left→top):     neighbor is (gx-1, gy)
      if (!this.has(gx, gy - 1)) this.gfx.lineBetween(c.top.x, c.top.y, c.right.x, c.right.y)
      if (!this.has(gx + 1, gy)) this.gfx.lineBetween(c.right.x, c.right.y, c.bottom.x, c.bottom.y)
      if (!this.has(gx, gy + 1)) this.gfx.lineBetween(c.bottom.x, c.bottom.y, c.left.x, c.left.y)
      if (!this.has(gx - 1, gy)) this.gfx.lineBetween(c.left.x, c.left.y, c.top.x, c.top.y)
    }
  }
}
