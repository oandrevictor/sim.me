import Phaser from 'phaser'

export type NirvVariant = 'm' | 'f'

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
  private variant: NirvVariant
  private lastDir = 'down'
  private isMoving = false

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    x: number,
    y: number,
    isPlayer: boolean,
    variant: NirvVariant = 'm',
  ) {
    this.name = name
    this.color = NIRV_COLORS[colorIndex] ?? NIRV_COLORS[0]
    this.isPlayer = isPlayer
    this.variant = variant

    const textureKey = `${variant}_idle`
    this.sprite = scene.physics.add.sprite(x, y, textureKey, 16)
    this.sprite.setDepth(4)
    this.sprite.body!.setSize(20, 24)
    this.sprite.body!.setOffset(14, 20)
  }

  updateAnimation(vx: number, vy: number): void {
    const moving = Math.abs(vx) > 10 || Math.abs(vy) > 10

    if (moving) {
      // Determine direction from dominant axis
      let dir: string
      if (Math.abs(vx) > Math.abs(vy)) {
        dir = vx > 0 ? 'right' : 'left'
      } else {
        dir = vy > 0 ? 'down' : 'up'
      }
      this.lastDir = dir

      const walkKey = `${this.variant}_walk_${dir}`
      if (this.sprite.anims.currentAnim?.key !== walkKey) {
        this.sprite.anims.play(walkKey, true)
      }
      this.isMoving = true
    } else if (this.isMoving) {
      const idleKey = `${this.variant}_idle_${this.lastDir}`
      this.sprite.anims.play(idleKey, true)
      this.isMoving = false
    }
  }

  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y }
  }
}
