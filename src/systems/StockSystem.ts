import type { BotNirv } from '../entities/BotNirv'
import { loadFarmRecord, saveStockerBotIds, spendCorn } from '../storage/farmPersistence'
import { foodStockLabel, type FoodStockStation, type StockWorkView } from './foodStockTypes'
import { StockerJobRuntime } from './StockerJobRuntime'

export class StockSystem {
  private readonly stockerBotIds = new Set<string>()
  private readonly jobs: StockerJobRuntime

  constructor(
    private readonly bots: BotNirv[],
    private readonly getStations: () => FoodStockStation[],
    private readonly setStationStock: (station: FoodStockStation, stock: number) => void,
  ) {
    for (const id of loadFarmRecord().stockerBotIds) this.stockerBotIds.add(id)
    this.jobs = new StockerJobRuntime(
      bots,
      getStations,
      () => this.stockerBotIds,
      () => loadFarmRecord().cornCount,
      station => this.restockStation(station),
    )
  }

  update(delta: number): void {
    this.jobs.update(delta)
  }

  getStockWorkView(): StockWorkView {
    return {
      totalStations: this.getStations().length,
      cornCount: loadFarmRecord().cornCount,
      stockerBotIds: [...this.stockerBotIds],
      bots: this.bots,
      stations: this.getStations().map(station => ({
        type: station.type,
        label: foodStockLabel(station.type),
        stock: station.stock,
        maxStock: station.maxStock,
      })),
    }
  }

  setStockerAssigned(botId: string, assigned: boolean): void {
    if (assigned) this.stockerBotIds.add(botId)
    else {
      this.stockerBotIds.delete(botId)
      const bot = this.bots.find(b => b.id === botId)
      if (bot) {
        bot.abortStockerDuty()
        this.jobs.releaseAllForBot(bot)
      }
      for (const station of this.getStations()) {
        if (station.reservedByStockerBotId === botId) station.reservedByStockerBotId = null
      }
    }
    saveStockerBotIds([...this.stockerBotIds])
  }

  isStockerBot(bot: BotNirv): boolean {
    return this.stockerBotIds.has(bot.id)
  }

  releaseAllForBot(bot: BotNirv): void {
    this.jobs.releaseAllForBot(bot)
  }

  private restockStation(station: FoodStockStation): number {
    const missing = station.maxStock - station.stock
    if (missing <= 0) return 0
    const spent = spendCorn(missing)
    if (spent > 0) this.setStationStock(station, station.stock + spent)
    return spent
  }
}
