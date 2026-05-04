import Phaser from 'phaser'
import {
  CROP_SEED_DEFINITIONS,
  CROP_TEXTURE_KEY,
  cropTextureKey,
  type CropStage,
} from '../data/crops'

const BASE_KEY = 'crop_base_terrain'
const CANVAS_SIZE = 144
const GROWTH_FRAME_SIZE = 48
const OVERLAY_SIZE = 96
const OVERLAY_X = (CANVAS_SIZE - OVERLAY_SIZE) / 2
const OVERLAY_Y = 16

const GROWTH_FRAME_BY_STAGE: Partial<Record<CropStage, number>> = {
  seeded: 0,
  early: 3,
  ready: 6,
}

export function preloadCropAssets(scene: Phaser.Scene): void {
  scene.load.image(BASE_KEY, 'assets/Farm/crop_base_terrain.png')
  for (const crop of CROP_SEED_DEFINITIONS) {
    scene.load.image(growthSourceKey(crop.seed), crop.assetPath)
  }
}

export function generateCropTextures(scene: Phaser.Scene): void {
  createBaseTexture(scene)
  for (const crop of CROP_SEED_DEFINITIONS) {
    for (const stage of ['seeded', 'early', 'ready'] as CropStage[]) {
      createOverlayTexture(scene, cropTextureKey(stage, crop.seed), crop.seed, stage)
    }
  }
  createLegacyCornTextures(scene)
}

function createBaseTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CROP_TEXTURE_KEY.empty)) return
  const texture = scene.textures.createCanvas(CROP_TEXTURE_KEY.empty, CANVAS_SIZE, CANVAS_SIZE)
  if (!texture) return
  const ctx = texture.getContext()
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(baseImage(scene), 0, 0, CANVAS_SIZE, CANVAS_SIZE)
  texture.refresh()
}

function createOverlayTexture(scene: Phaser.Scene, key: string, seed: string, stage: CropStage): void {
  if (scene.textures.exists(key)) return
  const texture = scene.textures.createCanvas(key, CANVAS_SIZE, CANVAS_SIZE)
  if (!texture) return
  const ctx = texture.getContext()
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.imageSmoothingEnabled = false
  drawGrowthOverlay(scene, ctx, seed, stage)
  texture.refresh()
}

function drawGrowthOverlay(
  scene: Phaser.Scene,
  ctx: CanvasRenderingContext2D,
  seed: string,
  stage: CropStage,
): void {
  const frame = GROWTH_FRAME_BY_STAGE[stage]
  if (frame === undefined) return
  ctx.drawImage(
    scene.textures.get(growthSourceKey(seed)).getSourceImage() as CanvasImageSource,
    frame * GROWTH_FRAME_SIZE,
    0,
    GROWTH_FRAME_SIZE,
    GROWTH_FRAME_SIZE,
    OVERLAY_X,
    OVERLAY_Y,
    OVERLAY_SIZE,
    OVERLAY_SIZE,
  )
}

function createLegacyCornTextures(scene: Phaser.Scene): void {
  for (const stage of ['seeded', 'early', 'ready'] as CropStage[]) {
    createOverlayTexture(scene, CROP_TEXTURE_KEY[stage], 'corn', stage)
  }
}

function baseImage(scene: Phaser.Scene): CanvasImageSource {
  return scene.textures.get(BASE_KEY).getSourceImage() as CanvasImageSource
}

function growthSourceKey(seed: string): string {
  return `crop_growth_${seed}`
}
