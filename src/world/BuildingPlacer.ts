import Phaser from 'phaser'
import { Building, BUILDING_GRID_W, BUILDING_GRID_H } from '../entities/Building'
import { BuildingSign } from '../entities/BuildingSign'
import { savePlacedBuilding, updateBuildingType } from '../storage/buildingPersistence'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { BuildingTypeUI } from '../ui/BuildingTypeUI'
import { GRID_COLS, GRID_ROWS } from '../config/world'

export class BuildingPlacer {
  private buildingSigns = new Map<string, BuildingSign>()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly buildings: Building[],
    private readonly obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
    private readonly pathfinder: GridPathfinder,
    private readonly buildingTypeUI: BuildingTypeUI,
    private readonly isPlacementActive: () => boolean,
  ) {}

  place(gridX: number, gridY: number): boolean {
    for (const b of this.buildings) {
      if (b.overlaps(gridX, gridY)) return false
    }
    if (gridX < 0 || gridY < 0 || gridX > GRID_COLS - 8 || gridY > GRID_ROWS - 8) return false

    const id = crypto.randomUUID()
    const building = new Building(this.scene, id, gridX, gridY, 'empty')
    building.createWalls(this.scene, this.obstacleGroup)
    this.buildings.push(building)
    this.createSign(building)
    this.blockCells(building)
    savePlacedBuilding({ id, gridX, gridY, type: 'empty' })
    return true
  }

  createSign(building: Building): void {
    const sign = new BuildingSign(this.scene, building.id, building.gridX, building.gridY)
    sign.onClick((buildingId) => this.onSignClicked(buildingId))
    this.buildingSigns.set(building.id, sign)
  }

  blockCells(building: Building): void {
    const { gridX: gx, gridY: gy } = building
    for (let x = gx; x < gx + BUILDING_GRID_W; x++) this.pathfinder.blockCell(x, gy)
    for (let x = gx; x < gx + BUILDING_GRID_W; x++) {
      if (x === gx + 3 || x === gx + 4) continue
      this.pathfinder.blockCell(x, gy + BUILDING_GRID_H - 1)
    }
    for (let y = gy; y < gy + BUILDING_GRID_H; y++) this.pathfinder.blockCell(gx, y)
    for (let y = gy; y < gy + BUILDING_GRID_H; y++) this.pathfinder.blockCell(gx + BUILDING_GRID_W - 1, y)
  }

  private onSignClicked(buildingId: string): void {
    if (this.isPlacementActive()) return
    const building = this.buildings.find(b => b.id === buildingId)
    if (!building) return

    this.buildingTypeUI.open(buildingId, building.type, (id, type) => {
      const b = this.buildings.find(b => b.id === id)
      if (b) { b.setType(type); updateBuildingType(id, type) }
    })
  }
}
