import Phaser from 'phaser'
import { Building } from '../entities/Building'
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
    private readonly getHouseOwnerName: (building: Building) => string | null = () => null,
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
    savePlacedBuilding({ id, gridX, gridY, type: 'empty', ownerBotId: null })
    return true
  }

  createSign(building: Building): void {
    const sign = new BuildingSign(this.scene, building.id, building.gridX, building.gridY)
    sign.onClick((buildingId) => this.onSignClicked(buildingId))
    sign.setHoverLabelProvider(() => {
      if (building.type !== 'house') return null
      const owner = this.getHouseOwnerName(building)
      return owner ? `${owner}'s house` : 'Unassigned house'
    })
    this.buildingSigns.set(building.id, sign)
  }

  blockCells(building: Building): void {
    for (const cell of building.getWallCells()) this.pathfinder.blockWorldCell(cell.gx, cell.gy)
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
