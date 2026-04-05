import Phaser from 'phaser'

export type NirvVariant = 'm' | 'f' | 'f2' | 'f3'

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
      // Convert screen velocity to grid-space direction for iso-correct animation
      // dgx ∝ movement along gx axis (SE on screen)
      // dgy ∝ movement along gy axis (SW on screen)
      const dgx = vx + 2 * vy
      const dgy = -vx + 2 * vy

      let dir: string
      if (Math.abs(dgx) > Math.abs(dgy)) {
        dir = dgx > 0 ? 'down' : 'up'
      } else if (Math.abs(dgy) > Math.abs(dgx)) {
        dir = dgy > 0 ? 'left' : 'right'
      } else {
        // Tie: moving in a screen-cardinal direction, use screen axis
        if (Math.abs(vy) > Math.abs(vx)) {
          dir = vy > 0 ? 'down' : 'up'
        } else {
          dir = vx > 0 ? 'right' : 'left'
        }
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
