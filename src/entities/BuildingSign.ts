import Phaser from 'phaser'
import { BUILDING_GRID_W, BUILDING_GRID_H } from './Building'
import { gridToScreen } from '../utils/isoGrid'

export class BuildingSign {
  readonly sprite: Phaser.GameObjects.Sprite
  readonly buildingId: string

  constructor(scene: Phaser.Scene, buildingId: string, buildingGridX: number, buildingGridY: number) {
    this.buildingId = buildingId

    // Position: near the door (bottom edge of building diamond)
    const doorPos = gridToScreen(
      buildingGridX + Math.floor(BUILDING_GRID_W / 2),
      buildingGridY + BUILDING_GRID_H,
    )

    this.sprite = scene.add.sprite(doorPos.x + 20, doorPos.y + 10, 'obj_sign')
    this.sprite.setDepth(doorPos.y + 10)
    this.sprite.setInteractive({ useHandCursor: true })
  }

  onClick(callback: (buildingId: string) => void): void {
    this.sprite.on('pointerdown', () => callback(this.buildingId))
  }
}
