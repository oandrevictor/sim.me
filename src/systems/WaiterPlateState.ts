import type { ObjectType } from '../objects/objectTypes'
import type { CounterRecord, RestaurantSystem } from './RestaurantSystem'

type CounterTarget = { x: number; y: number }

export class WaiterPlateState {
  private carried = new Map<string, string>()
  private returnCounters = new Map<string, CounterTarget>()
  private idleTargets = new Map<string, CounterTarget>()

  constructor(
    private readonly restaurant: RestaurantSystem,
    private readonly spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => boolean,
  ) {}

  getCarried(botId: string): string | null {
    return this.carried.get(botId) ?? null
  }

  setCarried(botId: string, recipeId: string | null): void {
    if (recipeId) this.carried.set(botId, recipeId)
    else this.carried.delete(botId)
  }

  setIdleTarget(botId: string, target: CounterTarget): void {
    this.idleTargets.set(botId, target)
  }

  getIdleTarget(botId: string): CounterTarget | null {
    return this.idleTargets.get(botId) ?? null
  }

  clearIdleTarget(botId: string): void {
    this.idleTargets.delete(botId)
  }

  clearReturnCounter(botId: string): void {
    this.returnCounters.delete(botId)
  }

  releaseAllForBot(
    botId: string,
    buildingId: string | null,
    canUseCounter: (c: CounterRecord) => boolean,
  ): void {
    this.clearIdleTarget(botId)
    if (buildingId) this.tryRestage(botId, buildingId, canUseCounter)
    if (!this.getCarried(botId)) this.returnCounters.delete(botId)
  }

  ensureReturnCounter(
    buildingId: string,
    botId: string,
    canUse: (c: CounterRecord) => boolean,
  ): CounterTarget | null {
    const current = this.returnCounters.get(botId)
    if (current && this.restaurant.canPlaceOnReservedCounter(botId, current.x, current.y)) return current
    const counter = this.restaurant.reserveReturnCounter(buildingId, botId, canUse)
    if (!counter) {
      this.returnCounters.delete(botId)
      return null
    }
    const target = { x: counter.x, y: counter.y }
    this.returnCounters.set(botId, target)
    return target
  }

  tryPlaceOnReturnCounter(botId: string, target: CounterTarget): boolean {
    const recipeId = this.getCarried(botId)
    if (!recipeId) return true
    if (!this.restaurant.canPlaceOnReservedCounter(botId, target.x, target.y)) return false
    if (!this.spawnObject('food_plate', target.x, target.y, true, recipeId)) return false
    this.setCarried(botId, null)
    this.returnCounters.delete(botId)
    this.restaurant.releaseCounterReservationForBot(botId)
    return true
  }

  private tryRestage(
    botId: string,
    buildingId: string,
    canUseCounter: (c: CounterRecord) => boolean,
  ): boolean {
    const target = this.ensureReturnCounter(buildingId, botId, canUseCounter)
    return !!target && this.tryPlaceOnReturnCounter(botId, target)
  }
}
