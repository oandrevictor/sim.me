import type { BotNirv } from '../entities/BotNirv'
import type { WorldClock } from './WorldClock'
import type { RestaurantStaffAssignments } from './RestaurantStaffAssignments'
import type { FarmingSystem } from './FarmingSystem'
import type { StockSystem } from './StockSystem'
import {
  SCHEDULE_TEMPLATES,
  applyJitter,
  overlayRoleWork,
  findActivity,
  type ScheduleActivity,
  type ScheduleBlock,
  type WorkRole,
} from '../data/dailySchedules'

export type { ScheduleActivity } from '../data/dailySchedules'

interface CachedSchedule {
  signature: string
  blocks: ScheduleBlock[]
}

export class ScheduleSystem {
  private cache = new Map<string, CachedSchedule>()

  constructor(
    private readonly clock: WorldClock,
    private readonly staffAssignments: RestaurantStaffAssignments,
    private readonly farming: FarmingSystem,
    private readonly stock: StockSystem,
  ) {}

  getActivity(bot: BotNirv): ScheduleActivity {
    const blocks = this.getBlocks(bot)
    return findActivity(blocks, this.clock.getMinuteOfDay())
  }

  isOnShift(bot: BotNirv): boolean { return this.getActivity(bot) === 'work' }
  isSleepWindow(bot: BotNirv): boolean { return this.getActivity(bot) === 'sleep' }
  isMealWindow(bot: BotNirv): boolean { return this.getActivity(bot) === 'meal' }
  isHomeWindow(bot: BotNirv): boolean { return this.getActivity(bot) === 'home' }

  private getBlocks(bot: BotNirv): ScheduleBlock[] {
    const roles = this.collectRoles(bot)
    const sig = `${bot.profession}|${roles.join(',')}`
    const cached = this.cache.get(bot.id)
    if (cached && cached.signature === sig) return cached.blocks
    const template = SCHEDULE_TEMPLATES[bot.profession] ?? SCHEDULE_TEMPLATES.none
    const jittered = applyJitter(template, bot.id)
    const blocks = overlayRoleWork(jittered, roles)
    this.cache.set(bot.id, { signature: sig, blocks })
    return blocks
  }

  private collectRoles(bot: BotNirv): WorkRole[] {
    const roles: WorkRole[] = []
    const restaurantRole = this.staffAssignments.roleForBot(bot.id)
    if (restaurantRole) roles.push(restaurantRole)
    if (this.farming.isFarmerBot(bot)) roles.push('farmer')
    if (this.stock.isStockerBot(bot)) roles.push('stocker')
    return roles
  }
}
