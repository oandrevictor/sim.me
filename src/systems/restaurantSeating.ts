import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import type { ChairRecord } from './restaurantTypes'
import type { RestaurantReservations } from './RestaurantReservations'
import { actorInsideObjectBuilding } from '../world/buildingInteractionAccess'

const ENTER_PROBABILITY = 0.4

export function checkArrivals(chairs: ChairRecord[], buildings: readonly Building[]): void {
  for (const chair of chairs) {
    if (!chair.occupiedBy) continue
    const bot = chair.occupiedBy
    if (bot.state !== 'walking_to_chair') continue
    if (!actorInsideObjectBuilding(buildings, bot.nirv.sprite.x, bot.nirv.sprite.y, chair.x, chair.y)) continue
    const dist = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, chair.x, chair.y)
    if (dist < 32) bot.seat(chair.nextToTable)
  }
}

export function tryAssignRestaurantBots(
  chairs: ChairRecord[],
  buildings: Building[],
  bots: BotNirv[],
  staffBotFilter: (bot: BotNirv) => boolean,
  pairSocialBias?: (idA: string, idB: string) => number,
  onCompanionExposure?: (subjectId: string, otherId: string, weight: number) => void,
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

    const chair = nearestChair(bot, availableChairs, chairs, pairSocialBias, onCompanionExposure)
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

function nearestChair(
  bot: BotNirv,
  chairs: ChairRecord[],
  allChairs: ChairRecord[],
  pairSocialBias?: (idA: string, idB: string) => number,
  onCompanionExposure?: (subjectId: string, otherId: string, weight: number) => void,
): ChairRecord | null {
  let best: ChairRecord | null = null
  let bestScore = -Infinity
  for (const chair of chairs) {
    const dist = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, chair.x, chair.y)
    if (dist < TILE_W * 15) {
      const distanceScore = 1 - dist / (TILE_W * 15)
      const socialScore = seatCompanionScore(bot, chair, allChairs, pairSocialBias, onCompanionExposure)
      const score = distanceScore + socialScore
      if (score > bestScore) {
        bestScore = score
        best = chair
      }
    }
  }
  return best
}

function seatCompanionScore(
  bot: BotNirv,
  candidate: ChairRecord,
  allChairs: ChairRecord[],
  pairSocialBias?: (idA: string, idB: string) => number,
  onCompanionExposure?: (subjectId: string, otherId: string, weight: number) => void,
): number {
  if (!pairSocialBias) return 0
  let score = 0
  for (const chair of allChairs) {
    const sitter = chair.occupiedBy
    if (!sitter || sitter.id === bot.id) continue
    const dist = Phaser.Math.Distance.Between(candidate.x, candidate.y, chair.x, chair.y)
    if (dist > TILE_W * 3) continue
    onCompanionExposure?.(bot.id, sitter.id, 0.1)
    const context = dist < TILE_W * 1.5 ? 1 : 0.6
    score += pairSocialBias(bot.id, sitter.id) * context * 0.3
  }
  return Phaser.Math.Clamp(score, -0.6, 0.8)
}
