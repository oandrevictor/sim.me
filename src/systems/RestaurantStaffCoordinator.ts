import type { Building } from '../entities/Building'
import type { BotNirv } from '../entities/BotNirv'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { ObjectType } from '../objects/objectTypes'
import type { CookingSystem } from './CookingSystem'
import { RestaurantChefFlow } from './RestaurantChefFlow'
import { RestaurantWaiterFlow } from './RestaurantWaiterFlow'
import type { RestaurantSystem } from './RestaurantSystem'
import type { RestaurantStaffAssignments } from './RestaurantStaffAssignments'
import type { PlateEntry } from '../world/ObjectSpawner'

export class RestaurantStaffCoordinator {
  private readonly chefs: RestaurantChefFlow
  private readonly waiters: RestaurantWaiterFlow

  constructor(
    private readonly buildings: Building[],
    private readonly bots: BotNirv[],
    private readonly assignments: RestaurantStaffAssignments,
    restaurant: RestaurantSystem,
    cooking: CookingSystem,
    pathfinder: GridPathfinder,
    spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => void,
    removePlateEntry: (entry: PlateEntry) => void,
    getPlateEntries: () => PlateEntry[],
  ) {
    this.chefs = new RestaurantChefFlow(restaurant, cooking, pathfinder, spawnObject)
    this.waiters = new RestaurantWaiterFlow(restaurant, pathfinder, spawnObject, removePlateEntry, getPlateEntries)
  }

  releaseAllForBot(bot: BotNirv): void {
    this.chefs.releaseAllForBot(bot)
    this.waiters.releaseAllForBot(bot)
  }

  update(): void {
    for (const building of this.buildings) {
      if (building.type !== 'restaurant') continue
      const staff = this.assignments.get(building.id)
      for (const id of staff.chefBotIds) {
        const bot = this.bots.find(b => b.id === id)
        if (bot) this.chefs.tick(bot, building)
      }
      for (const id of staff.waiterBotIds) {
        const bot = this.bots.find(b => b.id === id)
        if (bot) this.waiters.tick(bot, building)
      }
    }
  }
}
