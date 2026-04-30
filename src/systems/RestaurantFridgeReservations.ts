import type { FoodStockStation } from './foodStockTypes'

export class RestaurantFridgeReservations {
  private readonly targets = new Map<string, FoodStockStation>()
  private readonly reservations = new Map<FoodStockStation, Set<string>>()

  getTarget(botId: string): FoodStockStation | null {
    return this.targets.get(botId) ?? null
  }

  reserve(fridge: FoodStockStation, botId: string): void {
    this.release(botId)
    const set = this.reservations.get(fridge) ?? new Set<string>()
    set.add(botId)
    this.reservations.set(fridge, set)
    this.targets.set(botId, fridge)
  }

  release(botId: string): void {
    const fridge = this.targets.get(botId)
    if (!fridge) return
    const set = this.reservations.get(fridge)
    set?.delete(botId)
    if (set?.size === 0) this.reservations.delete(fridge)
    this.targets.delete(botId)
  }

  availableStock(fridge: FoodStockStation): number {
    return fridge.stock - (this.reservations.get(fridge)?.size ?? 0)
  }
}
