import Phaser from 'phaser'
import { Nirv } from './Nirv'
import { type ScheduleWaypoint, gridToPixel } from './NirvSchedule'

const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 18

export type BotState = 'walking' | 'waiting' | 'walking_to_chair' | 'seated' | 'awaiting_service' | 'eating'

export class BotNirv {
  readonly nirv: Nirv
  private waypoints: ScheduleWaypoint[]
  private currentIndex = 0
  private _state: BotState = 'walking'
  private waitRemaining = 0
  private seatTimer = 0
  private redirectTarget: { x: number; y: number } | null = null
  private statusIcon: Phaser.GameObjects.Graphics | null = null
  private scene: Phaser.Scene
  private eatingColor = 0xffffff

  get state(): BotState { return this._state }

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    waypoints: ScheduleWaypoint[],
  ) {
    this.scene = scene
    const start = gridToPixel(waypoints[0].gridX, waypoints[0].gridY)
    this.nirv = new Nirv(scene, name, colorIndex, start.x, start.y, false)
    this.waypoints = waypoints

    this.state = 'waiting'
    this.waitRemaining = waypoints[0].duration
  }

  private set state(s: BotState) {
    this._state = s
  }

  /** Redirect bot to walk to a chair position */
  redirectToChair(x: number, y: number): void {
    this.redirectTarget = { x, y }
    this._state = 'walking_to_chair'
    this.nirv.sprite.setVelocity(0, 0)
  }

  /** Sit down on a chair */
  seat(nextToTable: boolean): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.seatTimer = Phaser.Math.Between(5000, 10000)
    this.redirectTarget = null

    if (nextToTable) {
      this._state = 'awaiting_service'
      this.showStatusIcon()
    } else {
      this._state = 'seated'
    }
  }

  /** Get up and resume normal schedule */
  unseat(): void {
    this._state = 'walking'
    this.hideStatusIcon()
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
  }

  /** Start eating food */
  startEating(eatDurationMs: number, recipeColor: number): void {
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'eating'
    this.seatTimer = eatDurationMs
    this.eatingColor = recipeColor
    this.hideStatusIcon()
    this.showStatusIcon()
  }

  update(delta: number): void {
    switch (this._state) {
      case 'waiting':
        this.waitRemaining -= delta
        if (this.waitRemaining <= 0) {
          this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
          this._state = 'walking'
        }
        return

      case 'walking': {
        const target = this.waypoints[this.currentIndex]
        const dest = gridToPixel(target.gridX, target.gridY)
        this.moveToward(dest.x, dest.y)

        const sprite = this.nirv.sprite
        const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, dest.x, dest.y)
        if (dist < ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          this._state = 'waiting'
          this.waitRemaining = target.duration
        }
        return
      }

      case 'walking_to_chair': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          return
        }
        this.moveToward(this.redirectTarget.x, this.redirectTarget.y)

        const sprite = this.nirv.sprite
        const dist = Phaser.Math.Distance.Between(
          sprite.x, sprite.y,
          this.redirectTarget.x, this.redirectTarget.y
        )
        if (dist < ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          // RestaurantSystem will call seat() once we arrive
        }
        return
      }

      case 'seated':
      case 'awaiting_service':
      case 'eating':
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) {
          this.unseat()
        }
        return
    }
  }

  private moveToward(tx: number, ty: number): void {
    const sprite = this.nirv.sprite
    const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, tx, ty)
    sprite.setVelocity(Math.cos(angle) * BOT_SPEED, Math.sin(angle) * BOT_SPEED)
  }

  private showStatusIcon(): void {
    if (this.statusIcon) return
    const gfx = this.scene.add.graphics()
    gfx.setDepth(5)
    this.statusIcon = gfx
    this.drawStatusIcon()
  }

  private drawStatusIcon(): void {
    if (!this.statusIcon) return
    const sprite = this.nirv.sprite
    const gfx = this.statusIcon
    gfx.clear()

    const bx = sprite.x
    const by = sprite.y - 28

    // Bubble background
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillRoundedRect(bx - 14, by - 10, 28, 16, 4)

    if (this._state === 'eating') {
      // Food colored circle
      gfx.fillStyle(this.eatingColor)
      gfx.fillCircle(bx, by - 2, 5)
      gfx.lineStyle(1, 0x666666)
      gfx.strokeCircle(bx, by - 2, 5)
    } else {
      // Three dots "..." for awaiting service
      gfx.fillStyle(0x333333)
      gfx.fillCircle(bx - 6, by - 2, 2)
      gfx.fillCircle(bx, by - 2, 2)
      gfx.fillCircle(bx + 6, by - 2, 2)
    }

    // Small triangle pointer
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillTriangle(bx - 3, by + 6, bx + 3, by + 6, bx, by + 10)
  }

  private updateStatusIconPosition(): void {
    if (!this.statusIcon) return
    this.drawStatusIcon()
  }

  private hideStatusIcon(): void {
    if (this.statusIcon) {
      this.statusIcon.destroy()
      this.statusIcon = null
    }
  }
}
