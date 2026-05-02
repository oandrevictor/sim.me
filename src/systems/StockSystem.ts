import type { BotNirv } from '../entities/BotNirv'
import { loadFarmRecord, saveStockerBotIds, spendAnyCrop, totalCropCount } from '../storage/farmPersistence'
import { foodStockLabel, type FoodStockStation, type StockWorkView } from './foodStockTypes'
import { StockerJobRuntime } from './StockerJobRuntime'

export class StockSystem {
  private readonly stockerBotIds = new Set<string>()
  private readonly jobs: StockerJobRuntime

  constructor(
    private readonly bots: BotNirv[],
    private readonly getStations: () => FoodStockStation[],
    private readonly setStationStock: (station: FoodStockStation, stock: number) => void,
    private readonly canBotUseStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canBotInteractWithStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
  ) {
    for (const id of loadFarmRecord().stockerBotIds) this.stockerBotIds.add(id)
    this.jobs = new StockerJobRuntime(
      bots,
      getStations,
      () => this.stockerBotIds,
      () => totalCropCount(),
      station => this.restockStation(station),
      this.canBotUseStation,
      this.canBotInteractWithStation,
    )
  }

  update(delta: number): void {
    this.jobs.update(delta)
  }

  getStockWorkView(): StockWorkView {
    const farmRecord = loadFarmRecord()
    return {
      totalStations: this.getStations().length,
      foodCount: totalCropCount(farmRecord),
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

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void {
    this.jobs.setSchedule(s)
  }

  releaseAllForBot(bot: BotNirv): void {
    this.jobs.releaseAllForBot(bot)
  }

  private restockStation(station: FoodStockStation): number {
    const missing = station.maxStock - station.stock
    if (missing <= 0) return 0
    const spent = spendAnyCrop(missing)
    if (spent > 0) this.setStationStock(station, station.stock + spent)
    return spent
  }
}
