import type { BotNirv } from '../entities/BotNirv'
import { loadRestaurantStaffRecords, saveRestaurantStaffRecords, type RestaurantStaffRecord } from '../storage/restaurantStaffPersistence'

export interface StaffRolesForBuilding {
  chefBotIds: string[]
  waiterBotIds: string[]
}

/** Per-building chef/waiter picks; persisted by building id. */
export class RestaurantStaffAssignments {
  private byBuilding = new Map<string, StaffRolesForBuilding>()

  constructor() {
    for (const r of loadRestaurantStaffRecords()) {
      this.byBuilding.set(r.buildingId, {
        chefBotIds: dedupe(r.chefBotIds),
        waiterBotIds: dedupe(r.waiterBotIds.filter(id => !r.chefBotIds.includes(id))),
      })
    }
  }

  get(buildingId: string): StaffRolesForBuilding {
    return this.byBuilding.get(buildingId) ?? { chefBotIds: [], waiterBotIds: [] }
  }

  isStaffBot(bot: BotNirv): boolean {
    for (const { chefBotIds, waiterBotIds } of this.byBuilding.values()) {
      if (chefBotIds.includes(bot.id) || waiterBotIds.includes(bot.id)) return true
    }
    return false
  }

  roleForBotInBuilding(botId: string, buildingId: string): 'chef' | 'waiter' | null {
    const s = this.get(buildingId)
    if (s.chefBotIds.includes(botId)) return 'chef'
    if (s.waiterBotIds.includes(botId)) return 'waiter'
    return null
  }

  clearBotEverywhere(botId: string): void {
    let changed = false
    for (const [buildingId, cur] of this.byBuilding.entries()) {
      const chefBotIds = cur.chefBotIds.filter(id => id !== botId)
      const waiterBotIds = cur.waiterBotIds.filter(id => id !== botId)
      if (chefBotIds.length === cur.chefBotIds.length && waiterBotIds.length === cur.waiterBotIds.length) continue
      this.byBuilding.set(buildingId, { chefBotIds, waiterBotIds })
      changed = true
    }
    if (changed) this.persist()
  }

  /** Returns false if over cap or duplicate role across buildings is fine — caller clamps. */
  setRole(
    buildingId: string,
    botId: string,
    role: 'none' | 'chef' | 'waiter',
    maxChefs: number,
    maxWaiters: number,
  ): void {
    const cur = this.get(buildingId)
    const chefs = cur.chefBotIds.filter(id => id !== botId)
    const waiters = cur.waiterBotIds.filter(id => id !== botId)
    if (role === 'chef') {
      chefs.push(botId)
      if (chefs.length > maxChefs) chefs.length = maxChefs
    } else if (role === 'waiter') {
      waiters.push(botId)
      if (waiters.length > maxWaiters) waiters.length = maxWaiters
    }
    this.byBuilding.set(buildingId, {
      chefBotIds: dedupe(chefs),
      waiterBotIds: dedupe(waiters.filter(id => !chefs.includes(id))),
    })
    this.persist()
  }

  /** Drop unknown ids and enforce caps (furniture changed). */
  clampToCaps(
    buildingId: string,
    maxChefs: number,
    maxWaiters: number,
    validBotIds: Set<string>,
  ): void {
    const cur = this.get(buildingId)
    const chefs = cur.chefBotIds.filter(id => validBotIds.has(id)).slice(0, maxChefs)
    const waiters = cur.waiterBotIds
      .filter(id => validBotIds.has(id) && !chefs.includes(id))
      .slice(0, maxWaiters)
    this.byBuilding.set(buildingId, { chefBotIds: chefs, waiterBotIds: waiters })
    this.persist()
  }

  private persist(): void {
    const records: RestaurantStaffRecord[] = [...this.byBuilding.entries()].map(([buildingId, v]) => ({
      buildingId,
      chefBotIds: [...v.chefBotIds],
      waiterBotIds: [...v.waiterBotIds],
    }))
    saveRestaurantStaffRecords(records)
  }
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)]
}
