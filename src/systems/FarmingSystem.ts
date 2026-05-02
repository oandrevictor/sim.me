import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import { type CropSeed, type CropStage } from '../data/crops'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { addCorn, loadFarmRecord, saveFarmerBotIds } from '../storage/farmPersistence'
import { FarmerJobRuntime } from './FarmerJobRuntime'
import { advanceCropGrowth, applyCropTexture, countCropStages, persistCropPlot } from './cropGrowth'
import { cropApproachPoint, type CropPlot, type FarmWorkView } from './farmingTypes'

const PLAYER_REACH_PX = 96

export class FarmingSystem {
  private plots: CropPlot[] = []
  private pendingPlayerPlot: CropPlot | null = null
  private farmerBotIds = new Set<string>()
  private readonly farmerJobs: FarmerJobRuntime

  constructor(
    private readonly bots: BotNirv[],
    pathfinder: GridPathfinder,
    private readonly getPlayer: () => Nirv,
    private readonly openSeedPicker: (onSelect: (seed: CropSeed) => void) => void,
    private readonly canBotUsePlot: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerUsePlot: (x: number, y: number) => boolean = () => true,
    private readonly canBotInteractWithPlot: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerInteractWithPlot: (x: number, y: number) => boolean = () => true,
  ) {
    for (const id of loadFarmRecord().farmerBotIds) this.farmerBotIds.add(id)
    this.farmerJobs = new FarmerJobRuntime(
      bots,
      pathfinder,
      () => this.plots,
      () => this.farmerBotIds,
      (plot, seed) => this.plant(plot, seed),
      plot => this.harvest(plot),
      this.canBotUsePlot,
      this.canBotInteractWithPlot,
    )
  }

  registerCrop(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
    saved?: { cropStage?: CropStage; cropSeed?: CropSeed; cropStageStartedAt?: number },
  ): void {
    const plot: CropPlot = {
      sprite,
      x,
      y,
      stage: saved?.cropStage ?? 'empty',
      seed: saved?.cropSeed,
      stageStartedAt: saved?.cropStageStartedAt,
      reservedBy: null,
    }
    if (advanceCropGrowth(plot, Date.now())) persistCropPlot(plot)
    applyCropTexture(plot)
    this.plots.push(plot)
  }

  unregisterCrop(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): void {
    const idx = this.plots.findIndex(p => p.sprite === sprite)
    if (idx === -1) return
    const plot = this.plots[idx]!
    if (plot.reservedBy) this.farmerJobs.releaseTask(plot.reservedBy)
    if (this.pendingPlayerPlot === plot) this.pendingPlayerPlot = null
    this.plots.splice(idx, 1)
  }

  tryInteractCrop(
    sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
    x: number,
    y: number,
    setWalkTarget: (x: number, y: number) => void,
  ): boolean {
    const plot = this.plots.find(p => p.sprite === sprite || (p.x === x && p.y === y))
    if (!plot) return false
    if (!this.canPlayerUsePlot(plot.x, plot.y)) return true
    const player = this.getPlayer().sprite
    if (Phaser.Math.Distance.Between(player.x, player.y, plot.x, plot.y) > PLAYER_REACH_PX) {
      this.pendingPlayerPlot = plot
      const p = cropApproachPoint(plot.x, plot.y)
      setWalkTarget(p.x, p.y)
      return true
    }
    if (!this.canPlayerInteractWithPlot(plot.x, plot.y)) return true
    this.resolvePlayerAction(plot)
    return true
  }

  clearPlayerPending(): void {
    this.pendingPlayerPlot = null
  }

  update(delta: number): void {
    const now = Date.now()
    for (const plot of this.plots) {
      if (advanceCropGrowth(plot, now)) persistCropPlot(plot)
    }
    this.resolvePendingPlayer()
    this.farmerJobs.update(delta)
  }

  getFarmWorkView(): FarmWorkView {
    return {
      totalCrops: this.plots.length,
      cornCount: loadFarmRecord().cornCount,
      farmerBotIds: [...this.farmerBotIds],
      bots: this.bots,
      counts: countCropStages(this.plots),
    }
  }

  setFarmerAssigned(botId: string, assigned: boolean): void {
    if (assigned) this.farmerBotIds.add(botId)
    else {
      this.farmerBotIds.delete(botId)
      this.bots.find(b => b.id === botId)?.abortFarmerDuty()
      this.farmerJobs.releaseTask(botId)
    }
    saveFarmerBotIds([...this.farmerBotIds])
  }

  isFarmerBot(bot: BotNirv): boolean {
    return this.farmerBotIds.has(bot.id)
  }

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void {
    this.farmerJobs.setSchedule(s)
  }

  releaseAllForBot(bot: BotNirv): void {
    this.farmerJobs.releaseAllForBot(bot)
  }

  private resolvePendingPlayer(): void {
    const plot = this.pendingPlayerPlot
    if (!plot || !this.plots.includes(plot)) return
    const player = this.getPlayer().sprite
    if (Phaser.Math.Distance.Between(player.x, player.y, plot.x, plot.y) > PLAYER_REACH_PX) return
    if (!this.canPlayerInteractWithPlot(plot.x, plot.y)) return
    this.pendingPlayerPlot = null
    this.resolvePlayerAction(plot)
  }

  private resolvePlayerAction(plot: CropPlot): void {
    if (plot.stage === 'empty') this.openSeedPicker(seed => this.plant(plot, seed))
    else if (plot.stage === 'ready') this.harvest(plot)
  }

  private plant(plot: CropPlot, seed: CropSeed): void {
    if (!this.plots.includes(plot) || plot.stage !== 'empty') return
    plot.stage = 'seeded'
    plot.seed = seed
    plot.stageStartedAt = Date.now()
    applyCropTexture(plot)
    persistCropPlot(plot)
  }

  private harvest(plot: CropPlot): void {
    if (!this.plots.includes(plot) || plot.stage !== 'ready') return
    addCorn(1)
    plot.stage = 'empty'
    plot.seed = undefined
    plot.stageStartedAt = undefined
    applyCropTexture(plot)
    persistCropPlot(plot)
  }
}
