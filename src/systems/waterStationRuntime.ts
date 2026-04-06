import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { queueSlotBehindStation } from './waterQueueLayout'

const STATION_REACH_PX = 32

export interface WaterStation {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  active: BotNirv | null
  queue: BotNirv[]
}

export function findWaterStationForBot(
  stations: readonly WaterStation[],
  bot: BotNirv,
): WaterStation | null {
  return stations.find(st => st.active === bot || st.queue.includes(bot)) ?? null
}

export function checkWaterTapArrivals(stations: readonly WaterStation[]): void {
  for (const st of stations) {
    if (!st.active || st.active.state !== 'walking_to_water') continue
    const d = Phaser.Math.Distance.Between(st.active.nirv.sprite.x, st.active.nirv.sprite.y, st.x, st.y)
    if (d < STATION_REACH_PX) st.active.arriveAtWaterStation()
  }
}

export function checkWaterQueueSlotArrivals(
  pathfinder: GridPathfinder,
  stations: readonly WaterStation[],
): void {
  for (const st of stations) {
    st.queue.forEach((bot, lineIndex) => {
      if (bot.state !== 'walking_to_water_queue') return
      const slot = queueSlotBehindStation(pathfinder, st.x, st.y, lineIndex)
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, slot.x, slot.y)
      if (d < STATION_REACH_PX) bot.arriveAtWaterQueueSlot()
    })
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
    st.active = null
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
  st.active = next
  next.redirectToWater(st.x, st.y)
  syncQueueSlots(pathfinder, st)
}

function syncQueueSlots(pathfinder: GridPathfinder, st: WaterStation): void {
  st.queue.forEach((bot, i) => {
    if (bot.state !== 'waiting_at_water_queue' && bot.state !== 'walking_to_water_queue') return
    const p = queueSlotBehindStation(pathfinder, st.x, st.y, i)
    bot.redirectToWaterQueueSlot(p.x, p.y)
  })
}
