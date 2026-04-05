import { Stage, STAGE_GRID_W, STAGE_GRID_H } from '../entities/Stage'
import { savePlacedStage, removePlacedStage } from '../storage/stagePersistence'
import type { Building } from '../entities/Building'
import type Phaser from 'phaser'
import { GRID_COLS, GRID_ROWS } from '../config/world'

export class StagePlacer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly stages: Stage[],
    private readonly buildings: Building[],
    private readonly enterStagePlacement: (rotation: 0 | 1) => void,
  ) {}

  place(gridX: number, gridY: number, rotation: 0 | 1 = 0): boolean {
    const gw = rotation === 0 ? STAGE_GRID_W : STAGE_GRID_H
    const gh = rotation === 0 ? STAGE_GRID_H : STAGE_GRID_W
    if (gridX < 0 || gridY < 0 || gridX > GRID_COLS - gw || gridY > GRID_ROWS - gh) return false
    for (const b of this.buildings) {
      if (b.overlaps(gridX, gridY)) return false
    }

    const id = crypto.randomUUID()
    const stage = new Stage(this.scene, id, gridX, gridY, rotation)
    this.stages.push(stage)
    savePlacedStage({ id, gridX, gridY, rotation })
    return true
  }

  /** Returns true if a stage was found and picked up. */
  tryPickUp(pointer: Phaser.Input.Pointer): boolean {
    const idx = this.stages.findIndex(s => s.containsPixel(pointer.worldX, pointer.worldY))
    if (idx === -1) return false

    const stage = this.stages[idx]
    stage.graphics.destroy()
    this.stages.splice(idx, 1)
    removePlacedStage(stage.id)
    this.enterStagePlacement(stage.rotation)
    return true
  }

  isOverStage(worldX: number, worldY: number): boolean {
    return this.stages.some(s => s.containsPixel(worldX, worldY))
  }
}
