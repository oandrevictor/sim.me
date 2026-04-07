import Phaser from 'phaser'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { TILE_W } from '../utils/isoGrid'
import type { BotNirv } from '../entities/BotNirv'
import { fruitSlotWorldPosition, FRUIT_CRATE_SLOT_COUNT } from './fruitCrateLayout'
import { queueSlotBehindStation } from './waterQueueLayout'

const STATION_REACH_PX = 32

export interface FruitCrateStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  slots: [BotNirv | null, BotNirv | null, BotNirv | null]
  queue: BotNirv[]
}

export function firstFreeFruitSlot(st: FruitCrateStation): number | null {
  for (let i = 0; i < FRUIT_CRATE_SLOT_COUNT; i++) if (!st.slots[i]) return i
  return null
}

export function findFruitStationForBot(stations: FruitCrateStation[], bot: BotNirv): FruitCrateStation | null {
  for (const st of stations) {
    for (let i = 0; i < FRUIT_CRATE_SLOT_COUNT; i++) if (st.slots[i] === bot) return st
    if (st.queue.includes(bot)) return st
  }
  return null
}

export function checkFruitSlotArrivals(stations: FruitCrateStation[]): void {
  for (const st of stations) {
    for (let i = 0; i < FRUIT_CRATE_SLOT_COUNT; i++) {
      const bot = st.slots[i]
      if (!bot || bot.state !== 'walking_to_fruit') continue
      const pos = fruitSlotWorldPosition(st.x, st.y, i)
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, pos.x, pos.y)
      if (d < STATION_REACH_PX) bot.arriveAtFruitStation()
    }
  }
}

export function checkFruitQueueArrivals(pathfinder: GridPathfinder, stations: FruitCrateStation[]): void {
  for (const st of stations) {
    st.queue.forEach((bot, lineIndex) => {
      if (bot.state !== 'walking_to_fruit_queue') return
      const slot = queueSlotBehindStation(pathfinder, st.x, st.y, lineIndex)
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
      if (d < STATION_REACH_PX) bot.arriveAtFruitQueueSlot()
    })
  }
}

/** Slot freed after interact (or approach aborted); promote one waiter. */
export function releaseFruitSlotsAfterInteract(stations: FruitCrateStation[], promote: (st: FruitCrateStation) => void): void {
  for (const st of stations) {
    for (let i = 0; i < FRUIT_CRATE_SLOT_COUNT; i++) {
      const bot = st.slots[i]
      if (!bot) continue
      const s = bot.state
      if (s === 'walking_to_fruit' || s === 'fruit_interact') continue
      st.slots[i] = null
      promote(st)
    }
  }
}

export function promoteFruitQueue(pathfinder: GridPathfinder, st: FruitCrateStation): void {
  const next = st.queue.shift()
  if (!next) return
  const freeI = firstFreeFruitSlot(st)
  if (freeI === null) {
    st.queue.unshift(next)
    return
  }
  st.slots[freeI] = next
  next.redirectToFruit(st.x, st.y, freeI)
  syncFruitQueueSlots(pathfinder, st)
}

export function syncFruitQueueSlots(pathfinder: GridPathfinder, st: FruitCrateStation): void {
  st.queue.forEach((bot, i) => {
    const p = queueSlotBehindStation(pathfinder, st.x, st.y, i)
    if (bot.state === 'waiting_at_fruit_queue' || bot.state === 'walking_to_fruit_queue') {
      bot.redirectToFruitQueueSlot(p.x, p.y)
    }
  })
}

export function repairFruitOrphanQueues(stations: FruitCrateStation[], promote: (st: FruitCrateStation) => void): void {
  for (const st of stations) {
    const anyOccupied = st.slots.some(b => b !== null)
    if (anyOccupied || st.queue.length === 0) continue
    promote(st)
  }
}

/** Assign hungry bot to nearest fruit crate (already distance-filtered). */
export function assignBotToFruitCrate(pathfinder: GridPathfinder, st: FruitCrateStation, bot: BotNirv): void {
  const freeI = firstFreeFruitSlot(st)
  if (freeI !== null) {
    st.slots[freeI] = bot
    bot.redirectToFruit(st.x, st.y, freeI)
  } else {
    st.queue.push(bot)
    const lineIndex = st.queue.length - 1
    const p = queueSlotBehindStation(pathfinder, st.x, st.y, lineIndex)
    bot.redirectToFruitQueueSlot(p.x, p.y)
  }
}

export function distanceToStation(bot: BotNirv, st: FruitCrateStation): number {
  return Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
}

export function isWithinStationRange(bot: BotNirv, st: FruitCrateStation): boolean {
  return distanceToStation(bot, st) < TILE_W * 15
}

export function unregisterFruitCrateStation(
  stations: FruitCrateStation[],
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
): void {
  const idx = stations.findIndex(s => s.sprite === sprite)
  if (idx === -1) return
  const st = stations[idx]
  for (let i = 0; i < FRUIT_CRATE_SLOT_COUNT; i++) {
    if (st.slots[i]) st.slots[i]!.cancelSatiationQueue()
    st.slots[i] = null
  }
  for (const b of st.queue) b.cancelSatiationQueue()
  st.queue.length = 0
  stations.splice(idx, 1)
}
