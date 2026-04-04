import Phaser from 'phaser'
import { GRID_SIZE } from '../config/world'
import { BUILDING_GRID_W, BUILDING_GRID_H } from './Building'

export class BuildingSign {
  readonly sprite: Phaser.GameObjects.Sprite
  readonly buildingId: string

  constructor(scene: Phaser.Scene, buildingId: string, buildingGridX: number, buildingGridY: number) {
    this.buildingId = buildingId

    // Position: centered on door X, 1 grid cell below bottom wall
    const bpx = buildingGridX * GRID_SIZE
    const bpy = buildingGridY * GRID_SIZE
    const bpw = BUILDING_GRID_W * GRID_SIZE
    const bph = BUILDING_GRID_H * GRID_SIZE
    const signX = bpx + bpw / 2 + GRID_SIZE * 2
    const signY = bpy + bph + GRID_SIZE / 2

    this.sprite = scene.add.sprite(signX, signY, 'obj_sign')
    this.sprite.setDepth(3)
    this.sprite.setInteractive({ useHandCursor: true })
  }

  onClick(callback: (buildingId: string) => void): void {
    this.sprite.on('pointerdown', () => callback(this.buildingId))
  }
}
