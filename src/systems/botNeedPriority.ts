import type { BotNirv } from '../entities/BotNirv'
import { CRITICAL_HYDRATION_THRESHOLD } from '../entities/nirvHydration'
import { CRITICAL_SATIATION } from '../entities/nirvHunger'
import { CRITICAL_REST_THRESHOLD } from '../entities/nirvSleep'

export type CriticalNeed = 'bladder' | 'hydration' | 'hunger' | 'rest'

export function topCriticalNeed(bot: BotNirv): CriticalNeed | null {
  const bladder = bot.nirv.getBladderLevel()
  const bladderThreshold = bot.nirv.bladderLevelThreshold
  if (bladder <= 0 || bladder <= bladderThreshold - 10) return 'bladder'
  if (bot.nirv.getHydrationLevel() <= CRITICAL_HYDRATION_THRESHOLD) return 'hydration'
  if (bot.nirv.getSatiation() <= CRITICAL_SATIATION) return 'hunger'
  if (bot.nirv.getRestLevel() <= CRITICAL_REST_THRESHOLD) return 'rest'
  return null
}
