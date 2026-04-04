import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import { getRecipe } from '../data/recipes'
import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import type { ObjectType } from '../storage/persistence'

interface FurnitureRecord {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  buildingId: string | null
}

type TableType = 'table2' | 'table4'

interface PlateSlot {
  offsetX: number
  offsetY: number
  plate: { recipeId: string; sprite: Phaser.GameObjects.Sprite } | null
}

interface TableRecord extends FurnitureRecord {
  tableType: TableType
  slots: PlateSlot[]
}

interface ChairRecord extends FurnitureRecord {
  occupiedBy: BotNirv | null
  nextToTable: boolean
}

// Plate slot offsets relative to table center
const SLOT_OFFSETS: Record<TableType, { offsetX: number; offsetY: number }[]> = {
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

const CHECK_INTERVAL = 2000
const ENTER_PROBABILITY = 0.4

export class RestaurantSystem {
  private chairs: ChairRecord[] = []
  private tables: TableRecord[] = []
  private buildings: Building[]
  private bots: BotNirv[]
  private timeSinceCheck = 0
  onPlateConsumed: ((tableX: number, tableY: number) => void) | null = null

  constructor(buildings: Building[], bots: BotNirv[]) {
    this.buildings = buildings
    this.bots = bots
  }

  registerChair(sprite: Phaser.GameObjects.Sprite, x: number, y: number): void {
    const buildingId = this.findContainingBuilding(x, y)
    const nextToTable = this.isAdjacentToTable(x, y)
    this.chairs.push({ sprite, x, y, buildingId, occupiedBy: null, nextToTable })
  }

  registerTable(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite, x: number, y: number, tableType: ObjectType): void {
    const buildingId = this.findContainingBuilding(x, y)
    const tt = tableType as TableType
    const offsets = SLOT_OFFSETS[tt]
    const slots: PlateSlot[] = offsets.map(o => ({ offsetX: o.offsetX, offsetY: o.offsetY, plate: null }))
    this.tables.push({ sprite, x, y, buildingId, tableType: tt, slots })
    this.recalcChairAdjacency()
  }

  /** Place food on the next available slot of a table. Repositions the sprite to the slot. */
  placeFoodOnTable(x: number, y: number, recipeId: string, sprite: Phaser.GameObjects.Sprite): boolean {
    const table = this.tables.find(t => t.x === x && t.y === y)
    if (!table) return false

    const emptySlot = table.slots.find(s => s.plate === null)
    if (!emptySlot) return false // table full

    emptySlot.plate = { recipeId, sprite }
    sprite.setPosition(table.x + emptySlot.offsetX, table.y + emptySlot.offsetY)
    return true
  }

  /** Remove a food plate from a table at (tableX, tableY). Destroys the sprite. Returns the recipeId if found. */
  removePlateFromTable(tableX: number, tableY: number): string | null {
    const table = this.tables.find(t => t.x === tableX && t.y === tableY)
    if (!table) return null

    const slot = table.slots.find(s => s.plate !== null)
    if (!slot || !slot.plate) return null

    const recipeId = slot.plate.recipeId
    slot.plate.sprite.destroy()
    slot.plate = null
    return recipeId
  }

  update(delta: number): void {
    this.timeSinceCheck += delta

    this.checkFoodService()
    this.checkArrivals()

    if (this.timeSinceCheck < CHECK_INTERVAL) return
    this.timeSinceCheck = 0

    this.tryAssignBots()
  }

  private checkFoodService(): void {
    for (const table of this.tables) {
      // Find a slot with food
      const foodSlot = table.slots.find(s => s.plate !== null)
      if (!foodSlot || !foodSlot.plate) continue

      for (const chair of this.chairs) {
        if (!chair.occupiedBy) continue
        if (chair.occupiedBy.state !== 'awaiting_service') continue

        const dx = Math.abs(chair.x - table.x)
        const dy = Math.abs(chair.y - table.y)
        if (dx + dy > TILE_W) continue

        const recipe = getRecipe(foodSlot.plate.recipeId)
        const eatTime = recipe?.eatTimeMs ?? 5000
        const recipeColor = recipe?.color ?? 0xffffff

        chair.occupiedBy.startEating(eatTime, recipeColor)

        foodSlot.plate.sprite.destroy()
        foodSlot.plate = null
        this.onPlateConsumed?.(table.x, table.y)
        break
      }
    }
  }

  private checkArrivals(): void {
    for (const chair of this.chairs) {
      if (!chair.occupiedBy) continue
      const bot = chair.occupiedBy
      if (bot.state !== 'walking_to_chair') continue

      const dist = Phaser.Math.Distance.Between(
        bot.nirv.sprite.x, bot.nirv.sprite.y,
        chair.x, chair.y
      )

      if (dist < 20) {
        bot.seat(chair.nextToTable)
      }
    }
  }

  private tryAssignBots(): void {
    const availableChairs = this.chairs.filter(c => {
      if (c.occupiedBy) return false
      if (!c.buildingId) return false
      const building = this.buildings.find(b => b.id === c.buildingId)
      return building && building.type === 'restaurant'
    })

    if (availableChairs.length === 0) return

    for (const bot of this.bots) {
      if (bot.state !== 'waiting') continue
      if (Math.random() > ENTER_PROBABILITY) continue

      let bestChair: ChairRecord | null = null
      let bestDist = Infinity

      for (const chair of availableChairs) {
        const dist = Phaser.Math.Distance.Between(
          bot.nirv.sprite.x, bot.nirv.sprite.y,
          chair.x, chair.y
        )
        if (dist < TILE_W * 15 && dist < bestDist) {
          bestDist = dist
          bestChair = chair
        }
      }

      if (bestChair) {
        bestChair.occupiedBy = bot
        bot.redirectToChair(bestChair.x, bestChair.y)
        const idx = availableChairs.indexOf(bestChair)
        if (idx >= 0) availableChairs.splice(idx, 1)
      }
    }
  }

  cleanupUnseated(): void {
    for (const chair of this.chairs) {
      if (!chair.occupiedBy) continue
      const bot = chair.occupiedBy
      if (bot.state === 'walking' || bot.state === 'waiting') {
        chair.occupiedBy = null
      }
    }
  }

  private findContainingBuilding(x: number, y: number): string | null {
    for (const building of this.buildings) {
      if (building.containsPixel(x, y)) {
        return building.id
      }
    }
    return null
  }

  private isAdjacentToTable(cx: number, cy: number): boolean {
    for (const table of this.tables) {
      const dx = Math.abs(cx - table.x)
      const dy = Math.abs(cy - table.y)
      if (dx + dy <= TILE_W) {
        return true
      }
    }
    return false
  }

  private recalcChairAdjacency(): void {
    for (const chair of this.chairs) {
      chair.nextToTable = this.isAdjacentToTable(chair.x, chair.y)
    }
  }
}
