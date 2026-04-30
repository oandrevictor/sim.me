import Phaser from 'phaser'
import type { BotNirv, BotState } from '../entities/BotNirv'
import { isFarmerState } from '../entities/BotNirv'
import { CORN_SEED } from '../data/crops'
import { cropApproachPoint, type CropPlot } from './farmingTypes'

const FARMER_REACH_PX = 64
const FARMER_WORK_MS = 1600

type CropAction = 'plant' | 'harvest'

interface FarmerTask {
  plot: CropPlot
  action: CropAction
  remainingMs: number
}

export class FarmerJobRuntime {
  private tasks = new Map<string, FarmerTask>()

  constructor(
    private readonly bots: BotNirv[],
    private readonly getPlots: () => CropPlot[],
    private readonly getFarmerIds: () => Set<string>,
    private readonly plant: (plot: CropPlot, seed: typeof CORN_SEED) => void,
    private readonly harvest: (plot: CropPlot) => void,
  ) {}

  update(delta: number): void {
    this.cleanupStaleReservations()
    for (const botId of this.getFarmerIds()) {
      const bot = this.bots.find(b => b.id === botId)
      if (!bot) continue
      if (!isFarmerState(bot.state)) {
        if (!canStartFarmerWork(bot.state)) continue
        bot.enterFarmerIdle()
      }
      if (bot.state === 'farmer_idle') this.assignTask(bot)
      else if (bot.state === 'farmer_to_crop') this.tickWalk(bot)
      else if (bot.state === 'farmer_working') this.tickWork(bot, delta)
    }
  }

  releaseAllForBot(bot: BotNirv): void {
    this.releaseTask(bot.id)
  }

  private assignTask(bot: BotNirv): void {
    const task = this.pickTask(bot)
    if (!task) return
    task.plot.reservedBy = bot.id
    this.tasks.set(bot.id, task)
    const p = cropApproachPoint(task.plot.x, task.plot.y)
    bot.enterFarmerWalkToCrop(p.x, p.y)
  }

  private tickWalk(bot: BotNirv): void {
    const task = this.tasks.get(bot.id)
    if (!task || !this.taskStillValid(task)) {
      this.releaseTask(bot.id)
      bot.enterFarmerIdle()
      return
    }
    const sprite = bot.nirv.sprite
    const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, task.plot.x, task.plot.y)
    if (dist > FARMER_REACH_PX) return
    task.remainingMs = FARMER_WORK_MS
    bot.enterFarmerWorking()
  }

  private tickWork(bot: BotNirv, delta: number): void {
    const task = this.tasks.get(bot.id)
    if (!task || !this.taskStillValid(task)) {
      this.releaseTask(bot.id)
      bot.enterFarmerIdle()
      return
    }
    task.remainingMs -= delta
    if (task.remainingMs > 0) return
    if (task.action === 'harvest') this.harvest(task.plot)
    else this.plant(task.plot, CORN_SEED)
    this.releaseTask(bot.id)
    bot.enterFarmerIdle()
  }

  private pickTask(bot: BotNirv): FarmerTask | null {
    const plots = this.getPlots()
    const candidates = [
      ...plots.filter(p => p.stage === 'ready' && !p.reservedBy),
      ...plots.filter(p => p.stage === 'empty' && !p.reservedBy),
    ]
    candidates.sort((a, b) => this.distanceToBot(bot, a) - this.distanceToBot(bot, b))
    const plot = candidates[0]
    if (!plot) return null
    const action = plot.stage === 'ready' ? 'harvest' : 'plant'
    return { plot, action, remainingMs: 0 }
  }

  private taskStillValid(task: FarmerTask): boolean {
    if (!this.getPlots().includes(task.plot)) return false
    if (task.action === 'plant') return task.plot.stage === 'empty'
    return task.plot.stage === 'ready'
  }

  private cleanupStaleReservations(): void {
    const farmerIds = this.getFarmerIds()
    for (const plot of this.getPlots()) {
      const botId = plot.reservedBy
      if (!botId) continue
      const task = this.tasks.get(botId)
      // Reservations must be backed by an active task for that same plot.
      if (!farmerIds.has(botId) || !task || task.plot !== plot) plot.reservedBy = null
    }
    for (const [botId, task] of this.tasks) {
      // Task owner lost farmer role or task now points at a stale plot reference.
      if (!farmerIds.has(botId) || task.plot.reservedBy !== botId) this.releaseTask(botId)
    }
  }

  releaseTask(botId: string): void {
    const task = this.tasks.get(botId)
    if (task && task.plot.reservedBy === botId) task.plot.reservedBy = null
    this.tasks.delete(botId)
  }

  private distanceToBot(bot: BotNirv, plot: CropPlot): number {
    const sprite = bot.nirv.sprite
    return Phaser.Math.Distance.Between(sprite.x, sprite.y, plot.x, plot.y)
  }
}

function canStartFarmerWork(state: BotState): boolean {
  return state === 'walking' || state === 'waiting'
}
