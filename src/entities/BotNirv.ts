import Phaser from 'phaser'
import { Nirv, type NirvVariant } from './Nirv'
import { type ScheduleWaypoint } from './NirvSchedule'
import type { GridPathfinder, StageInteriorBounds } from '../pathfinding/GridPathfinder'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import type { MusicTag } from '../data/musicTags'
import type { NirvProfession } from '../data/professions'
import { rollLeaveEarly } from '../systems/stageAffinity'
import { DEPTH_UI } from '../config/world'
import { EARLY_LEAVE_CHECK_INTERVAL_MS } from '../systems/stagePerformanceRuntime'
import { fruitSlotWorldPosition } from '../systems/fruitCrateLayout'

const FUN_WATCH_TICK_MS = 10_000
const FUN_GAIN_MATCH = 10
const FUN_GAIN_NO_MATCH = 5

const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 24
const CHAIR_ARRIVAL_THRESHOLD = 32

export type BotState =
  | 'walking'
  | 'waiting'
  | 'walking_to_chair'
  | 'seated'
  | 'awaiting_service'
  | 'eating'
  | 'walking_to_stage'
  | 'watching_stage'
  | 'walking_to_perform'
  | 'performing_on_stage'
  | 'walking_to_water'
  | 'walking_to_water_queue'
  | 'waiting_at_water_queue'
  | 'drinking_water'
  | 'walking_to_snack'
  | 'walking_to_snack_queue'
  | 'waiting_at_snack_queue'
  | 'snack_interact'
  | 'snack_wander'
  | 'snack_eat'
  | 'walking_to_fruit'
  | 'walking_to_fruit_queue'
  | 'waiting_at_fruit_queue'
  | 'fruit_interact'
  | 'fruit_wander'
  | 'fruit_eat'
  | 'walking_to_bed'
  | 'sleeping'
  | 'walking_to_toilet'
  | 'walking_to_toilet_queue'
  | 'waiting_at_toilet_queue'
  | 'using_toilet'

export class BotNirv {
  readonly id: string
  readonly profession: NirvProfession
  readonly interests: readonly MusicTag[]
  readonly performerTags: readonly MusicTag[]
  readonly nirv: Nirv
  private waypoints: ScheduleWaypoint[]
  private currentIndex = 0
  private _state: BotState = 'walking'
  private waitRemaining = 0
  private seatTimer = 0
  /** Audience taste vs act tags; used for early-leave rolls while watching */
  private stageWatchAffinity = 0.35
  private stageEarlyLeaveAccum = 0
  /** Fun gain while watching: interest vs act tags (set when redirected to audience). */
  private watchInterestMatch = false
  private funWatchAccumMs = 0
  private redirectTarget: { x: number; y: number } | null = null
  /** When set, A* uses this tile (interior stage cells); avoids Math.round(screenToGrid) snapping off the deck */
  private pathEndCell: { gx: number; gy: number } | null = null
  /** Unblocked goal fallback stays inside this rect (platform tiles only) */
  private performInterior: StageInteriorBounds | null = null
  private statusIcon: Phaser.GameObjects.Graphics | null = null
  private sleepZText: Phaser.GameObjects.Text | null = null
  private scene: Phaser.Scene
  private eatingColor = 0xffffff
  /** Snack / fruit crate anchor (wander offset from station center). */
  private satiationAnchor: { x: number; y: number } | null = null
  private snackBubblePhase = 0
  private pathfinder: GridPathfinder

  // Path following
  private path: { gx: number; gy: number }[] = []
  private pathNodeIndex = 0
  private prevX = 0
  private prevY = 0
  private stuckFrames = 0

  /** ID of the stage this bot is walking to or watching (null otherwise) */
  stageId: string | null = null

