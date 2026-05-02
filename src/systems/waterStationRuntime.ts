import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import {
  resolveReachableQueueSlot,
  resolveStationApproach,
  type StationApproach,
} from './stationApproach'
import { logBotStation } from '../debug/stationDebug'

const STATION_REACH_PX = 32
export type WaterApproach = StationApproach

export interface WaterStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  active: BotNirv | null
  activeApproach: WaterApproach | null
  queue: BotNirv[]
}

export function findWaterStationForBot(
  stations: readonly WaterStation[],
  bot: BotNirv,
): WaterStation | null {
  return stations.find(st => st.active === bot || st.queue.includes(bot)) ?? null
}

export function resolveWaterStationApproach(
  pathfinder: GridPathfinder,
  st: WaterStation,
  bot: BotNirv,
): WaterApproach | null {
  return resolveStationApproach(pathfinder, st.x, st.y, bot)
}

export function checkWaterTapArrivals(stations: readonly WaterStation[]): void {
  for (const st of stations) {
    if (!st.active || st.active.state !== 'walking_to_water') continue
    if (!st.activeApproach) continue
    const d = Phaser.Math.Distance.Between(
      st.active.nirv.sprite.x,
      st.active.nirv.sprite.y,
      st.activeApproach.x,
      st.activeApproach.y,
    )
    if (d < STATION_REACH_PX) {
      logBotStation('interaction.water_start', st.active, 'drinking_water', st.x, st.y, 'arrived', 'info')
      st.active.arriveAtWaterStation()
    }
  }
}

export function checkWaterTapArrivalsWithAccess(
  pathfinder: GridPathfinder,
  stations: readonly WaterStation[],
  canInteract: (bot: BotNirv, x: number, y: number) => boolean,
): void {
  for (const st of stations) {
    if (!st.active || st.active.state !== 'walking_to_water') continue
    if (!canInteract(st.active, st.x, st.y)) continue
    st.activeApproach ??= resolveWaterStationApproach(pathfinder, st, st.active)
    if (!st.activeApproach) continue
    const d = Phaser.Math.Distance.Between(
      st.active.nirv.sprite.x,
      st.active.nirv.sprite.y,
      st.activeApproach.x,
      st.activeApproach.y,
    )
    if (d < STATION_REACH_PX) st.active.arriveAtWaterStation()
  }
}

export function checkWaterQueueSlotArrivals(
  pathfinder: GridPathfinder,
  stations: readonly WaterStation[],
): void {
  for (const st of stations) {
    for (let lineIndex = st.queue.length - 1; lineIndex >= 0; lineIndex--) {
      const bot = st.queue[lineIndex]!
      if (bot.state !== 'walking_to_water_queue') continue
      const slot = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, lineIndex)
      if (!slot) {
        st.queue.splice(lineIndex, 1)
        bot.cancelWaterQueue()
        continue
      }
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
      if (d < STATION_REACH_PX) {
        logBotStation('interaction.queue_arrived', bot, 'drinking_water', st.x, st.y, 'water_queue', 'debug', { queueIndex: lineIndex })
        bot.arriveAtWaterQueueSlot()
      }
    }
  }
}

export function releaseFinishedWaterStations(
  pathfinder: GridPathfinder,
  stations: readonly WaterStation[],
): void {
  for (const st of stations) {
    if (!st.active) continue
    const s = st.active.state
    if (s === 'walking_to_water' || s === 'drinking_water') continue
    logBotStation('interaction.water_finish', st.active, 'drinking_water', st.x, st.y, 'released', 'info')
    st.active = null
    st.activeApproach = null
    promoteNextInLine(pathfinder, st)
  }
}

export function repairOrphanWaterQueues(
  pathfinder: GridPathfinder,
  stations: readonly WaterStation[],
): void {
  for (const st of stations) {
    if (st.active || st.queue.length === 0) continue
    promoteNextInLine(pathfinder, st)
  }
}

function promoteNextInLine(pathfinder: GridPathfinder, st: WaterStation): void {
  const next = st.queue.shift()
  if (!next) return
  const approach = resolveWaterStationApproach(pathfinder, st, next)
  if (!approach) {
    logBotStation('interaction.object_blocked', next, 'drinking_water', st.x, st.y, 'no_water_approach', 'warn')
    next.cancelWaterQueue()
    promoteNextInLine(pathfinder, st)
    return
  }
  st.active = next
  st.activeApproach = approach
  logBotStation('interaction.queue_promoted', next, 'drinking_water', st.x, st.y, 'water_queue', 'debug')
  next.redirectToWater(approach.x, approach.y)
  syncQueueSlots(pathfinder, st)
}

function syncQueueSlots(pathfinder: GridPathfinder, st: WaterStation): void {
  const kept: BotNirv[] = []
  for (const bot of st.queue) {
    if (bot.state !== 'waiting_at_water_queue' && bot.state !== 'walking_to_water_queue') continue
    const p = resolveReachableQueueSlot(pathfinder, st.x, st.y, bot, kept.length)
    if (!p) {
      logBotStation('interaction.object_blocked', bot, 'drinking_water', st.x, st.y, 'no_water_queue_slot', 'warn')
      bot.cancelWaterQueue()
      continue
    }
    bot.redirectToWaterQueueSlot(p.x, p.y)
    kept.push(bot)
  }
  st.queue.splice(0, st.queue.length, ...kept)
}
