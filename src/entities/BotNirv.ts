// @ts-nocheck
import Phaser from 'phaser'
import { Nirv, type NirvVariant } from './Nirv'
import { type ScheduleWaypoint } from './NirvSchedule'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { gridToScreen } from '../utils/isoGrid'
import type { MusicTag } from '../data/musicTags'
import type { NirvProfession } from '../data/professions'
import { type BotState } from './botStates'

export type { BotState } from './botStates'
export { isFarmerState, isHouseState, isRestaurantStaffState, isStockerState, isWorkJobState } from './botStates'

const FUN_WATCH_TICK_MS = 10_000
const FUN_GAIN_MATCH = 10
const FUN_GAIN_NO_MATCH = 5

const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 24
const CHAIR_ARRIVAL_THRESHOLD = 32

import { installBotNirvNeedActions } from './BotNirvNeedActions'
import { installBotNirvWorkActions } from './BotNirvWorkActions'
import { installBotNirvFoodActions } from './BotNirvFoodActions'
import { installBotNirvUpdate } from './BotNirvUpdate'
import { installBotNirvMovement } from './BotNirvMovement'
import { installBotNirvPathPlanning } from './BotNirvPathPlanning'
import { installBotNirvStatusIcon } from './BotNirvStatusIcon'
import { installBotNirvSatiationActions } from './BotNirvSatiationActions'

export interface BotNirv { [key: string]: any }

export class BotNirv {
  readonly id: string
  readonly profession: NirvProfession
  readonly interests: readonly MusicTag[]
  readonly performerTags: readonly MusicTag[]
  readonly jealousyTendencyMultiplier: number
  readonly badMoodEffect: number
  readonly crowdThreshold: number
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
  /** Restaurant footprint: path goal never escapes this rect (unlike stage, no world fallback). */
  private restaurantInteriorBounds: StageInteriorBounds | null = null
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
  private pathFailed = false
  private pathResolvedEndCell: { gx: number; gy: number } | null = null
  private prevX = 0
  private prevY = 0
  private stuckFrames = 0
  /** Waiter carrying a plate from counter to table (chef clears after staging on counter). */
  private staffCarriedRecipeId: string | null = null

  /** ID of the stage this bot is walking to or watching (null otherwise) */
  stageId: string | null = null
  houseId: string | null = null
  houseMode: 'claim' | 'owner' | 'visitor' | null = null
  houseHostBotId: string | null = null

  get state(): BotState { return this._state }

  /** Number of distinct cells the bot has gotten stuck at on the current journey (0 = not stuck). */
  getStuckCellCount(): number { return (this as any).stuckAtCells?.length ?? 0 }

  /** Active path goal for walking_* / staff job states (read-only for coordinators). */
  getWalkRedirectTarget(): { x: number; y: number } | null {
    return this.redirectTarget
  }

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
    const traitSeed = hashToUnitFloat(botId)
    this.jealousyTendencyMultiplier = 0.65 + traitSeed * 0.9
    this.badMoodEffect = 0.7 + hashToUnitFloat(`${botId}:mood`) * 0.8
    this.crowdThreshold = 14 + Math.round(hashToUnitFloat(`${botId}:crowd`) * 22)
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


}

function hashToUnitFloat(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}


installBotNirvNeedActions(BotNirv)
installBotNirvFoodActions(BotNirv)
installBotNirvWorkActions(BotNirv)
installBotNirvUpdate(BotNirv)
installBotNirvPathPlanning(BotNirv)
installBotNirvMovement(BotNirv)
installBotNirvStatusIcon(BotNirv)
installBotNirvSatiationActions(BotNirv)
