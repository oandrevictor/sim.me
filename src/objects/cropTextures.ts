import Phaser from 'phaser'
import { CROP_TEXTURE_KEY, type CropStage } from '../data/crops'

const SOURCE_KEY = 'cropstates'
const FRAME_W = 384
const FRAME_H = 390
const SOURCE_Y = 238

const STAGES: CropStage[] = ['empty', 'seeded', 'early', 'ready']

export function preloadCropAssets(scene: Phaser.Scene): void {
  scene.load.image(SOURCE_KEY, 'assets/Farm/cropstates.png')
}

export function generateCropTextures(scene: Phaser.Scene): void {
  const source = scene.textures.get(SOURCE_KEY).getSourceImage() as CanvasImageSource
  STAGES.forEach((stage, index) => {
    const key = CROP_TEXTURE_KEY[stage]
    if (scene.textures.exists(key)) return
    const texture = scene.textures.createCanvas(key, FRAME_W, FRAME_H)
    if (!texture) return
    const ctx = texture.getContext()
    ctx.clearRect(0, 0, FRAME_W, FRAME_H)
    ctx.drawImage(source, index * FRAME_W, SOURCE_Y, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
    texture.refresh()
  })
}
