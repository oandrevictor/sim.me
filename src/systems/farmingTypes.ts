import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { CropSeed, CropStage } from '../data/crops'
import type { CropCounts } from '../storage/farmPersistence'

export interface CropPlot {
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite
  overlaySprite: Phaser.GameObjects.Sprite
  x: number
  y: number
  stage: CropStage
  seed?: CropSeed
  stageStartedAt?: number
  reservedBy: string | null
}

export interface FarmWorkView {
  totalCrops: number
  cropCounts: CropCounts
  farmerBotIds: string[]
  bots: BotNirv[]
  counts: Record<CropStage, number>
}

export function cropApproachPoint(x: number, y: number): { x: number; y: number } {
  return { x, y: y + 52 }
}
