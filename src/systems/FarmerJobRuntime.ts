import Phaser from 'phaser'
import type { BotNirv, BotState } from '../entities/BotNirv'
import { isFarmerState } from '../entities/BotNirv'
import { CORN_SEED } from '../data/crops'
import { cropApproachPoint, type CropPlot } from './farmingTypes'

const FARMER_REACH_PX = 64
const FARMER_APPROACH_REACH_PX = 32
const FARMER_WORK_MS = 1600

type CropAction = 'plant' | 'harvest'

interface FarmerTask {
  plot: CropPlot
  action: CropAction
  remainingMs: number
}

export class FarmerJobRuntime {
  private tasks = new Map<string, FarmerTask>()
  private schedule: import('./ScheduleSystem').ScheduleSystem | null = null

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void { this.schedule = s }

  constructor(
    private readonly bots: BotNirv[],
    private readonly getPlots: () => CropPlot[],
    private readonly getFarmerIds: () => Set<string>,
    private readonly plant: (plot: CropPlot, seed: typeof CORN_SEED) => void,
    private readonly harvest: (plot: CropPlot) => void,
    private readonly canUsePlot: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canInteractWithPlot: (bot: BotNirv, x: number, y: number) => boolean = () => true,
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
      if (bot.state === 'farmer_idle') {
        if (this.tasks.has(bot.id)) this.releaseTask(bot.id)
        const onShift = this.schedule?.isOnShift(bot) ?? true
        if (!onShift && !this.hasUrgentHarvest()) continue
        this.assignTask(bot)
      }
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
    if (!this.canInteractWithPlot(bot, task.plot.x, task.plot.y)) return
    const plotDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, task.plot.x, task.plot.y)
    const approach = cropApproachPoint(task.plot.x, task.plot.y)
    const approachDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, approach.x, approach.y)
    if (plotDist > FARMER_REACH_PX && approachDist > FARMER_APPROACH_REACH_PX) return
    task.remainingMs = FARMER_WORK_MS * bot.nirv.getMoodWorkModifier()
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

  private hasUrgentHarvest(): boolean {
    return this.getPlots().some(p => p.stage === 'ready' && !p.reservedBy)
  }

  private pickTask(bot: BotNirv): FarmerTask | null {
    const plots = this.getPlots()
    const rank = (p: CropPlot) =>
      this.distanceToBot(bot, p) + (p.reservedBy && p.reservedBy !== bot.id ? 1e6 : 0)
    const candidates = plots
      .filter(p => p.stage === 'ready' || p.stage === 'empty')
      .filter(p => this.canUsePlot(bot, p.x, p.y))
      .sort((a, b) => {
        if ((a.stage === 'ready') !== (b.stage === 'ready')) return a.stage === 'ready' ? -1 : 1
        return rank(a) - rank(b)
      })
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
      const bot = this.bots.find(b => b.id === botId)
      if (
        !farmerIds.has(botId) ||
        task.plot.reservedBy !== botId ||
        !bot ||
        (bot.state !== 'farmer_to_crop' && bot.state !== 'farmer_working')
      ) this.releaseTask(botId)
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
