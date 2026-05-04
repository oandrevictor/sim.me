import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'

export type TableType = 'table2' | 'table4'
export type CounterReservationKind = 'chef_dropoff' | 'waiter_pickup' | 'waiter_return'

export interface FurnitureRecord {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  buildingId: string | null
}

export interface PlateRef {
  recipeId: string
  sprite: Phaser.GameObjects.Sprite
}

export interface PlateSlot {
  offsetX: number
  offsetY: number
  plate: PlateRef | null
  reservedByWaiterBotId: string | null
}

export interface TableRecord extends FurnitureRecord {
  tableType: TableType
  slots: PlateSlot[]
}

export interface ChairRecord extends FurnitureRecord {
  occupiedBy: BotNirv | null
  nextToTable: boolean
  serviceClaimedByWaiterBotId: string | null
}

export interface CounterReservation {
  kind: CounterReservationKind
  botId: string
}

export interface CounterRecord extends FurnitureRecord {
  plate: PlateRef | null
  reservation: CounterReservation | null
}

export interface WaiterServiceClaim {
  botId: string
  counter: CounterRecord
  chair: ChairRecord
  table: TableRecord
  slot: PlateSlot
  pickedUp: boolean
}

export const SLOT_OFFSETS: Record<TableType, { offsetX: number; offsetY: number }[]> = {
  table2: [
    { offsetX: -6, offsetY: 0 },
    { offsetX: 6, offsetY: 0 },
  ],
  table4: [
    { offsetX: -6, offsetY: -6 },
    { offsetX: 6, offsetY: -6 },
    { offsetX: -6, offsetY: 6 },
    { offsetX: 6, offsetY: 6 },
  ],
}
