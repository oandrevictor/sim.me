import Phaser from 'phaser'
import { Nirv } from './Nirv'
import { type ScheduleWaypoint, gridToPixel } from './NirvSchedule'

const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 18

type BotState = 'walking' | 'waiting'

export class BotNirv {
  readonly nirv: Nirv
  private waypoints: ScheduleWaypoint[]
  private currentIndex = 0
  private state: BotState = 'walking'
  private waitRemaining = 0

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    waypoints: ScheduleWaypoint[],
  ) {
    // Start at the first waypoint
    const start = gridToPixel(waypoints[0].gridX, waypoints[0].gridY)
    this.nirv = new Nirv(scene, name, colorIndex, start.x, start.y, false)
    this.waypoints = waypoints

    // Begin by waiting at first waypoint
    this.state = 'waiting'
    this.waitRemaining = waypoints[0].duration
  }

  update(delta: number): void {
    if (this.state === 'waiting') {
      this.waitRemaining -= delta
      if (this.waitRemaining <= 0) {
        this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
        this.state = 'walking'
      }
      return
    }

    // Walking toward current waypoint
    const target = this.waypoints[this.currentIndex]
    const dest = gridToPixel(target.gridX, target.gridY)
    const sprite = this.nirv.sprite

    const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, dest.x, dest.y)

    if (dist < ARRIVAL_THRESHOLD) {
      sprite.setVelocity(0, 0)
      this.state = 'waiting'
      this.waitRemaining = target.duration
      return
    }

    const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, dest.x, dest.y)
    sprite.setVelocity(Math.cos(angle) * BOT_SPEED, Math.sin(angle) * BOT_SPEED)
  }
}
