import Phaser from 'phaser'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { TILE_W } from '../utils/isoGrid'
import type { BotNirv } from '../entities/BotNirv'
import { fruitSlotWorldPosition, FRUIT_CRATE_SLOT_COUNT } from './fruitCrateLayout'
import type { FoodStockStation } from './foodStockTypes'
import {
  resolveReachablePoint,
  resolveReachableQueueSlot,
  type StationApproach,
} from './stationApproach'

const STATION_REACH_PX = 32

export interface FruitCrateStation extends FoodStockStation {
  slots: [BotNirv | null, BotNirv | null, BotNirv | null]
  slotApproaches: [StationApproach | null, StationApproach | null, StationApproach | null]
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

export function checkFruitSlotArrivals(
  pathfinder: GridPathfinder,
  stations: FruitCrateStation[],
  consumeStock: (st: FruitCrateStation) => boolean,
  canInteract: (bot: BotNirv, x: number, y: number) => boolean = () => true,
): void {
  for (const st of stations) {
    for (let i = 0; i < FRUIT_CRATE_SLOT_COUNT; i++) {
      const bot = st.slots[i]
      if (!bot || bot.state !== 'walking_to_fruit') continue
      if (!canInteract(bot, st.x, st.y)) continue
      st.slotApproaches[i] ??= resolveFruitSlotApproach(pathfinder, st, bot, i)
      const pos = st.slotApproaches[i]
      if (!pos) {
        st.slots[i] = null
        st.slotApproaches[i] = null
        bot.cancelSatiationQueue()
        continue
      }
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, pos.x, pos.y)
      if (d < STATION_REACH_PX) {
        if (consumeStock(st)) bot.arriveAtFruitStation()
        else bot.cancelSatiationQueue()
      }
    }
  }
}

export function checkFruitQueueArrivals(pathfinder: GridPathfinder, stations: FruitCrateStation[]): void {
  for (const st of stations) {
    for (let lineIndex = st.queue.length - 1; lineIndex >= 0; lineIndex--) {
      const bot = st.queue[lineIndex]!
      if (bot.state !== 'walking_to_fruit_queue') continue
      const slot = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, lineIndex)
      if (!slot) {
        st.queue.splice(lineIndex, 1)
        bot.cancelSatiationQueue()
        continue
      }
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
      if (d < STATION_REACH_PX) bot.arriveAtFruitQueueSlot()
    }
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
      st.slotApproaches[i] = null
      promote(st)
    }
  }
}

export function promoteFruitQueue(pathfinder: GridPathfinder, st: FruitCrateStation): void {
  const next = st.queue.shift()
  if (!next) return
  const free = firstReachableFruitSlot(pathfinder, st, next)
  if (!free) {
    next.cancelSatiationQueue()
    promoteFruitQueue(pathfinder, st)
    return
  }
  st.slots[free.index] = next
  st.slotApproaches[free.index] = free.approach
  next.redirectToFruit(st.x, st.y, free.index, free.approach.x, free.approach.y)
  syncFruitQueueSlots(pathfinder, st)
}

export function syncFruitQueueSlots(pathfinder: GridPathfinder, st: FruitCrateStation): void {
  const kept: BotNirv[] = []
  for (const bot of st.queue) {
    const p = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, kept.length)
    if (!p) {
      bot.cancelSatiationQueue()
      continue
    }
    if (bot.state === 'waiting_at_fruit_queue' || bot.state === 'walking_to_fruit_queue') {
      bot.redirectToFruitQueueSlot(p.x, p.y)
    }
    kept.push(bot)
  }
  st.queue.splice(0, st.queue.length, ...kept)
}

export function repairFruitOrphanQueues(stations: FruitCrateStation[], promote: (st: FruitCrateStation) => void): void {
  for (const st of stations) {
    const anyOccupied = st.slots.some(b => b !== null)
    if (anyOccupied || st.queue.length === 0) continue
    promote(st)
  }
}

/** Assign hungry bot to nearest fruit crate (already distance-filtered). */
export function assignBotToFruitCrate(pathfinder: GridPathfinder, st: FruitCrateStation, bot: BotNirv): boolean {
  const free = firstReachableFruitSlot(pathfinder, st, bot)
  if (free) {
    st.slots[free.index] = bot
    st.slotApproaches[free.index] = free.approach
    bot.redirectToFruit(st.x, st.y, free.index, free.approach.x, free.approach.y)
    return true
  }
  const p = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, st.queue.length)
  if (!p) return false
  st.queue.push(bot)
  bot.redirectToFruitQueueSlot(p.x, p.y)
  return true
}

function firstReachableFruitSlot(
  pathfinder: GridPathfinder,
  st: FruitCrateStation,
  bot: BotNirv,
): { index: number; approach: StationApproach } | null {
  for (let i = 0; i < FRUIT_CRATE_SLOT_COUNT; i++) {
    if (st.slots[i]) continue
    const approach = resolveFruitSlotApproach(pathfinder, st, bot, i)
    if (approach) return { index: i, approach }
  }
  return null
}

function resolveFruitSlotApproach(
  pathfinder: GridPathfinder,
  st: FruitCrateStation,
  bot: BotNirv,
  slotIndex: number,
): StationApproach | null {
  const pos = fruitSlotWorldPosition(st.x, st.y, slotIndex)
  return resolveReachablePoint(pathfinder, bot, pos.x, pos.y)
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
    st.slotApproaches[i] = null
  }
  for (const b of st.queue) b.cancelSatiationQueue()
  st.queue.length = 0
  stations.splice(idx, 1)
}
