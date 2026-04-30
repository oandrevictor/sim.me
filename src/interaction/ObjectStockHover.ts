import Phaser from 'phaser'
import { DEPTH_UI } from '../config/world'
import { foodStockTitle, type FoodStockStation } from '../systems/foodStockTypes'

const NEAR_STATION_PX = 64

export class ObjectStockHover {
  private label: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    this.label = scene.add.text(0, 0, '', {
      fontSize: '13px',
      color: '#f0f0f5',
      backgroundColor: '#1e1e32e8',
      padding: { x: 8, y: 4 },
    })
    this.label.setOrigin(0.5, 1)
    this.label.setDepth(DEPTH_UI + 23)
    this.label.setVisible(false)
  }

  update(pointer: Phaser.Input.Pointer, stations: FoodStockStation[], hide: boolean): boolean {
    if (hide) {
      this.label.setVisible(false)
      return false
    }

    const station = this.findHoveredStation(pointer, stations)
    if (!station) {
      this.label.setVisible(false)
      return false
    }

    const title = foodStockTitle(station.type)
    this.label.setText(`${title}\nStock: ${station.stock}/${station.maxStock}`)
    this.label.setPosition(station.x, station.sprite.getBounds().top - 8)
    this.label.setVisible(true)
    return true
  }

  private findHoveredStation(
    pointer: Phaser.Input.Pointer,
    stations: FoodStockStation[],
  ): FoodStockStation | null {
    let best: FoodStockStation | null = null
    let bestD = Infinity
    for (const station of stations) {
      if (!station.sprite.active || !station.sprite.visible) continue
      if (!this.pointerHitsStation(pointer, station)) continue
      const d = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, station.x, station.y)
      if (d < bestD) {
        best = station
        bestD = d
      }
    }
    return best
  }

  private pointerHitsStation(pointer: Phaser.Input.Pointer, station: FoodStockStation): boolean {
    if (station.sprite.getBounds().contains(pointer.worldX, pointer.worldY)) return true
    return Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, station.x, station.y) < NEAR_STATION_PX
  }
}
