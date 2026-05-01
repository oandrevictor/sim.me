import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Building } from '../entities/Building'
import type { Stage } from '../entities/Stage'
import type { DayPhase } from './DayNightSystem'
import type { RelationshipSystem } from './RelationshipSystem'
import type { StageSystem } from './StageSystem'

// ─── Tuning ───────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS   = 4000
const MAX_DANCE_SIZE      = 4
const MAX_PICNIC_SIZE     = 4
const MAX_GAME_SIZE       = 4
const MIN_DANCE_SIZE      = 2
const MIN_PICNIC_SIZE     = 3
const MIN_GAME_SIZE       = 2

const DANCE_TICK_MS       = 5000
const PICNIC_TICK_MS      = 6000
const GAME_TICK_MS        = 8000

const PICNIC_DURATION_MS  = 30_000
const GAME_DURATION_MS    = 45_000

const DANCE_FUN_GAIN      = 8
const DANCE_SOCIAL_GAIN   = 4
const PICNIC_FUN_GAIN     = 6
const PICNIC_SOCIAL_GAIN  = 8
const PICNIC_SATIATION    = 12
const GAME_FUN_GAIN       = 10
const GAME_SOCIAL_GAIN    = 10

/** Radius around a table where bots must be to join a picnic. */
const PICNIC_RANGE_PX     = 120
/** Night phase check: dance floor only active at dusk or night. */
const NIGHT_PHASES: DayPhase[] = ['dusk', 'night']

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = 'dance' | 'picnic' | 'game_night'

interface GroupSession {
  type: ActivityType
  bots: BotNirv[]
  tickAccumMs: number
  /** Total elapsed ms — picnic/game_night have fixed durations. */
  elapsedMs: number
  durationMs: number
  /** Stage ID for dance sessions (so we can stop if performance ends). */
  stageId?: string
  /** Building ID for game_night sessions. */
  buildingId?: string
}

/**
 * Manages structured group activities for 3+ bots:
 *  - Dance Floor: watching_stage bots → dancing during dusk/night
 *  - Picnic: idle bots near a free table during day/golden_hour
 *  - Game Night: inside_house friends playing board games
 *
 * Responsibilities: recruit bots, tick need gains, fire relationship bonuses.
 */
export class GroupActivitySystem {
  private sessions: GroupSession[] = []
  private checkAccum = 0
  private relationshipSystem: RelationshipSystem | null = null

  constructor(
    private readonly bots: BotNirv[],
    private readonly stages: Stage[],
    private readonly buildings: Building[],
    private readonly getStageSystem: () => StageSystem,
    private readonly getTables: () => { x: number; y: number }[],
  ) {}

  setRelationshipSystem(rs: RelationshipSystem): void { this.relationshipSystem = rs }

  update(delta: number, phase: DayPhase): void {
    this.tickSessions(delta, phase)

    this.checkAccum += delta
    if (this.checkAccum < CHECK_INTERVAL_MS) return
    this.checkAccum = 0

    this.tryStartDanceSessions(phase)
    this.tryStartPicnicSessions(phase)
    this.tryStartGameNightSessions()
  }

  // ─── Tick active sessions ────────────────────────────────────────────────────

  private tickSessions(delta: number, phase: DayPhase): void {
    this.sessions = this.sessions.filter(session => {
      // Remove sessions with bots that left their activity state
      session.bots = session.bots.filter(b => this.isInState(b, session.type))
      if (session.bots.length < this.minSize(session.type)) {
        this.dissolveSession(session)
        return false
      }

      // Dance floor ends when performance stops or it becomes day
      if (session.type === 'dance') {
        const ss = this.getStageSystem()
        const stillActive = session.stageId && ss.getStageAttraction(session.stageId) !== null
        if (!stillActive || !NIGHT_PHASES.includes(phase)) {
          this.dissolveSession(session)
          return false
        }
      }

      // Fixed-duration activities expire
      if (session.type !== 'dance') {
        session.elapsedMs += delta
        if (session.elapsedMs >= session.durationMs) {
          this.dissolveSession(session)
          return false
        }
      }

      // Periodic need + relationship tick
      session.tickAccumMs += delta
      const tickMs = this.tickInterval(session.type)
      if (session.tickAccumMs >= tickMs) {
        session.tickAccumMs -= tickMs
        this.applyTick(session)
      }
      return true
    })
  }

  private dissolveSession(session: GroupSession): void {
    for (const bot of session.bots) {
      if (session.type === 'dance')      bot.leaveDancing?.()
      if (session.type === 'picnic')     bot.leavePicnicking?.()
      if (session.type === 'game_night') bot.leaveGameNight?.()
    }
  }

