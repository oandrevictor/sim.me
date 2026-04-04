import Phaser from 'phaser'
import { Nirv, type NirvVariant } from './Nirv'
import { type ScheduleWaypoint } from './NirvSchedule'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'

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
  private pathfinder: GridPathfinder

  // Path following
  private path: { gx: number; gy: number }[] = []
  private pathNodeIndex = 0
  private prevX = 0
  private prevY = 0
  private stuckFrames = 0

  get state(): BotState { return this._state }

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    waypoints: ScheduleWaypoint[],
    variant: NirvVariant = 'm',
    pathfinder: GridPathfinder,
  ) {
    this.scene = scene
    this.pathfinder = pathfinder
    const start = gridToScreen(waypoints[0].gridX, waypoints[0].gridY)
    this.nirv = new Nirv(scene, name, colorIndex, start.x, start.y, false, variant)
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
    this.computePathToPixel(x, y)
  }

  /** Sit down on a chair */
  seat(nextToTable: boolean): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.seatTimer = Phaser.Math.Between(5000, 10000)
    this.redirectTarget = null
    this.path = []

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
    this.computePathToWaypoint()
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
        this.nirv.updateAnimation(0, 0)
        if (this.waitRemaining <= 0) {
          this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
          this._state = 'walking'
          this.computePathToWaypoint()
        }
        return

      case 'walking': {
        const target = this.waypoints[this.currentIndex]
        const dest = gridToScreen(target.gridX, target.gridY)

        this.followPath()

        const sprite = this.nirv.sprite
        this.nirv.updateAnimation(sprite.body!.velocity.x, sprite.body!.velocity.y)
        const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, dest.x, dest.y)
        if (dist < ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this._state = 'waiting'
          this.waitRemaining = target.duration
          this.path = []
        }
        return
      }

      case 'walking_to_chair': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }

        this.followPath()

        const sprite = this.nirv.sprite
        this.nirv.updateAnimation(sprite.body!.velocity.x, sprite.body!.velocity.y)
        const dist = Phaser.Math.Distance.Between(
          sprite.x, sprite.y,
          this.redirectTarget.x, this.redirectTarget.y
        )
        if (dist < ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          sprite.setPosition(this.redirectTarget.x, this.redirectTarget.y)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          // RestaurantSystem will call seat() once we arrive
        }
        return
      }

      case 'seated':
      case 'awaiting_service':
      case 'eating':
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) {
          this.unseat()
        }
        return
    }
  }

  private computePathToWaypoint(): void {
    const target = this.waypoints[this.currentIndex]
    const sprite = this.nirv.sprite
    const start = screenToGrid(sprite.x, sprite.y)
    this.path = this.pathfinder.findPath(Math.round(start.gx), Math.round(start.gy), target.gridX, target.gridY) ?? []
    this.pathNodeIndex = 0
  }

  private computePathToPixel(px: number, py: number): void {
    const sprite = this.nirv.sprite
    const start = screenToGrid(sprite.x, sprite.y)
    const end = screenToGrid(px, py)
    this.path = this.pathfinder.findPath(Math.round(start.gx), Math.round(start.gy), Math.round(end.gx), Math.round(end.gy)) ?? []
    this.pathNodeIndex = 0
  }

  private followPath(): void {
    const sprite = this.nirv.sprite

    // Stuck detection: if barely moved, skip current path node
    const moved = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.prevX, this.prevY)
    if (moved < 1) {
      this.stuckFrames++
    } else {
      this.stuckFrames = 0
    }
    this.prevX = sprite.x
    this.prevY = sprite.y

    if (this.stuckFrames > 15 && this.pathNodeIndex < this.path.length) {
      // Skip current node — it's likely blocked by furniture
      this.pathNodeIndex++
      this.stuckFrames = 0
    }

    if (this.pathNodeIndex >= this.path.length) {
      // Path exhausted — move directly toward final destination
      if (this._state === 'walking') {
        const target = this.waypoints[this.currentIndex]
        const dest = gridToScreen(target.gridX, target.gridY)
        this.moveToward(dest.x, dest.y)
      } else if (this._state === 'walking_to_chair' && this.redirectTarget) {
        this.moveToward(this.redirectTarget.x, this.redirectTarget.y)
      }
      return
    }

    const node = this.path[this.pathNodeIndex]
    const nodePx = gridToScreen(node.gx, node.gy)
    const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, nodePx.x, nodePx.y)

    if (dist < ARRIVAL_THRESHOLD) {
      this.pathNodeIndex++
      this.stuckFrames = 0
      this.followPath()
      return
    }

    this.moveToward(nodePx.x, nodePx.y)
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
