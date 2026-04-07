import { stageFootprint, type StageVariant } from '../config/stageVariants'
import { Stage } from '../entities/Stage'
import { savePlacedStage, removePlacedStage } from '../storage/stagePersistence'
import type { Building } from '../entities/Building'
import type Phaser from 'phaser'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { installStageBarrier, removeStageBarrier } from './stageBarrier'

export class StagePlacer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly stages: Stage[],
    private readonly buildings: Building[],
    private readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
    private readonly pathfinder: GridPathfinder,
    private readonly enterStagePlacement: (rotation: 0 | 1, variant: StageVariant) => void,
    private readonly onStageRemoved?: (stageId: string) => void,
  ) {}

  place(gridX: number, gridY: number, rotation: 0 | 1 = 0, variant: StageVariant = 'default'): boolean {
    const { w: gw, h: gh } = stageFootprint(variant, rotation)
    if (gridX < 0 || gridY < 0 || gridX > GRID_COLS - gw || gridY > GRID_ROWS - gh) return false
    for (const b of this.buildings) {
      if (b.overlaps(gridX, gridY)) return false
    }

    const id = crypto.randomUUID()
    const stage = new Stage(this.scene, id, gridX, gridY, rotation, variant)
    this.stages.push(stage)
    installStageBarrier(stage, this.pathfinder, this.scene, this.obstacleGroup)
    const record: Parameters<typeof savePlacedStage>[0] = { id, gridX, gridY, rotation }
    if (variant !== 'default') record.variant = variant
    savePlacedStage(record)
    return true
  }

  /** Returns true if a stage was found and picked up. */
  tryPickUp(pointer: Phaser.Input.Pointer): boolean {
    const idx = this.stages.findIndex(s => s.containsPixel(pointer.worldX, pointer.worldY))
    if (idx === -1) return false

    const stage = this.stages[idx]
    removeStageBarrier(stage, this.pathfinder)
    stage.graphics.destroy()
    stage.sprite?.destroy()
    this.stages.splice(idx, 1)
    removePlacedStage(stage.id)
    this.onStageRemoved?.(stage.id)
    this.enterStagePlacement(stage.rotation, stage.variant)
    return true
  }

  isOverStage(worldX: number, worldY: number): boolean {
    return this.stages.some(s => s.containsPixel(worldX, worldY))
  }
}
