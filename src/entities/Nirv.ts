import Phaser from 'phaser'
import { DEPTH_UI } from '../config/world'
import { HYDRATION_START, sampleDehydrationRate } from './nirvHydration'
import { SATIATION_START, sampleHungerStep, sampleHungerThreshold } from './nirvHunger'
import {
  REST_START, REST_DECAY_MIN, REST_DECAY_MAX,
  sampleSleepyRate, sampleRestThreshold, sampleSleepRecharges,
} from './nirvSleep'
import { getBedSleepWorldOffset } from './nirvSleepPose'

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
  private readonly scene: Phaser.Scene
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly name: string
  readonly color: number
  readonly isPlayer: boolean
  readonly dehydrationRate: number
  readonly sleepyRate: number
  readonly restThreshold: number
  readonly sleepRecharges: number
  readonly hungerStep: number
  readonly hungerThreshold: number
  private hydrationLevel: number
  private restLevel: number
  private satiation: number
  private variant: NirvVariant
  private lastDir = 'down'
  private isMoving = false
  private lyingDown = false
  private drinkBubbleGfx: Phaser.GameObjects.Graphics | null = null
  private sleepZText: Phaser.GameObjects.Text | null = null

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    x: number,
    y: number,
    isPlayer: boolean,
    variant: NirvVariant = 'm',
  ) {
    this.scene = scene
    this.name = name
    this.color = NIRV_COLORS[colorIndex] ?? NIRV_COLORS[0]
    this.isPlayer = isPlayer
    this.variant = variant
    this.dehydrationRate = sampleDehydrationRate()
    this.hydrationLevel = HYDRATION_START
    this.sleepyRate = sampleSleepyRate()
    this.restThreshold = sampleRestThreshold()
    this.sleepRecharges = sampleSleepRecharges()
    this.restLevel = REST_START
    this.hungerStep = sampleHungerStep()
    this.hungerThreshold = sampleHungerThreshold()
    this.satiation = SATIATION_START

    const textureKey = `${variant}_idle`
    this.sprite = scene.physics.add.sprite(x, y, textureKey, 16)
    this.sprite.setDepth(y)
    this.sprite.body!.setSize(20, 24)
    this.sprite.body!.setOffset(14, 20)
  }

  updateDepth(): void {
    this.sprite.setDepth(this.sprite.y)
  }

  updateAnimation(vx: number, vy: number): void {
    this.updateDepth()
    if (this.lyingDown) return

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

  getHydrationLevel(): number {
    return this.hydrationLevel
  }

  /** One game-minute tick: lose dehydrationRate * 100 points. */
  applyMinuteDehydration(): void {
    this.hydrationLevel = Math.max(0, this.hydrationLevel - this.dehydrationRate * 100)
  }

  addHydration(amount: number): void {
    this.hydrationLevel = Math.min(100, this.hydrationLevel + amount)
  }

  getSatiation(): number {
    return this.satiation
  }

  /** One game-minute tick: lose hungerStep points. */
  applyMinuteSatiation(): void {
    this.satiation = Math.max(0, this.satiation - this.hungerStep)
  }

  addSatiation(amount: number): void {
    this.satiation = Math.min(100, this.satiation + amount)
  }

  getRestLevel(): number {
    return this.restLevel
  }

  /** One game-minute tick: new_rest = old * sleepyRate, decrease clamped to [3, 15]. */
  applyMinuteRestDecay(): void {
    const raw = this.restLevel * this.sleepyRate
    let decrease = this.restLevel - raw
    decrease = Math.max(REST_DECAY_MIN, Math.min(REST_DECAY_MAX, decrease))
    this.restLevel = Math.max(0, this.restLevel - decrease)
  }

  addRest(amount: number): void {
    this.restLevel = Math.min(100, this.restLevel + amount)
  }

  /** Lay sprite on side (sleep pose); stops walk animation. */
  setLyingDown(active: boolean): void {
    this.lyingDown = active
    if (active) {
      this.sprite.setRotation(Math.PI / 2)
      this.sprite.anims.stop()
    } else {
      this.sprite.setRotation(0)
    }
  }

  /** Move onto mattress then lie down (bedRotation 0 = left texture, 1 = right). */
  snapToBedSleepPose(bedX: number, bedY: number, bedRotation: 0 | 1): void {
    const o = getBedSleepWorldOffset(bedRotation)
    this.sprite.setPosition(bedX + o.dx, bedY + o.dy)
    this.setLyingDown(true)
  }

  showDrinkingBubble(): void {
    if (!this.drinkBubbleGfx) {
      const gfx = this.scene.add.graphics()
      gfx.setDepth(DEPTH_UI + 5)
      this.drinkBubbleGfx = gfx
    }
    this.drawDrinkingBubble()
  }

  private drawDrinkingBubble(): void {
    if (!this.drinkBubbleGfx) return
    const gfx = this.drinkBubbleGfx
    gfx.clear()
    const bx = this.sprite.x
    const by = this.sprite.y - 28
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillRoundedRect(bx - 14, by - 10, 28, 16, 4)
    gfx.fillStyle(0x88ccff)
    gfx.fillRect(bx - 4, by - 8, 8, 10)
    gfx.lineStyle(1, 0x5599bb)
    gfx.strokeRect(bx - 4, by - 8, 8, 10)
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillTriangle(bx - 3, by + 6, bx + 3, by + 6, bx, by + 10)
  }

  syncDrinkingBubblePosition(): void {
    if (this.drinkBubbleGfx) this.drawDrinkingBubble()
  }

  hideDrinkingBubble(): void {
    if (this.drinkBubbleGfx) {
      this.drinkBubbleGfx.destroy()
      this.drinkBubbleGfx = null
    }
  }

  showSleepZzZ(): void {
    if (!this.sleepZText) {
      this.sleepZText = this.scene.add.text(0, 0, 'Z z Z', {
        fontSize: '11px',
        color: '#333333',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(DEPTH_UI + 6)
    }
    this.syncSleepZzZPosition()
    this.sleepZText.setVisible(true)
  }

  syncSleepZzZPosition(): void {
    if (!this.sleepZText) return
    this.sleepZText.setPosition(this.sprite.x, this.sprite.y - 36)
  }

  hideSleepZzZ(): void {
    if (this.sleepZText) {
      this.sleepZText.destroy()
      this.sleepZText = null
    }
  }
}
