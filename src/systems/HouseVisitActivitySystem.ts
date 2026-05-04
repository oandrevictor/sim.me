import type { BotNirv } from '../entities/BotNirv'
import type { RelationshipSystem } from './RelationshipSystem'

const ACTIVITY_TICK_MS = 3_500
const SESSION_DURATION_MS = 20_000
const CHAT_SOCIAL_GAIN = 5
const GAME_SOCIAL_GAIN = 4
const GAME_FUN_GAIN = 8

const CHAT_LINES: [string, string][] = [
  ['Good to see you.', 'Thanks for having me over.'],
  ['This place feels cozy.', 'I have been fixing it up.'],
  ['How have you been?', 'Better now that you are here.'],
]

const GAME_LINES: [string, string][] = [
  ['Want to play?', 'Only if I get first pick.'],
  ['One more round?', 'You are on.'],
  ['Nice combo.', 'Wait until the next level.'],
]

type VisitSession = {
  owner: BotNirv
  visitor: BotNirv
  houseId: string
  elapsedMs: number
  tickMs: number
  activityIndex: number
  sharedInterestCount: number
  firstMeeting: boolean
}

export class HouseVisitActivitySystem {
  private readonly sessions = new Map<string, VisitSession>()
  private readonly completedVisitors = new Set<string>()
  private relationshipSystem: RelationshipSystem | null = null

  constructor(private readonly bots: readonly BotNirv[]) {}

  setRelationshipSystem(system: RelationshipSystem): void {
    this.relationshipSystem = system
  }

  update(delta: number): void {
    this.clearCompletedVisitorsThatLeft()
    this.startNewSessions()
    this.tickSessions(delta)
  }

  private startNewSessions(): void {
    for (const visitor of this.bots) {
      if (!this.canVisit(visitor) || this.sessions.has(visitor.id) || this.completedVisitors.has(visitor.id)) continue
      const owner = this.findOwner(visitor)
      if (!owner) continue
      this.sessions.set(visitor.id, this.createSession(owner, visitor))
    }
  }

  private tickSessions(delta: number): void {
    for (const [visitorId, session] of this.sessions) {
      if (!this.isSessionActive(session)) {
        this.endSession(visitorId, session)
        continue
      }

      session.elapsedMs += delta
      session.tickMs += delta
      session.owner.nirv.syncChatBubblePosition()
      session.visitor.nirv.syncChatBubblePosition()

      if (session.elapsedMs >= SESSION_DURATION_MS) {
        this.endSession(visitorId, session)
        this.completedVisitors.add(visitorId)
        continue
      }
      if (session.tickMs < ACTIVITY_TICK_MS) continue

      session.tickMs = 0
      this.applyActivityTick(session)
    }
  }

  private createSession(owner: BotNirv, visitor: BotNirv): VisitSession {
    const firstMeeting = !owner.nirv.knowsNirv(visitor.nirv.name) && !visitor.nirv.knowsNirv(owner.nirv.name)
    owner.nirv.rememberKnownNirv(visitor.nirv.name)
    visitor.nirv.rememberKnownNirv(owner.nirv.name)
    return {
      owner,
      visitor,
      houseId: visitor.houseId!,
      elapsedMs: 0,
      tickMs: ACTIVITY_TICK_MS,
      activityIndex: 0,
      sharedInterestCount: this.sharedInterestCount(owner, visitor),
      firstMeeting,
    }
  }

  private applyActivityTick(session: VisitSession): void {
    const isGame = session.activityIndex % 2 === 1
    const [ownerLine, visitorLine] = this.pickLine(isGame ? GAME_LINES : CHAT_LINES)
    session.owner.nirv.showChatBubble(ownerLine)
    session.visitor.nirv.showChatBubble(visitorLine)

    if (isGame) {
      session.owner.nirv.addFun(GAME_FUN_GAIN)
      session.visitor.nirv.addFun(GAME_FUN_GAIN)
      session.owner.nirv.relieveSocialNeed(GAME_SOCIAL_GAIN)
      session.visitor.nirv.relieveSocialNeed(GAME_SOCIAL_GAIN)
    } else {
      session.owner.nirv.relieveSocialNeed(CHAT_SOCIAL_GAIN)
      session.visitor.nirv.relieveSocialNeed(CHAT_SOCIAL_GAIN)
    }

    this.relationshipSystem?.handleChatTick(session.owner, session.visitor, {
      sharedInterestCount: session.sharedInterestCount + (isGame ? 1 : 0),
      firstMeeting: session.firstMeeting,
    })
    session.firstMeeting = false
    session.activityIndex++
  }

  private endSession(visitorId: string, session: VisitSession): void {
    session.owner.nirv.hideChatBubble()
    session.visitor.nirv.hideChatBubble()
    this.sessions.delete(visitorId)
  }

  private clearCompletedVisitorsThatLeft(): void {
    for (const visitorId of this.completedVisitors) {
      const visitor = this.bots.find(b => b.id === visitorId)
      if (!visitor || !this.canVisit(visitor)) this.completedVisitors.delete(visitorId)
    }
  }

  private isSessionActive(session: VisitSession): boolean {
    return this.canVisit(session.owner) &&
      this.canVisit(session.visitor) &&
      session.owner.houseMode === 'owner' &&
      session.owner.houseId === session.houseId &&
      session.visitor.houseMode === 'visitor' &&
      session.visitor.houseId === session.houseId
  }

  private canVisit(bot: BotNirv): boolean {
    return bot.state === 'inside_house' && !!bot.houseId
  }

  private findOwner(visitor: BotNirv): BotNirv | null {
    return this.bots.find(bot =>
      bot.id === visitor.houseHostBotId &&
      bot.houseId === visitor.houseId &&
      bot.houseMode === 'owner' &&
      bot.state === 'inside_house',
    ) ?? null
  }

  private sharedInterestCount(a: BotNirv, b: BotNirv): number {
    let count = 0
    for (const tag of a.interests) if (b.interests.includes(tag)) count++
    return count
  }

  private pickLine(lines: [string, string][]): [string, string] {
    return lines[Math.floor(Math.random() * lines.length)] ?? lines[0]!
  }
}
