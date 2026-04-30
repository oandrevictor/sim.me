import Phaser from 'phaser'
import { isStockerState, type BotNirv, type BotState } from '../entities/BotNirv'
import { stockerApproachPoint, type FoodStockStation } from './foodStockTypes'

const STOCKER_REACH_PX = 64
const RESTOCK_MS = 3500

interface StockerTask {
  station: FoodStockStation
  remainingMs: number
}

export class StockerJobRuntime {
  private tasks = new Map<string, StockerTask>()

  constructor(
    private readonly bots: BotNirv[],
    private readonly getStations: () => FoodStockStation[],
    private readonly getStockerIds: () => Set<string>,
    private readonly getCornCount: () => number,
    private readonly restock: (station: FoodStockStation) => number,
  ) {}

  update(delta: number): void {
    this.cleanupStaleReservations()
    for (const botId of this.getStockerIds()) {
      const bot = this.bots.find(b => b.id === botId)
      if (!bot) continue
      if (!isStockerState(bot.state)) {
        if (!canStartStockerWork(bot.state)) continue
        bot.enterStockerIdle()
      }
      if (bot.state === 'stocker_idle') this.assignTask(bot)
      else if (bot.state === 'stocker_to_station') this.tickWalk(bot)
      else if (bot.state === 'stocker_restocking') this.tickRestock(bot, delta)
    }
  }

  releaseAllForBot(bot: BotNirv): void {
    this.releaseTask(bot.id)
  }

  private assignTask(bot: BotNirv): void {
    if (this.getCornCount() <= 0) return
    const station = this.pickStation(bot)
    if (!station) return
    station.reservedByStockerBotId = bot.id
    this.tasks.set(bot.id, { station, remainingMs: 0 })
    const p = stockerApproachPoint(station)
    bot.enterStockerWalkToStation(p.x, p.y)
  }

  private tickWalk(bot: BotNirv): void {
    const task = this.tasks.get(bot.id)
    if (!task || !this.taskStillValid(task, bot.id)) {
      this.releaseTask(bot.id)
      bot.enterStockerIdle()
      return
    }
    const p = stockerApproachPoint(task.station)
    const dist = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, p.x, p.y)
    if (dist > STOCKER_REACH_PX) return
    task.remainingMs = RESTOCK_MS
    bot.enterStockerRestocking()
  }

  private tickRestock(bot: BotNirv, delta: number): void {
    const task = this.tasks.get(bot.id)
    if (!task || !this.taskStillValid(task, bot.id)) {
      this.releaseTask(bot.id)
      bot.enterStockerIdle()
      return
    }
    task.remainingMs -= delta
    if (task.remainingMs > 0) return
    this.restock(task.station)
    this.releaseTask(bot.id)
    bot.enterStockerIdle()
  }

  private pickStation(bot: BotNirv): FoodStockStation | null {
    const stations = this.getStations().filter(s => s.stock < s.maxStock && !s.reservedByStockerBotId)
    stations.sort((a, b) => {
      const fillA = a.stock / a.maxStock
      const fillB = b.stock / b.maxStock
      if (fillA !== fillB) return fillA - fillB
      return this.distanceToBot(bot, a) - this.distanceToBot(bot, b)
    })
    return stations[0] ?? null
  }

  private taskStillValid(task: StockerTask, botId: string): boolean {
    if (!this.getStations().includes(task.station)) return false
    if (task.station.reservedByStockerBotId !== botId) return false
    return task.station.stock < task.station.maxStock && this.getCornCount() > 0
  }

  private cleanupStaleReservations(): void {
    const stockerIds = this.getStockerIds()
    for (const station of this.getStations()) {
      const botId = station.reservedByStockerBotId
      if (!botId) continue
      const task = this.tasks.get(botId)
      if (!stockerIds.has(botId) || !task || task.station !== station) {
        station.reservedByStockerBotId = null
      }
    }
    for (const [botId, task] of this.tasks) {
      if (!stockerIds.has(botId) || task.station.reservedByStockerBotId !== botId) {
        this.releaseTask(botId)
      }
    }
  }

  private releaseTask(botId: string): void {
    const task = this.tasks.get(botId)
    if (task?.station.reservedByStockerBotId === botId) task.station.reservedByStockerBotId = null
    this.tasks.delete(botId)
  }

  private distanceToBot(bot: BotNirv, station: FoodStockStation): number {
    return Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, station.x, station.y)
  }
}

function canStartStockerWork(state: BotState): boolean {
  return state === 'walking' || state === 'waiting'
}
