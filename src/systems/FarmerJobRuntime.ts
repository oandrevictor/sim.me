import Phaser from 'phaser'
import type { BotNirv, BotState } from '../entities/BotNirv'
import { isFarmerState } from '../entities/BotNirv'
import { randomCropSeed, type CropSeed } from '../data/crops'
import { OBJECT_SIZE } from '../objects/objectTypes'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import type { CropPlot } from './farmingTypes'
import { resolveCropApproach } from './cropApproach'
import type { StationApproach } from './stationApproach'
import { topCriticalNeed } from './botNeedPriority'

const FARMER_APPROACH_REACH_PX = 32
const FARMER_FOOTPRINT_REACH_PX = 28
const FARMER_WORK_MS = 1600
const CROP_FOOTPRINT_H = OBJECT_SIZE / 2

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

type CropAction = 'plant' | 'harvest'

interface FarmerTask {
  plot: CropPlot
  action: CropAction
  approach: StationApproach
  remainingMs: number
}

export class FarmerJobRuntime {
  private tasks = new Map<string, FarmerTask>()
  private schedule: import('./ScheduleSystem').ScheduleSystem | null = null

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void { this.schedule = s }

  constructor(
    private readonly bots: BotNirv[],
    private readonly pathfinder: GridPathfinder,
    private readonly getPlots: () => CropPlot[],
    private readonly getFarmerIds: () => Set<string>,
    private readonly plant: (plot: CropPlot, seed: CropSeed) => void,
    private readonly harvest: (plot: CropPlot) => void,
    private readonly canUsePlot: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canInteractWithPlot: (bot: BotNirv, x: number, y: number) => boolean = () => true,
  ) {}

  update(delta: number): void {
    this.cleanupStaleReservations()
    for (const botId of this.getFarmerIds()) {
      const bot = this.bots.find(b => b.id === botId)
      if (!bot) continue
      if (topCriticalNeed(bot)) {
        this.releaseTask(bot.id)
        if (isFarmerState(bot.state)) bot.abortWorkDuty()
        continue
      }
      if (!isFarmerState(bot.state)) {
        if (!canStartFarmerWork(bot.state)) continue
        bot.enterFarmerIdle()
      }
      const onShift = this.schedule?.isOnShift(bot) ?? true
      if (!onShift) {
        this.releaseTask(bot.id)
        bot.abortWorkDuty()
        continue
      }
      if (bot.state === 'farmer_idle') {
        if (this.tasks.has(bot.id)) this.releaseTask(bot.id)
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
    bot.enterFarmerWalkToCrop(task.approach.x, task.approach.y)
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
    const approachDist = Phaser.Math.Distance.Between(sprite.x, sprite.y, task.approach.x, task.approach.y)
    if (
      approachDist > FARMER_APPROACH_REACH_PX &&
      rectDistance(farmerBodyRect(sprite), cropFootprintRect(task.plot)) > FARMER_FOOTPRINT_REACH_PX
    ) return
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
    else this.plant(task.plot, randomCropSeed())
    this.releaseTask(bot.id)
    bot.enterFarmerIdle()
  }

  private pickTask(bot: BotNirv): FarmerTask | null {
    const plots = this.getPlots()
    const rank = (task: FarmerTask) =>
      this.distanceToApproach(bot, task.approach)
    const candidates = plots
      .filter(p => p.stage === 'ready' || p.stage === 'empty')
      .filter(p => !p.reservedBy || p.reservedBy === bot.id)
      .filter(p => this.canUsePlot(bot, p.x, p.y))
      .map(p => this.createTaskForReachablePlot(bot, p))
      .filter((task): task is FarmerTask => task !== null)
      .sort((a, b) => {
        if ((a.plot.stage === 'ready') !== (b.plot.stage === 'ready')) return a.plot.stage === 'ready' ? -1 : 1
        return rank(a) - rank(b)
      })
    return candidates[0] ?? null
  }

  private createTaskForReachablePlot(bot: BotNirv, plot: CropPlot): FarmerTask | null {
    const approach = resolveCropApproach(this.pathfinder, plot, bot)
    if (!approach) return null
    const action = plot.stage === 'ready' ? 'harvest' : 'plant'
    return { plot, action, approach, remainingMs: 0 }
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

  private distanceToApproach(bot: BotNirv, approach: StationApproach): number {
    const sprite = bot.nirv.sprite
    return Phaser.Math.Distance.Between(sprite.x, sprite.y, approach.x, approach.y)
  }
}

function canStartFarmerWork(state: BotState): boolean {
  return state === 'walking' || state === 'waiting'
}

function farmerBodyRect(sprite: Phaser.Physics.Arcade.Sprite): Rect {
  const body = sprite.body as Phaser.Physics.Arcade.Body | null
  if (!body) return { left: sprite.x, right: sprite.x, top: sprite.y, bottom: sprite.y }
  return {
    left: body.x,
    right: body.x + body.width,
    top: body.y,
    bottom: body.y + body.height,
  }
}

function cropFootprintRect(plot: CropPlot): Rect {
  return {
    left: plot.x - OBJECT_SIZE / 2,
    right: plot.x + OBJECT_SIZE / 2,
    top: plot.y - CROP_FOOTPRINT_H,
    bottom: plot.y,
  }
}

function rectDistance(a: Rect, b: Rect): number {
  const dx = a.right < b.left ? b.left - a.right : b.right < a.left ? a.left - b.right : 0
  const dy = a.bottom < b.top ? b.top - a.bottom : b.bottom < a.top ? a.top - b.bottom : 0
  return Math.sqrt(dx * dx + dy * dy)
}
