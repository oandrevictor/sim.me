import Phaser from 'phaser'
import { generateObjectTextures } from '../objects/objectTypes'
import { preloadBedAssets } from '../objects/bedTypes'
import { preloadCropAssets } from '../objects/cropTextures'

export function preloadGameAssets(scene: Phaser.Scene): void {
  generateObjectTextures(scene)
  preloadBedAssets(scene)
  preloadCropAssets(scene)

  const frameConfig = { frameWidth: 48, frameHeight: 48 }
  scene.load.spritesheet('m_idle', 'assets/Player/MPlayer 1 idle.png', frameConfig)
  scene.load.spritesheet('m_walk', 'assets/Player/MPlayer 1 walking.png', frameConfig)
  scene.load.spritesheet('f_idle', 'assets/Player/FPlayer 1 idle.png', frameConfig)
  scene.load.spritesheet('f_walk', 'assets/Player/FPlayer 1 walking.png', frameConfig)
  scene.load.spritesheet('f2_idle', 'assets/Player/FPlayer 1 idle.png', frameConfig)
  scene.load.spritesheet('f2_walk', 'assets/Player/FPlayer 2 walking.png', frameConfig)
  scene.load.spritesheet('f3_idle', 'assets/Player/FPlayer 3 idle.png', frameConfig)
  scene.load.spritesheet('f3_walk', 'assets/Player/FPlayer 3 walking.png', frameConfig)
  scene.load.spritesheet('furniture_table', 'assets/Furniture/ModernTable1.png', { frameWidth: 250, frameHeight: 250 })
  scene.load.spritesheet('furniture_chair', 'assets/Furniture/chair sprite.png', { frameWidth: 250, frameHeight: 250 })
  scene.load.spritesheet('furniture_stove', 'assets/Furniture/new-oven.png', { frameWidth: 528, frameHeight: 288 })
  scene.load.image('white_clay_oven', 'assets/Furniture/white_clay_oven.png')
  scene.load.spritesheet('furniture_stage_solo', 'assets/Furniture/stage-variant.png', { frameWidth: 382, frameHeight: 382 })
  scene.load.image('water_station', 'assets/Furniture/water_station.png')
  scene.load.image('snack_machine', 'assets/Furniture/snack_machine.png')
  scene.load.image('fruit_crate', 'assets/Furniture/fruit_crate.png')
  scene.load.image('fridge', 'assets/Furniture/fridge.png')
  scene.load.image('floor_yellow', 'assets/Build/floorFull_yellow.png')
  scene.load.spritesheet('fixtures_BA', 'assets/Interior/Bathroom/fixtures_BA.png', { frameWidth: 48, frameHeight: 64 })
}
