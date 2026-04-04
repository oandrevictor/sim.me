import Phaser from 'phaser'
import { OBJECT_SIZE } from '../config/world'

export const NIRV_COLORS = [
  0xe8c547, // gold (player)
  0x4488ff, // blue
  0xff6644, // coral
  0x44dd88, // mint
  0xdd44aa, // pink
  0xff9933, // orange
  0x8866dd, // purple
  0x44cccc, // teal
]

export class Nirv {
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly name: string
  readonly color: number
  readonly isPlayer: boolean

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    x: number,
    y: number,
    isPlayer: boolean,
  ) {
    this.name = name
    this.color = NIRV_COLORS[colorIndex] ?? NIRV_COLORS[0]
    this.isPlayer = isPlayer

    const textureKey = `nirv_${colorIndex}`
    if (!scene.textures.exists(textureKey)) {
      const gfx = scene.make.graphics({ x: 0, y: 0 })
      gfx.fillStyle(this.color)
      gfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
      // darker border
      gfx.lineStyle(2, Phaser.Display.Color.ValueToColor(this.color).darken(30).color)
      gfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
      gfx.generateTexture(textureKey, OBJECT_SIZE, OBJECT_SIZE)
      gfx.destroy()
    }

    this.sprite = scene.physics.add.sprite(x, y, textureKey)
    this.sprite.setDepth(4)
  }

  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y }
  }
}
