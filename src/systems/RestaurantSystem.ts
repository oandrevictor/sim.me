import Phaser from 'phaser'
import { TILE_W, screenToGrid } from '../utils/isoGrid'
import { getRecipe } from '../data/recipes'
import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import { removeObjectByType, type ObjectType } from '../storage/persistence'

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

export interface CounterRecord {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  buildingId: string | null
  plate: { recipeId: string; sprite: Phaser.GameObjects.Sprite } | null
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

const COUNTER_PLATE_OFFSET_Y = -10

const CHECK_INTERVAL = 2000
const ENTER_PROBABILITY = 0.4

export class RestaurantSystem {
  private chairs: ChairRecord[] = []
  private tables: TableRecord[] = []
  private counters: CounterRecord[] = []
  private buildings: Building[]
  private bots: BotNirv[]
  private timeSinceCheck = 0
  private staffBotFilter: (bot: BotNirv) => boolean = () => false
  onPlateConsumed: ((tableX: number, tableY: number, sprite: Phaser.GameObjects.Sprite) => void) | null = null

  constructor(buildings: Building[], bots: BotNirv[]) {
    this.buildings = buildings
    this.bots = bots
  }

  /** Bots matching this filter never get restaurant customer chairs. */
  setStaffBotFilter(fn: (bot: BotNirv) => boolean): void {
    this.staffBotFilter = fn
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

  registerCounter(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number): void {
    const buildingId = this.findContainingBuilding(x, y)
    this.counters.push({ sprite, x, y, buildingId, plate: null })
  }

  unregisterCounter(sprite: Phaser.Physics.Arcade.Sprite): void {
    const c = this.counters.find(r => r.sprite === sprite)
    if (c?.plate) {
      removeObjectByType(c.x, c.y, 'food_plate')
      c.plate.sprite.destroy()
      c.plate = null
    }
    this.counters = this.counters.filter(r => r.sprite !== sprite)
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

  /** One plate per counter; returns false if not a registered counter or slot full. */
  placeFoodOnCounter(x: number, y: number, recipeId: string, sprite: Phaser.GameObjects.Sprite): boolean {
    const counter = this.counters.find(c => c.x === x && c.y === y)
    if (!counter || counter.plate) return false
    counter.plate = { recipeId, sprite }
    sprite.setPosition(counter.x, counter.y + COUNTER_PLATE_OFFSET_Y)
    return true
  }

  /** Remove a specific plate from a table by sprite reference. Clears the slot; caller is responsible for destroying the sprite. Returns the recipeId if found. */
  removePlateFromTable(tableX: number, tableY: number, sprite: Phaser.GameObjects.Sprite): string | null {
    const table = this.tables.find(t => t.x === tableX && t.y === tableY)
    if (!table) return null

    const slot = table.slots.find(s => s.plate?.sprite === sprite)
    if (!slot || !slot.plate) return null

    const recipeId = slot.plate.recipeId
    slot.plate = null
    return recipeId
  }

  removePlateFromCounterBySprite(sprite: Phaser.GameObjects.Sprite): string | null {
    for (const c of this.counters) {
      if (c.plate?.sprite === sprite) {
        const id = c.plate.recipeId
        c.plate = null
        return id
      }
    }
    return null
  }

  /** Table first (legacy coords), then counter pass-through for the same (x,y) surface. */
  removePlateFromTableOrCounter(surfaceX: number, surfaceY: number, sprite: Phaser.GameObjects.Sprite): string | null {
    const fromTable = this.removePlateFromTable(surfaceX, surfaceY, sprite)
    if (fromTable !== null) return fromTable
    return this.removePlateFromCounterBySprite(sprite)
  }

  countFreeCounterSlotsInBuilding(buildingId: string): number {
    return this.counters.filter(c => c.buildingId === buildingId && !c.plate).length
  }

  hasFoodOnCounterInBuilding(buildingId: string): boolean {
    return this.counters.some(c => c.buildingId === buildingId && c.plate !== null)
  }

  buildingHasAwaitingCustomer(buildingId: string): boolean {
    for (const chair of this.chairs) {
      if (chair.buildingId !== buildingId) continue
      if (chair.occupiedBy?.state === 'awaiting_service') return true
    }
    return false
  }

  /** Table with a free plate slot adjacent to a chair occupied by a bot awaiting food (same building). */
  findWaiterServiceTable(buildingId: string): { tableX: number; tableY: number } | null {
    for (const table of this.tables) {
      if (table.buildingId !== buildingId) continue
      const hasEmpty = table.slots.some(s => s.plate === null)
      if (!hasEmpty) continue
      for (const chair of this.chairs) {
        if (chair.buildingId !== buildingId) continue
        if (chair.occupiedBy?.state !== 'awaiting_service') continue
        if (this.isGridAdjacent(chair.x, chair.y, table.x, table.y)) {
          return { tableX: table.x, tableY: table.y }
        }
      }
    }
    return null
  }

  findFreeCounterInBuilding(buildingId: string): { x: number; y: number } | null {
    const c = this.counters.find(x => x.buildingId === buildingId && !x.plate)
    return c ? { x: c.x, y: c.y } : null
  }

  getFirstCounterWithFoodInBuilding(buildingId: string): CounterRecord | null {
    return this.counters.find(c => c.buildingId === buildingId && c.plate !== null) ?? null
  }

  getCounterAt(x: number, y: number): CounterRecord | null {
    return this.counters.find(c => c.x === x && c.y === y) ?? null
  }

  unregisterChair(sprite: Phaser.GameObjects.Sprite): void {
    this.chairs = this.chairs.filter(c => c.sprite !== sprite)
  }

  unregisterTable(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    this.tables = this.tables.filter(t => t.sprite !== sprite)
    this.recalcChairAdjacency()
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

        if (!this.isGridAdjacent(chair.x, chair.y, table.x, table.y)) continue

        const recipe = getRecipe(foodSlot.plate.recipeId)
        const eatTime = recipe?.eatTimeMs ?? 5000
        const recipeColor = recipe?.color ?? 0xffffff

        chair.occupiedBy.startEating(eatTime, recipeColor)

        const consumedSprite = foodSlot.plate.sprite
        foodSlot.plate.sprite.destroy()
        foodSlot.plate = null
        this.onPlateConsumed?.(table.x, table.y, consumedSprite)
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

      if (dist < 32) {
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
      if (this.staffBotFilter(bot)) continue
      if (bot.state !== 'waiting') continue
      // Prefer water when thirsty so bots don't take a restaurant seat instead
      if (bot.nirv.getHydrationLevel() <= 60) continue
      // Prefer snack when hungry
      if (bot.nirv.getSatiation() <= bot.nirv.hungerThreshold) continue
      // Prefer stage when seeking fun (soft priority)
      if (bot.nirv.getFunLevel() <= bot.nirv.getFunThreshold()) continue
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

  /** Clear chair reservation when bot leaves for another activity (e.g. critical thirst). */
  releaseChairForBot(bot: BotNirv): void {
    for (const chair of this.chairs) {
      if (chair.occupiedBy === bot) chair.occupiedBy = null
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
      if (this.isGridAdjacent(cx, cy, table.x, table.y)) {
        return true
      }
    }
    return false
  }

  /** Check if two pixel positions are within 1 grid cell of each other */
  isGridAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    const ga = screenToGrid(ax, ay)
    const gb = screenToGrid(bx, by)
    const gdx = Math.abs(Math.round(ga.gx) - Math.round(gb.gx))
    const gdy = Math.abs(Math.round(ga.gy) - Math.round(gb.gy))
    return gdx + gdy <= 1
  }

  private recalcChairAdjacency(): void {
    for (const chair of this.chairs) {
      chair.nextToTable = this.isAdjacentToTable(chair.x, chair.y)
    }
  }
}
