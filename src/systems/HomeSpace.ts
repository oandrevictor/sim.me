import type { Building } from '../entities/Building'
import {
  addHouseOwner,
  assignHouseOwner,
  removeHouseOwner,
  setHouseOwner,
} from '../storage/buildingPersistence'
import type { LotRecord } from '../storage/lotPersistence'
import { GRID_ROWS } from '../config/world'
import { gridToScreen, screenToCell } from '../utils/isoGrid'

export type HomeKind = 'house' | 'residential_lot'

export interface HomeSpace {
  readonly id: string
  readonly kind: HomeKind
  readonly ownerBotId: string | null
  readonly ownerBotIds: readonly string[]
  readonly label: string
  assignOwner(ownerBotId: string): boolean
  setOwnerBotId(ownerBotId: string | null): void
  addOwnerBotId(ownerBotId: string): void
  removeOwnerBotId(ownerBotId: string): void
  getDoorPosition(): { x: number; y: number }
  getInteriorSpot(index?: number): { x: number; y: number }
  containsPixel(x: number, y: number): boolean
}

export function buildingHomeSpace(building: Building): HomeSpace {
  return {
    id: building.id,
    kind: 'house',
    label: 'house',
    get ownerBotId() { return building.ownerBotId },
    get ownerBotIds() { return building.ownerBotIds },
    assignOwner(ownerBotId: string): boolean {
      const assigned = assignHouseOwner(building.id, ownerBotId)
      if (assigned) building.setOwnerBotId(ownerBotId)
      return assigned
    },
    setOwnerBotId(ownerBotId: string | null): void {
      building.setOwnerBotId(ownerBotId)
      setHouseOwner(building.id, ownerBotId)
    },
    addOwnerBotId(ownerBotId: string): void {
      building.addOwnerBotId(ownerBotId)
      addHouseOwner(building.id, ownerBotId)
    },
    removeOwnerBotId(ownerBotId: string): void {
      building.removeOwnerBotId(ownerBotId)
      removeHouseOwner(building.id, ownerBotId)
    },
    getDoorPosition: () => building.getDoorPosition(),
    getInteriorSpot: (index = 0) => building.getInteriorSpot(index),
    containsPixel: (x: number, y: number) => building.containsPixel(x, y),
  }
}

export class ResidentialLotHomeSpace implements HomeSpace {
  readonly kind = 'residential_lot'
  readonly label = 'residential lot'

  constructor(
    private readonly lot: LotRecord,
    private readonly persist: () => void,
  ) {}

  get id(): string { return this.lot.id }
  get ownerBotId(): string | null { return this.lot.ownerBotIds?.[0] ?? this.lot.ownerBotId ?? null }
  get ownerBotIds(): readonly string[] { return this.lot.ownerBotIds ?? [] }

  assignOwner(ownerBotId: string): boolean {
    if (this.ownerBotIds.length > 0) return false
    this.setOwners([ownerBotId])
    return true
  }

  setOwnerBotId(ownerBotId: string | null): void {
    this.setOwners(ownerBotId ? [ownerBotId] : [])
  }

  addOwnerBotId(ownerBotId: string): void {
    const ids = [...this.ownerBotIds]
    if (!ids.includes(ownerBotId)) ids.push(ownerBotId)
    this.setOwners(ids)
  }

  removeOwnerBotId(ownerBotId: string): void {
    this.setOwners(this.ownerBotIds.filter(id => id !== ownerBotId))
  }

  getDoorPosition(): { x: number; y: number } {
    const bounds = this.bounds()
    const doorGX = Math.floor((bounds.minGX + bounds.maxGX) / 2)
    const doorGY = Math.min(GRID_ROWS - 1, bounds.maxGY + 1)
    return gridToScreen(doorGX, doorGY)
  }

  getInteriorSpot(index = 0): { x: number; y: number } {
    const cells = [...this.lot.cells].sort((a, b) => a.gy - b.gy || a.gx - b.gx)
    const cell = cells[index % Math.max(1, cells.length)] ?? { gx: 0, gy: 0 }
    return gridToScreen(cell.gx, cell.gy)
  }

  containsPixel(x: number, y: number): boolean {
    const cell = screenToCell(x, y)
    return this.lot.cells.some(c => c.gx === cell.gx && c.gy === cell.gy)
  }

  private setOwners(ownerBotIds: readonly string[]): void {
    this.lot.ownerBotIds = [...ownerBotIds]
    this.lot.ownerBotId = this.lot.ownerBotIds[0] ?? null
    this.persist()
  }

  private bounds(): { minGX: number; maxGX: number; minGY: number; maxGY: number } {
    const xs = this.lot.cells.map(c => c.gx)
    const ys = this.lot.cells.map(c => c.gy)
    return {
      minGX: Math.min(...xs),
      maxGX: Math.max(...xs),
      minGY: Math.min(...ys),
      maxGY: Math.max(...ys),
    }
  }
}
