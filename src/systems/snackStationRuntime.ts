import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { FoodStockStation } from './foodStockTypes'
import {
  resolveReachableQueueSlot,
  resolveStationApproach,
  type StationApproach,
} from './stationApproach'

const STATION_REACH_PX = 32

export interface SnackStation extends FoodStockStation {
  active: BotNirv | null
  activeApproach: StationApproach | null
  queue: BotNirv[]
}

export function findSnackStationForBot(stations: readonly SnackStation[], bot: BotNirv): SnackStation | null {
  return stations.find(st => st.active === bot || st.queue.includes(bot)) ?? null
}

export function anySnackApproachOrInteract(stations: readonly SnackStation[]): boolean {
  return stations.some(st => st.active?.state === 'walking_to_snack' || st.active?.state === 'snack_interact')
}

export function checkSnackTapArrivals(
  pathfinder: GridPathfinder,
  stations: readonly SnackStation[],
  consumeStock: (st: SnackStation) => boolean,
  canInteract: (bot: BotNirv, x: number, y: number) => boolean,
): void {
  for (const st of stations) {
    const bot = st.active
    if (!bot || bot.state !== 'walking_to_snack') continue
    if (!canInteract(bot, st.x, st.y)) continue
    st.activeApproach ??= resolveStationApproach(pathfinder, st.x, st.y, bot)
    if (!st.activeApproach) {
      bot.cancelSatiationQueue()
      continue
    }
    const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.activeApproach.x, st.activeApproach.y)
    if (d < STATION_REACH_PX) {
      if (consumeStock(st)) bot.arriveAtSnackStation()
      else bot.cancelSatiationQueue()
    }
  }
}

export function checkSnackQueueArrivals(pathfinder: GridPathfinder, stations: readonly SnackStation[]): void {
  for (const st of stations) {
    for (let lineIndex = st.queue.length - 1; lineIndex >= 0; lineIndex--) {
      const bot = st.queue[lineIndex]!
      if (bot.state !== 'walking_to_snack_queue') continue
      const slot = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, lineIndex)
      if (!slot) {
        st.queue.splice(lineIndex, 1)
        bot.cancelSatiationQueue()
        continue
      }
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
      if (d < STATION_REACH_PX) bot.arriveAtSnackQueueSlot()
    }
  }
}

export function releaseFinishedSnackStations(pathfinder: GridPathfinder, stations: readonly SnackStation[]): void {
  for (const st of stations) {
    if (!st.active) continue
    const s = st.active.state
    if (s === 'walking_to_snack' || s === 'snack_interact') continue
    st.active = null
    st.activeApproach = null
    promoteSnackNextInLine(pathfinder, stations, st)
  }
}

export function repairSnackOrphanQueues(pathfinder: GridPathfinder, stations: readonly SnackStation[]): void {
  if (anySnackApproachOrInteract(stations)) return
  for (const st of stations) {
    if (st.active || st.queue.length === 0) continue
    promoteSnackNextInLine(pathfinder, stations, st)
  }
}

export function assignBotToSnackStation(
  pathfinder: GridPathfinder,
  stations: readonly SnackStation[],
  st: SnackStation,
  bot: BotNirv,
): boolean {
  if (!st.active && st.queue.length === 0 && !anySnackApproachOrInteract(stations)) {
    const approach = resolveStationApproach(pathfinder, st.x, st.y, bot)
    if (!approach) return false
    st.active = bot
    st.activeApproach = approach
    bot.redirectToSnack(st.x, st.y, approach.x, approach.y)
    return true
  }
  const slot = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, st.queue.length)
  if (!slot) return false
  st.queue.push(bot)
  bot.redirectToSnackQueueSlot(slot.x, slot.y)
  return true
}

function promoteSnackNextInLine(
  pathfinder: GridPathfinder,
  stations: readonly SnackStation[],
  st: SnackStation,
): void {
  const next = st.queue.shift()
  if (!next) return
  if (anySnackApproachOrInteract(stations)) {
    st.queue.unshift(next)
    return
  }
  const approach = resolveStationApproach(pathfinder, st.x, st.y, next)
  if (!approach) {
    next.cancelSatiationQueue()
    promoteSnackNextInLine(pathfinder, stations, st)
    return
  }
  st.active = next
  st.activeApproach = approach
  next.redirectToSnack(st.x, st.y, approach.x, approach.y)
  syncSnackQueueSlots(pathfinder, st)
}

function syncSnackQueueSlots(pathfinder: GridPathfinder, st: SnackStation): void {
  const kept: BotNirv[] = []
  for (const bot of st.queue) {
    if (bot.state !== 'waiting_at_snack_queue' && bot.state !== 'walking_to_snack_queue') continue
    const slot = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, kept.length)
    if (!slot) {
      bot.cancelSatiationQueue()
      continue
    }
    bot.redirectToSnackQueueSlot(slot.x, slot.y)
    kept.push(bot)
  }
  st.queue.splice(0, st.queue.length, ...kept)
}