  private applyTick(session: GroupSession): void {
    for (const bot of session.bots) {
      if (session.type === 'dance') {
        bot.nirv.addFun(DANCE_FUN_GAIN)
        bot.nirv.relieveSocialNeed(DANCE_SOCIAL_GAIN)
      } else if (session.type === 'picnic') {
        bot.nirv.addFun(PICNIC_FUN_GAIN)
        bot.nirv.relieveSocialNeed(PICNIC_SOCIAL_GAIN)
        bot.nirv.addSatiation(PICNIC_SATIATION)
      } else {
        bot.nirv.addFun(GAME_FUN_GAIN)
        bot.nirv.relieveSocialNeed(GAME_SOCIAL_GAIN)
      }
    }
    // Group relationship tick — activities build stronger bonds than 1-on-1 chat
    const activityBonus = session.type === 'game_night' ? 2 : 1
    this.relationshipSystem?.handleGroupTick(session.bots, activityBonus)

    // Show a brief chat bubble on one random bot to signal the activity
    const pick = session.bots[Math.floor(Math.random() * session.bots.length)]
    const bubble = session.type === 'dance' ? '🕺' : session.type === 'picnic' ? '🧺' : '🎲'
    pick?.nirv.showChatBubble?.(bubble)
  }

  // ─── Dance Floor ─────────────────────────────────────────────────────────────

  private tryStartDanceSessions(phase: DayPhase): void {
    if (!NIGHT_PHASES.includes(phase)) return

    const inSession = this.botsInAnySessions()

    for (const stage of this.stages) {
      const ss = this.getStageSystem()
      if (!ss.getStageAttraction(stage.id)) continue

      // Find watching_stage bots at this stage not already in a session
      const candidates = this.bots.filter(b =>
        b.state === 'watching_stage' &&
        b.stageId === stage.id &&
        !inSession.has(b.id),
      )
      if (candidates.length < MIN_DANCE_SIZE) continue

      const group = candidates.slice(0, MAX_DANCE_SIZE)
      for (const bot of group) bot.enterDancing?.()
      this.sessions.push({
        type: 'dance',
        bots: group,
        tickAccumMs: 0,
        elapsedMs: 0,
        durationMs: Infinity,
        stageId: stage.id,
      })
    }
  }

  // ─── Picnic ───────────────────────────────────────────────────────────────────

  private tryStartPicnicSessions(phase: DayPhase): void {
    if (phase === 'night' || phase === 'dusk') return   // picnics are daytime

    const inSession = this.botsInAnySessions()
    const tables = this.getTables()
    if (tables.length === 0) return

    for (const table of tables) {
      const near = this.bots.filter(b =>
        (b.state === 'waiting' || b.state === 'seated') &&
        !inSession.has(b.id) &&
        Phaser.Math.Distance.Between(b.nirv.sprite.x, b.nirv.sprite.y, table.x, table.y) < PICNIC_RANGE_PX,
      )
      if (near.length < MIN_PICNIC_SIZE) continue

      const group = near.slice(0, MAX_PICNIC_SIZE)
      for (const bot of group) bot.enterPicnicking?.()
      this.sessions.push({
        type: 'picnic',
        bots: group,
        tickAccumMs: 0,
        elapsedMs: 0,
        durationMs: PICNIC_DURATION_MS,
      })
      break // one picnic per scan pass
    }
  }

  // ─── Game Night ───────────────────────────────────────────────────────────────

  private tryStartGameNightSessions(): void {
    const inSession = this.botsInAnySessions()
    const activeGameHouses = new Set(
      this.sessions.filter(s => s.type === 'game_night').map(s => s.buildingId),
    )

    for (const building of this.buildings) {
      if (building.type !== 'house') continue
      if (activeGameHouses.has(building.id)) continue

      const inside = this.bots.filter(b =>
        (b.state === 'inside_house' || b.state === 'game_night') &&
        b.houseId === building.id &&
        !inSession.has(b.id),
      )
      if (inside.length < MIN_GAME_SIZE) continue

      // Require at least one friend-tier pair
      if (!this.hasAtLeastOneFriendPair(inside)) continue

      const group = inside.slice(0, MAX_GAME_SIZE)
      for (const bot of group) bot.enterGameNight?.()
      this.sessions.push({
        type: 'game_night',
        bots: group,
        tickAccumMs: 0,
        elapsedMs: 0,
        durationMs: GAME_DURATION_MS,
        buildingId: building.id,
      })
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private botsInAnySessions(): Set<string> {
    const ids = new Set<string>()
    for (const s of this.sessions) for (const b of s.bots) ids.add(b.id)
    return ids
  }

  private isInState(bot: BotNirv, type: ActivityType): boolean {
    if (type === 'dance')      return bot.state === 'dancing'
    if (type === 'picnic')     return bot.state === 'picnicking'
    if (type === 'game_night') return bot.state === 'game_night'
    return false
  }

  private minSize(type: ActivityType): number {
    if (type === 'dance')      return MIN_DANCE_SIZE
    if (type === 'picnic')     return MIN_PICNIC_SIZE
    return MIN_GAME_SIZE
  }

  private tickInterval(type: ActivityType): number {
    if (type === 'dance')      return DANCE_TICK_MS
    if (type === 'picnic')     return PICNIC_TICK_MS
    return GAME_TICK_MS
  }

  private hasAtLeastOneFriendPair(bots: BotNirv[]): boolean {
    if (!this.relationshipSystem) return true // no RS = open to all
    const FRIEND_STAGES = new Set(['friend', 'lover', 'dating', 'engaged', 'married'])
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) {
        const stage = this.relationshipSystem.getRelationshipStage(bots[i]!.id, bots[j]!.id)
        if (stage && FRIEND_STAGES.has(stage)) return true
      }
    }
    return false
  }
}