  get state(): BotState { return this._state }

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    waypoints: ScheduleWaypoint[],
    variant: NirvVariant,
    pathfinder: GridPathfinder,
    botId: string,
    profession: NirvProfession,
    interests: readonly MusicTag[],
    performerTags: readonly MusicTag[],
  ) {
    this.id = botId
    this.profession = profession
    this.interests = interests
    this.performerTags = performerTags
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

  /** Redirect bot to walk to a stage watch position */
  redirectToStage(x: number, y: number, stageId: string): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this.stageId = stageId
    this._state = 'walking_to_stage'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  /** Walk onto the stage platform as the act (not audience). `pathEndCell` must be an interior stage tile. */
  redirectToPerformSpot(
    x: number,
    y: number,
    stageId: string,
    pathEndCell: { gx: number; gy: number },
    stageInterior: StageInteriorBounds,
  ): void {
    this.performInterior = stageInterior
    this.pathEndCell = pathEndCell
    this.redirectTarget = { x, y }
    this.stageId = stageId
    this._state = 'walking_to_perform'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y, pathEndCell)
  }

  /** Called when sending this bot toward a performance (interest vs act tags) */
  setStageWatchAffinity(affinity: number): void {
    this.stageWatchAffinity = affinity
  }

  /** Whether act tags overlap bot interests; drives +5 vs +10 fun per 10s while watching. */
  setStageWatchInterestMatch(match: boolean): void {
    this.watchInterestMatch = match
    this.funWatchAccumMs = 0
  }

  /** Leave stage and resume normal schedule */
  leaveStage(): void {
    this._state = 'walking'
    this.stageId = null
    this.redirectTarget = null
    this.pathEndCell = null
    this.performInterior = null
    this.path = []
    this.stageEarlyLeaveAccum = 0
    this.watchInterestMatch = false
    this.funWatchAccumMs = 0
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
    this.computePathToWaypoint()
  }

  /** Walk to bed pixel (SleepSystem reserves the station). */
  redirectToBed(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_bed'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  arriveAtBed(bedX: number, bedY: number, bedRotation: 0 | 1): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this._state = 'sleeping'
    this.nirv.snapToBedSleepPose(bedX, bedY, bedRotation)
    this.showStatusIcon()
  }

  /** Leave sleep flow (thirst interrupt, bed removed, or stuck recovery). */
  cancelSleep(): void {
    if (this._state !== 'walking_to_bed' && this._state !== 'sleeping') return
    if (this._state === 'sleeping') this.nirv.setLyingDown(false)
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.performInterior = null
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  /** Restored to full; called by SleepSystem. */
  finishSleeping(): void {
    this.nirv.setLyingDown(false)
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  /** Walk to drinking water station pixel. */
  redirectToWater(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_water'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  /** Walk to a spot in the line behind the station (FIFO). */
  redirectToWaterQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_water_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  /** Called when bot reaches their queue slot. */
  arriveAtWaterQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_water_queue'
  }

  /** Station removed or leaving queue flow. */
  cancelWaterQueue(): void {
    if (
      this._state !== 'walking_to_water' &&
      this._state !== 'drinking_water' &&
      this._state !== 'walking_to_water_queue' &&
      this._state !== 'waiting_at_water_queue'
    ) return
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  /** Called by HydrationSystem when bot reaches the station. */
  arriveAtWaterStation(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'drinking_water'
    this.seatTimer = 3000
    this.showStatusIcon()
  }

  redirectToToilet(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_toilet'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  redirectToToiletQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_toilet_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  arriveAtToiletQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_toilet_queue'
  }

  cancelToiletQueue(): void {
    if (
      this._state !== 'walking_to_toilet' &&
      this._state !== 'using_toilet' &&
      this._state !== 'walking_to_toilet_queue' &&
      this._state !== 'waiting_at_toilet_queue'
    ) return
    this.hideStatusIcon()
    if (this._state === 'using_toilet') this.nirv.exitToilet()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  arriveAtToiletStation(stationX: number, stationY: number): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this.hideStatusIcon()
    this._state = 'using_toilet'
    this.seatTimer = 3000
    this.nirv.enterToiletInterior(stationX, stationY)
  }

  /** Abort walking to chair; caller must release restaurant chair first if reserved. */
  abortWalkingToChair(): void {
    this.redirectTarget = null
    this.path = []
    this.pathEndCell = null
    this.performInterior = null
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'walking'
    this.computePathToWaypoint()
  }

  /** Abort walking toward stage audience spot (critical hydration). */
  abortStageApproach(): void {
    this._state = 'walking'
    this.stageId = null
    this.redirectTarget = null
    this.pathEndCell = null
    this.performInterior = null
    this.path = []
    this.stageEarlyLeaveAccum = 0
    this.watchInterestMatch = false
    this.funWatchAccumMs = 0
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  /** Leave seat immediately for water (critical); same waypoint advance as unseat. */
  interruptSeatForHydration(): void {
    this.hideStatusIcon()
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'walking'
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
    this.computePathToWaypoint()
  }

  /** Leave seat for food (critical hunger). */
  interruptSeatForFood(): void {
    this.hideStatusIcon()
    this.nirv.sprite.setVelocity(0, 0)
    this._state = 'walking'
    this.currentIndex = (this.currentIndex + 1) % this.waypoints.length
    this.computePathToWaypoint()
  }

  redirectToSnack(stationX: number, stationY: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.satiationAnchor = { x: stationX, y: stationY }
    this.redirectTarget = { x: stationX, y: stationY }
    this._state = 'walking_to_snack'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(stationX, stationY)
  }

  redirectToSnackQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_snack_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  arriveAtSnackQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_snack_queue'
  }

  /** Cancel snack machine or fruit crate flow (thirst/sleep interrupts, station removed). */
  cancelSatiationQueue(): void {
    if (
      this._state !== 'walking_to_snack' &&
      this._state !== 'snack_interact' &&
      this._state !== 'snack_wander' &&
      this._state !== 'snack_eat' &&
      this._state !== 'walking_to_snack_queue' &&
      this._state !== 'waiting_at_snack_queue' &&
      this._state !== 'walking_to_fruit' &&
      this._state !== 'fruit_interact' &&
      this._state !== 'fruit_wander' &&
      this._state !== 'fruit_eat' &&
      this._state !== 'walking_to_fruit_queue' &&
      this._state !== 'waiting_at_fruit_queue'
    ) {
      return
    }
    this.hideStatusIcon()
    this.satiationAnchor = null
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  redirectToFruit(stationX: number, stationY: number, slotIndex: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.satiationAnchor = { x: stationX, y: stationY }
    const p = fruitSlotWorldPosition(stationX, stationY, slotIndex)
    this.redirectTarget = { x: p.x, y: p.y }
    this._state = 'walking_to_fruit'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(p.x, p.y)
  }

  redirectToFruitQueueSlot(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
    this.redirectTarget = { x, y }
    this._state = 'walking_to_fruit_queue'
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToPixel(x, y)
  }

  arriveAtFruitQueueSlot(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'waiting_at_fruit_queue'
  }

  /** Called by HungerSystem when bot reaches their fruit slot. */
  arriveAtFruitStation(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'fruit_interact'
    this.seatTimer = Phaser.Math.Between(1000, 2000)
    this.showStatusIcon()
  }

  /** Called by HungerSystem when bot reaches the snack machine. */
  arriveAtSnackStation(): void {
    this.nirv.sprite.setVelocity(0, 0)
    this.redirectTarget = null
    this.path = []
    this.nirv.updateAnimation(0, 0)
    this._state = 'snack_interact'
    this.seatTimer = Phaser.Math.Between(1000, 2000)
    this.showStatusIcon()
  }

  /** Redirect bot to walk to a chair position */
  redirectToChair(x: number, y: number): void {
    this.performInterior = null
    this.pathEndCell = null
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
        if (dist < CHAIR_ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          sprite.setPosition(this.redirectTarget.x, this.redirectTarget.y)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          // RestaurantSystem will call seat() once we arrive
        }
        return
      }

      case 'walking_to_water': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const wSprite = this.nirv.sprite
        this.nirv.updateAnimation(wSprite.body!.velocity.x, wSprite.body!.velocity.y)
        // HydrationSystem calls arriveAtWaterStation() when close (same pattern as chairs)
        return
      }

      case 'walking_to_bed': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const bedSprite = this.nirv.sprite
        this.nirv.updateAnimation(bedSprite.body!.velocity.x, bedSprite.body!.velocity.y)
        return
      }

      case 'sleeping':
        this.nirv.updateAnimation(0, 0)
        this.updateStatusIconPosition()
        return

      case 'walking_to_water_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const qSprite = this.nirv.sprite
        this.nirv.updateAnimation(qSprite.body!.velocity.x, qSprite.body!.velocity.y)
        return
      }

      case 'waiting_at_water_queue':
        this.nirv.updateAnimation(0, 0)
        return

      case 'drinking_water':
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.finishDrinkingWater()
        return

      case 'walking_to_toilet': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const toilSprite = this.nirv.sprite
        this.nirv.updateAnimation(toilSprite.body!.velocity.x, toilSprite.body!.velocity.y)
        return
      }

      case 'walking_to_toilet_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const tqSprite = this.nirv.sprite
        this.nirv.updateAnimation(tqSprite.body!.velocity.x, tqSprite.body!.velocity.y)
        return
      }

      case 'waiting_at_toilet_queue':
        this.nirv.updateAnimation(0, 0)
        return

      case 'using_toilet':
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        if (this.seatTimer <= 0) this.finishUsingToilet()
        return

      case 'walking_to_snack': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const snSprite = this.nirv.sprite
        this.nirv.updateAnimation(snSprite.body!.velocity.x, snSprite.body!.velocity.y)
        return
      }

      case 'walking_to_snack_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const sqSprite = this.nirv.sprite
        this.nirv.updateAnimation(sqSprite.body!.velocity.x, sqSprite.body!.velocity.y)
        return
      }

      case 'waiting_at_snack_queue':
        this.nirv.updateAnimation(0, 0)
        return

      case 'snack_interact':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.beginSatiationWander()
        return

      case 'fruit_interact':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.beginSatiationWander()
        return

      case 'walking_to_fruit': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const frSprite = this.nirv.sprite
        this.nirv.updateAnimation(frSprite.body!.velocity.x, frSprite.body!.velocity.y)
        return
      }

      case 'walking_to_fruit_queue': {
        if (!this.redirectTarget) {
          this._state = 'walking'
          this.computePathToWaypoint()
          return
        }
        this.followPath()
        const fqSprite = this.nirv.sprite
        this.nirv.updateAnimation(fqSprite.body!.velocity.x, fqSprite.body!.velocity.y)
        return
      }

      case 'waiting_at_fruit_queue':
        this.nirv.updateAnimation(0, 0)
        return

      case 'snack_wander': {
        if (!this.redirectTarget) {
          this.abortSatiationMidFlow()
          return
        }
        this.followPath()
        const swSprite = this.nirv.sprite
        this.nirv.updateAnimation(swSprite.body!.velocity.x, swSprite.body!.velocity.y)
        const swd = Phaser.Math.Distance.Between(
          swSprite.x, swSprite.y,
          this.redirectTarget.x, this.redirectTarget.y,
        )
        if (swd < CHAIR_ARRIVAL_THRESHOLD) {
          swSprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          this.redirectTarget = null
          this._state = 'snack_eat'
          this.seatTimer = Phaser.Math.Between(1000, 4000)
          this.eatingColor = 0xcc8844
          this.showStatusIcon()
        }
        return
      }

      case 'fruit_wander': {
        if (!this.redirectTarget) {
          this.abortSatiationMidFlow()
          return
        }
        this.followPath()
        const fwSprite = this.nirv.sprite
        this.nirv.updateAnimation(fwSprite.body!.velocity.x, fwSprite.body!.velocity.y)
        const fwd = Phaser.Math.Distance.Between(
          fwSprite.x, fwSprite.y,
          this.redirectTarget.x, this.redirectTarget.y,
        )
        if (fwd < CHAIR_ARRIVAL_THRESHOLD) {
          fwSprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          this.redirectTarget = null
          this._state = 'fruit_eat'
          this.seatTimer = Phaser.Math.Between(1000, 4000)
          this.eatingColor = 0x66aa44
          this.showStatusIcon()
        }
        return
      }

      case 'snack_eat':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.finishSatiationEating()
        return

      case 'fruit_eat':
        this.snackBubblePhase += delta
        this.nirv.updateAnimation(0, 0)
        this.seatTimer -= delta
        this.updateStatusIconPosition()
        if (this.seatTimer <= 0) this.finishSatiationEating()
        return

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

      case 'walking_to_stage':
      case 'walking_to_perform': {
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
          this.redirectTarget.x, this.redirectTarget.y,
        )
        if (dist < ARRIVAL_THRESHOLD) {
          sprite.setVelocity(0, 0)
          this.nirv.updateAnimation(0, 0)
          this.path = []
          if (this._state === 'walking_to_stage') {
            this._state = 'watching_stage'
            this.stageEarlyLeaveAccum = 0
          } else {
            sprite.setPosition(this.redirectTarget.x, this.redirectTarget.y)
            this._state = 'performing_on_stage'
          }
        }
        return
      }

      case 'performing_on_stage':
        this.nirv.updateAnimation(0, 0)
        return

      case 'watching_stage':
        this.nirv.updateAnimation(0, 0)
        this.funWatchAccumMs += delta
        while (this.funWatchAccumMs >= FUN_WATCH_TICK_MS) {
          this.funWatchAccumMs -= FUN_WATCH_TICK_MS
          this.nirv.addFun(this.watchInterestMatch ? FUN_GAIN_MATCH : FUN_GAIN_NO_MATCH)
        }
        this.stageEarlyLeaveAccum += delta
        if (this.stageEarlyLeaveAccum >= EARLY_LEAVE_CHECK_INTERVAL_MS) {
          this.stageEarlyLeaveAccum = 0
          if (rollLeaveEarly(this.stageWatchAffinity)) this.leaveStage()
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

  private computePathToPixel(
    px: number,
    py: number,
    endCell: { gx: number; gy: number } | null = null,
  ): void {
    const sprite = this.nirv.sprite
    const start = screenToGrid(sprite.x, sprite.y)
    let endGX: number
    let endGY: number

    if (endCell && this.performInterior) {
      const r = this.pathfinder.resolveStagePerformGoal(
        endCell.gx, endCell.gy, this.performInterior,
      )
      if (!r) {
        this.path = []
        this.pathNodeIndex = 0
        return
      }
      this.pathEndCell = r
      this.redirectTarget = gridToScreen(r.gx, r.gy)
      endGX = r.gx
      endGY = r.gy
    } else if (endCell) {
      this.pathEndCell = endCell
      endGX = endCell.gx
      endGY = endCell.gy
    } else {
      this.pathEndCell = null
      const end = screenToGrid(px, py)
      endGX = Math.round(end.gx)
      endGY = Math.round(end.gy)
    }

    this.path = this.pathfinder.findPath(
      Math.round(start.gx),
      Math.round(start.gy),
      endGX,
      endGY,
    ) ?? []
    this.pathNodeIndex = 0
  }

  private followPath(): void {
    const sprite = this.nirv.sprite

    // Stuck detection: if barely moved, try recovery
    const moved = Phaser.Math.Distance.Between(sprite.x, sprite.y, this.prevX, this.prevY)
    if (moved < 1) {
      this.stuckFrames++
    } else {
      this.stuckFrames = 0
    }
    this.prevX = sprite.x
    this.prevY = sprite.y

    if (this.stuckFrames > 15 && this.pathNodeIndex < this.path.length) {
      // Skip current node
      this.pathNodeIndex++
      this.stuckFrames = 0
    }
    if (this.stuckFrames > 45) {
      // Stuck too long — recompute entire path from current position
      this.stuckFrames = 0
      if (this._state === 'walking') {
        this.computePathToWaypoint()
      } else if ((this._state === 'walking_to_chair' || this._state === 'walking_to_water' || this._state === 'walking_to_water_queue' || this._state === 'walking_to_toilet' || this._state === 'walking_to_toilet_queue' || this._state === 'walking_to_snack' || this._state === 'walking_to_snack_queue' || this._state === 'snack_wander' || this._state === 'walking_to_fruit' || this._state === 'walking_to_fruit_queue' || this._state === 'fruit_wander' || this._state === 'walking_to_bed' || this._state === 'walking_to_stage' || this._state === 'walking_to_perform') && this.redirectTarget) {
        this.computePathToPixel(this.redirectTarget.x, this.redirectTarget.y, this.pathEndCell)
      }
    }

    if (this.pathNodeIndex >= this.path.length) {
      // Path exhausted — move directly toward final destination
      if (this._state === 'walking') {
        const target = this.waypoints[this.currentIndex]
        const dest = gridToScreen(target.gridX, target.gridY)
        this.moveToward(dest.x, dest.y)
      } else if ((this._state === 'walking_to_chair' || this._state === 'walking_to_water' || this._state === 'walking_to_water_queue' || this._state === 'walking_to_toilet' || this._state === 'walking_to_toilet_queue' || this._state === 'walking_to_snack' || this._state === 'walking_to_snack_queue' || this._state === 'snack_wander' || this._state === 'walking_to_fruit' || this._state === 'walking_to_fruit_queue' || this._state === 'fruit_wander' || this._state === 'walking_to_bed' || this._state === 'walking_to_stage' || this._state === 'walking_to_perform') && this.redirectTarget) {
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
    gfx.setDepth(DEPTH_UI + 5)
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

    if (this._state !== 'sleeping') {
      this.sleepZText?.setVisible(false)
    }

    const bubbleW = this._state === 'sleeping' ? 46 : 28
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillRoundedRect(bx - bubbleW / 2, by - 10, bubbleW, 16, 4)

    if (this._state === 'eating') {
      // Food colored circle
      gfx.fillStyle(this.eatingColor)
      gfx.fillCircle(bx, by - 2, 5)
      gfx.lineStyle(1, 0x666666)
      gfx.strokeCircle(bx, by - 2, 5)
    } else if (this._state === 'drinking_water') {
      gfx.fillStyle(0x88ccff)
      gfx.fillRect(bx - 4, by - 8, 8, 10)
      gfx.lineStyle(1, 0x5599bb)
      gfx.strokeRect(bx - 4, by - 8, 8, 10)
    } else if (this._state === 'snack_interact') {
      const pulse = 0.75 + 0.25 * Math.sin(this.snackBubblePhase / 180)
      gfx.fillStyle(0x8b6914, pulse)
      gfx.fillRoundedRect(bx - 8, by - 8, 16, 12, 2)
      gfx.lineStyle(1, 0x5c4a26, pulse)
      gfx.strokeRoundedRect(bx - 8, by - 8, 16, 12, 2)
      gfx.fillStyle(0x333333, pulse)
      gfx.fillRect(bx - 5, by - 4, 10, 2)
    } else if (this._state === 'snack_eat' || this._state === 'fruit_eat') {
      const pulse = 0.85 + 0.15 * Math.sin(this.snackBubblePhase / 220)
      gfx.fillStyle(this.eatingColor, pulse)
      gfx.fillCircle(bx, by - 2, 5)
      gfx.lineStyle(1, 0x666666, pulse)
      gfx.strokeCircle(bx, by - 2, 5)
    } else if (this._state === 'fruit_interact') {
      const pulse = 0.75 + 0.25 * Math.sin(this.snackBubblePhase / 180)
      gfx.fillStyle(0x5a8c3a, pulse)
      gfx.fillRoundedRect(bx - 9, by - 8, 18, 12, 2)
      gfx.lineStyle(1, 0x3a5c2a, pulse)
      gfx.strokeRoundedRect(bx - 9, by - 8, 18, 12, 2)
    } else if (this._state === 'sleeping') {
      if (!this.sleepZText) {
        this.sleepZText = this.scene.add.text(bx, by - 4, 'Z z Z', {
          fontSize: '11px',
          color: '#333333',
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(DEPTH_UI + 6)
      }
      this.sleepZText.setPosition(bx, by - 4)
      this.sleepZText.setVisible(true)
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
    if (this.sleepZText) {
      this.sleepZText.destroy()
      this.sleepZText = null
    }
  }

  private finishDrinkingWater(): void {
    this.nirv.addHydration(30)
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  private finishUsingToilet(): void {
    this.nirv.resetBladderAfterUse()
    this.nirv.exitToilet()
    this.hideStatusIcon()
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  private beginSatiationWander(): void {
    if (!this.satiationAnchor) {
      this.abortSatiationMidFlow()
      return
    }
    this.hideStatusIcon()
    const sx = this.satiationAnchor.x
    const sy = this.satiationAnchor.y
    const tx = sx + Phaser.Math.Between(-70, 70)
    const ty = sy + Phaser.Math.Between(45, 110)
    this.redirectTarget = { x: tx, y: ty }
    if (this._state === 'snack_interact') this._state = 'snack_wander'
    else if (this._state === 'fruit_interact') this._state = 'fruit_wander'
    this.computePathToPixel(tx, ty)
  }

  private finishSatiationEating(): void {
    this.nirv.addSatiation(20)
    this.hideStatusIcon()
    this.satiationAnchor = null
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }

  /** Satiation flow broke (no station ref); no reward. */
  private abortSatiationMidFlow(): void {
    this.hideStatusIcon()
    this.satiationAnchor = null
    this._state = 'walking'
    this.redirectTarget = null
    this.path = []
    this.nirv.sprite.setVelocity(0, 0)
    this.computePathToWaypoint()
  }
}
