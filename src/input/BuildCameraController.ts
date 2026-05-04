import Phaser from 'phaser'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/world'

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const DEFAULT_ZOOM_INDEX = 2
const BUILD_CAMERA_SPEED = 520

export class BuildCameraController {
  private zoomIndex = DEFAULT_ZOOM_INDEX

  constructor(private readonly scene: Phaser.Scene) {}

  update(delta: number, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    const len = Math.sqrt(dx * dx + dy * dy)
    const distance = BUILD_CAMERA_SPEED * (delta / 1000)
    const center = this.getCameraCenter()
    this.centerOn(
      center.x + (dx / len) * distance,
      center.y + (dy / len) * distance,
    )
  }

  changeZoom(direction: number): void {
    const center = this.getCameraCenter()
    this.syncZoomIndex()
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + direction, 0, ZOOM_LEVELS.length - 1)
    this.scene.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex])
    this.centerOn(center.x, center.y)
  }

  private syncZoomIndex(): void {
    const zoom = this.scene.cameras.main.zoom
    let bestIndex = 0
    let bestDistance = Infinity
    ZOOM_LEVELS.forEach((level, index) => {
      const distance = Math.abs(level - zoom)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    })
    this.zoomIndex = bestIndex
  }

  private getCameraCenter(): { x: number; y: number } {
    const cam = this.scene.cameras.main
    return {
      x: cam.scrollX + cam.width / 2,
      y: cam.scrollY + cam.height / 2,
    }
  }

  private centerOn(x: number, y: number): void {
    const cam = this.scene.cameras.main
    const visibleW = cam.width / cam.zoom
    const visibleH = cam.height / cam.zoom
    const minX = visibleW / 2
    const maxX = WORLD_WIDTH - visibleW / 2
    const minY = visibleH / 2
    const maxY = WORLD_HEIGHT - visibleH / 2
    cam.centerOn(
      Phaser.Math.Clamp(x, Math.min(minX, maxX), Math.max(minX, maxX)),
      Phaser.Math.Clamp(y, Math.min(minY, maxY), Math.max(minY, maxY)),
    )
  }
}
