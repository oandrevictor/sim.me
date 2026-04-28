import type { BotNirv } from '../entities/BotNirv'

export type WorkContext = 'stage' | 'restaurant' | 'farm'

export interface RestaurantStaffUiView {
  buildingId: string
  maxChefs: number
  maxWaiters: number
  stoves: number
  counters: number
  tables: number
  chefIds: string[]
  waiterIds: string[]
  bots: BotNirv[]
}

export interface RestaurantStaffBridge {
  getStaffView: () => RestaurantStaffUiView | null
  setStaffRole: (buildingId: string, botId: string, role: 'none' | 'chef' | 'waiter') => void
}
