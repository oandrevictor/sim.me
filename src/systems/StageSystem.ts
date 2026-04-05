import Phaser from 'phaser'
import { type Stage, STAGE_GRID_W, STAGE_GRID_H } from '../entities/Stage'
import type { BotNirv } from '../entities/BotNirv'
import { gridToScreen } from '../utils/isoGrid'

const CHECK_INTERVAL = 3000
const ATTRACT_PROBABILITY = 0.55
const MAX_WATCHERS_PER_STAGE = 5
const WATCH_RADIUS_TILES = 20
const TILE_W = 64 // matches isoGrid TILE_W

export class StageSystem {
  private stages: Stage[]
  private bots: BotNirv[]
  private timeSinceCheck = 0
  /** Maps bot → the watch position it was sent to */
  private watchingBots = new Map<BotNirv, { stageId: string; x: number; y: number }>()

  constructor(stages: Stage[], bots: BotNirv[]) {
    this.stages = stages
    this.bots = bots
  }

  update(delta: number): void {
    this.timeSinceCheck += delta
    if (this.timeSinceCheck < CHECK_INTERVAL) return
    this.timeSinceCheck = 0

    this.cleanupWatchers()
    this.tryAttractBots()
  }

  private cleanupWatchers(): void {
    for (const [bot, _] of this.watchingBots) {
      if (bot.state === 'walking' || bot.state === 'waiting') {
        this.watchingBots.delete(bot)
      }
    }
  }

  private tryAttractBots(): void {
    if (this.stages.length === 0) return

    for (const bot of this.bots) {
      if (bot.state !== 'waiting') continue
      if (this.watchingBots.has(bot)) continue
      if (Math.random() > ATTRACT_PROBABILITY) continue

      // Find the closest stage within range
      let bestStage: Stage | null = null
      let bestDist = Infinity

      for (const stage of this.stages) {
        // Skip stages already at watcher capacity
        const watcherCount = [...this.watchingBots.values()].filter(w => w.stageId === stage.id).length
        if (watcherCount >= MAX_WATCHERS_PER_STAGE) continue

        const stageCenter = this.getStageCenterPixel(stage)
        const dist = Phaser.Math.Distance.Between(
          bot.nirv.sprite.x, bot.nirv.sprite.y,
          stageCenter.x, stageCenter.y,
        )

        if (dist < TILE_W * WATCH_RADIUS_TILES && dist < bestDist) {
          bestDist = dist
          bestStage = stage
        }
      }

      if (!bestStage) continue

      // Pick a random available watch position
      const allPositions = bestStage.getWatchPositions()
      const occupiedPixels = new Set(
        [...this.watchingBots.values()]
          .filter(w => w.stageId === bestStage!.id)
          .map(w => `${Math.round(w.x)},${Math.round(w.y)}`),
      )
      const available = allPositions.filter(
        p => !occupiedPixels.has(`${Math.round(p.x)},${Math.round(p.y)}`),
      )
      if (available.length === 0) continue

      const spot = available[Math.floor(Math.random() * available.length)]
      this.watchingBots.set(bot, { stageId: bestStage.id, x: spot.x, y: spot.y })
      bot.redirectToStage(spot.x, spot.y, bestStage.id)
    }
  }

  private getStageCenterPixel(stage: Stage): { x: number; y: number } {
    return gridToScreen(stage.gridX + STAGE_GRID_W / 2, stage.gridY + STAGE_GRID_H / 2)
  }
}
