import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import type { ChairRecord } from './restaurantTypes'
import type { RestaurantReservations } from './RestaurantReservations'

const ENTER_PROBABILITY = 0.4

export function checkArrivals(chairs: ChairRecord[]): void {
  for (const chair of chairs) {
    if (!chair.occupiedBy) continue
    const bot = chair.occupiedBy
    if (bot.state !== 'walking_to_chair') continue
    const dist = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, chair.x, chair.y)
    if (dist < 32) bot.seat(chair.nextToTable)
  }
}

export function tryAssignRestaurantBots(
  chairs: ChairRecord[],
  buildings: Building[],
  bots: BotNirv[],
  staffBotFilter: (bot: BotNirv) => boolean,
): void {
  const availableChairs = chairs.filter(c => {
    if (c.occupiedBy || !c.buildingId) return false
    const building = buildings.find(b => b.id === c.buildingId)
    return building && building.type === 'restaurant'
  })
  if (availableChairs.length === 0) return

  for (const bot of bots) {
    if (staffBotFilter(bot) || bot.state !== 'waiting') continue
    if (bot.nirv.getHydrationLevel() <= 60) continue
    if (bot.nirv.getSatiation() <= bot.nirv.hungerThreshold) continue
    if (bot.nirv.getFunLevel() <= bot.nirv.getFunThreshold()) continue
    if (Math.random() > ENTER_PROBABILITY) continue

    const chair = nearestChair(bot, availableChairs)
    if (!chair) continue
    chair.occupiedBy = bot
    bot.redirectToChair(chair.x, chair.y)
    availableChairs.splice(availableChairs.indexOf(chair), 1)
  }
}

export function cleanupUnseated(chairs: ChairRecord[], reservations: RestaurantReservations): void {
  for (const chair of chairs) {
    if (!chair.occupiedBy) continue
    const bot = chair.occupiedBy
    if (bot.state !== 'walking' && bot.state !== 'waiting') continue
    reservations.releaseForChair(chair)
    chair.occupiedBy = null
  }
}

export function releaseChairForBot(
  chairs: ChairRecord[],
  reservations: RestaurantReservations,
  bot: BotNirv,
): void {
  for (const chair of chairs) {
    if (chair.occupiedBy !== bot) continue
    reservations.releaseForChair(chair)
    chair.occupiedBy = null
  }
}

function nearestChair(bot: BotNirv, chairs: ChairRecord[]): ChairRecord | null {
  let best: ChairRecord | null = null
  let bestDist = Infinity
  for (const chair of chairs) {
    const dist = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, chair.x, chair.y)
    if (dist < TILE_W * 15 && dist < bestDist) {
      bestDist = dist
      best = chair
    }
  }
  return best
}
