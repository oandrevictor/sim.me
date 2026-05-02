import type { Building } from '../entities/Building'
import { isRestaurantStaffState, type BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { ObjectType } from '../objects/objectTypes'
import type { CookingSystem } from './CookingSystem'
import { RestaurantChefFlow } from './RestaurantChefFlow'
import { RestaurantWaiterFlow } from './RestaurantWaiterFlow'
import type { RestaurantSystem } from './RestaurantSystem'
import type { RestaurantStaffAssignments } from './RestaurantStaffAssignments'
import type { PlateEntry } from '../world/ObjectSpawner'
import { topCriticalNeed } from './botNeedPriority'

export class RestaurantStaffCoordinator {
  private readonly chefs: RestaurantChefFlow
  private readonly waiters: RestaurantWaiterFlow
  private readonly waiterBuildings = new Map<string, Building>()
  private schedule: import('./ScheduleSystem').ScheduleSystem | null = null

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void { this.schedule = s }

  constructor(
    private readonly buildings: Building[],
    private readonly bots: BotNirv[],
    private readonly assignments: RestaurantStaffAssignments,
    restaurant: RestaurantSystem,
    cooking: CookingSystem,
    pathfinder: GridPathfinder,
    spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => boolean,
    removePlateEntry: (entry: PlateEntry) => void,
    getPlateEntries: () => PlateEntry[],
  ) {
    this.chefs = new RestaurantChefFlow(restaurant, cooking, pathfinder, spawnObject)
    this.waiters = new RestaurantWaiterFlow(restaurant, pathfinder, spawnObject, removePlateEntry, getPlateEntries)
  }

  private shouldSkipWork(bot: BotNirv): boolean {
    if (topCriticalNeed(bot)) {
      this.releaseAllForBot(bot)
      bot.abortWorkDuty()
      return true
    }
    if (!this.schedule) return false
    if (this.schedule.isOnShift(bot)) return false
    if (isRestaurantStaffState(bot.state)) {
      this.releaseAllForBot(bot)
      bot.abortWorkDuty()
    }
    return true
  }

  releaseAllForBot(bot: BotNirv): void {
    this.chefs.releaseAllForBot(bot)
    this.waiters.releaseAllForBot(bot, this.waiterBuildings.get(bot.id) ?? null)
  }

  update(): void {
    const activeWaiters = new Set<string>()
    for (const building of this.buildings) {
      if (building.type !== 'restaurant') continue
      for (const id of this.assignments.get(building.id).waiterBotIds) activeWaiters.add(id)
    }
    for (const [id, building] of this.waiterBuildings) {
      if (activeWaiters.has(id)) continue
      const bot = this.bots.find(b => b.id === id)
      if (bot) this.waiters.releaseAllForBot(bot, building)
      this.waiterBuildings.delete(id)
    }
    for (const building of this.buildings) {
      if (building.type !== 'restaurant') continue
      const staff = this.assignments.get(building.id)
      for (const id of staff.chefBotIds) {
        const bot = this.bots.find(b => b.id === id)
        if (!bot) continue
        if (this.shouldSkipWork(bot)) continue
        this.chefs.tick(bot, building)
      }
      for (const id of staff.waiterBotIds) {
        const bot = this.bots.find(b => b.id === id)
        if (!bot) continue
        const previous = this.waiterBuildings.get(bot.id)
        if (previous && previous !== building) this.waiters.releaseAllForBot(bot, previous)
        this.waiterBuildings.set(bot.id, building)
        if (this.shouldSkipWork(bot)) continue
        this.waiters.tick(bot, building)
      }
    }
  }
}
