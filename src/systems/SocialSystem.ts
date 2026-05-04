import Phaser from 'phaser'
import type { BotNirv, BotState } from '../entities/BotNirv'
import type { MusicTag } from '../data/musicTags'
import type { RelationshipSystem } from './RelationshipSystem'
import { getMoodSocialModifier } from './MoodSystem'
import { debugLog } from '../debug/DebugLogger'
import { botPairDebugFields } from '../debug/debugActor'
import { pickSocialChatLines } from './socialChatLines'

const SOCIAL_SCAN_INTERVAL_MS = 2000
const CHAT_TICK_MS = 2000
const START_CHAT_DISTANCE_PX = 84
const KEEP_CHAT_DISTANCE_PX = 112

const ELIGIBLE_STATES = new Set<BotState>([
  'waiting',
  'seated',
  'awaiting_service',
  'eating',
  'watching_stage',
  'drinking_water',
  'waiting_at_water_queue',
  'snack_interact',
  'snack_eat',
  'waiting_at_snack_queue',
  'fruit_interact',
  'fruit_eat',
  'waiting_at_fruit_queue',
  'waiting_at_toilet_queue',
  'farmer_idle',
  'farmer_to_crop',
  'farmer_working',
])

type ChatSession = {
  a: BotNirv
  b: BotNirv
  accumMs: number
  reliefPerTick: number
  sharedInterest: MusicTag | null
  sharedInterestCount: number
  firstMeeting: boolean
}

export type ChatTickListener = (
  a: BotNirv,
  b: BotNirv,
  ctx: { sharedInterest: MusicTag | null; sharedInterestCount: number; firstMeeting: boolean },
) => void

export class SocialSystem {
  private scanAccum = 0
  private chats = new Map<string, ChatSession>()
  private chatTickListeners: ChatTickListener[] = []
  private relationshipSystem: RelationshipSystem | null = null

  constructor(private readonly bots: readonly BotNirv[]) {}

  onChatTick(listener: ChatTickListener): void {
    this.chatTickListeners.push(listener)
  }

  setRelationshipSystem(relationshipSystem: RelationshipSystem): void {
    this.relationshipSystem = relationshipSystem
  }

  update(delta: number): void {
    this.advanceChats(delta)
    this.scanAccum += delta
    if (this.scanAccum < SOCIAL_SCAN_INTERVAL_MS) return
    this.scanAccum = 0
    this.tryStartChats()
  }

  private advanceChats(delta: number): void {
    for (const [key, chat] of this.chats) {
      if (!this.canContinue(chat.a, chat.b)) {
        this.endChat(key, chat, this.endReason(chat.a, chat.b))
        continue
      }
      chat.a.nirv.syncChatBubblePosition()
      chat.b.nirv.syncChatBubblePosition()
      chat.accumMs += delta
      while (chat.accumMs >= CHAT_TICK_MS) {
        chat.accumMs -= CHAT_TICK_MS
        chat.a.nirv.relieveSocialNeed(chat.reliefPerTick)
        chat.b.nirv.relieveSocialNeed(chat.reliefPerTick)
        this.applyChatLines(chat)
        const ctx = {
          sharedInterest: chat.sharedInterest,
          sharedInterestCount: chat.sharedInterestCount,
          firstMeeting: chat.firstMeeting,
        }
        for (const listener of this.chatTickListeners) listener(chat.a, chat.b, ctx)
        debugLog.log('social.chat_tick', {
          ...botPairDebugFields(chat.a, chat.b),
          sharedInterest: chat.sharedInterest ?? '',
          sharedInterestCount: chat.sharedInterestCount,
          firstMeeting: chat.firstMeeting,
          reliefPerTick: chat.reliefPerTick,
        })
        this.relationshipSystem?.registerJealousyExposure(chat.a.id, chat.b.id, 0.35)
        this.relationshipSystem?.registerJealousyExposure(chat.b.id, chat.a.id, 0.35)
        // novelty bonus only fires on the first tick after meeting
        chat.firstMeeting = false
      }
    }
  }

  private tryStartChats(): void {
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i]
      if (!a || this.isChatting(a) || !this.canStartChat(a)) continue
      const candidates: { bot: BotNirv; score: number }[] = []
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j]
        if (!b || this.isChatting(b) || !this.canStartChat(b)) continue
        if (!this.isWithinDistance(a, b, START_CHAT_DISTANCE_PX)) continue
        const chance = this.startChance(a, b)
        if (Math.random() > chance) continue
        candidates.push({ bot: b, score: chance })
      }
      const pick = this.pickWeightedChatCandidate(candidates)
      if (!pick) continue
      this.startChat(a, pick)
      break
    }
  }

  private pickWeightedChatCandidate(candidates: { bot: BotNirv; score: number }[]): BotNirv | null {
    if (candidates.length === 0) return null
    let total = 0
    for (const c of candidates) total += Math.max(0.01, c.score)
    let roll = Math.random() * total
    for (const c of candidates) {
      roll -= Math.max(0.01, c.score)
      if (roll <= 0) return c.bot
    }
    return candidates[candidates.length - 1]?.bot ?? null
  }

  private startChat(a: BotNirv, b: BotNirv): void {
    const alreadyKnown = a.nirv.knowsNirv(b.nirv.name) || b.nirv.knowsNirv(a.nirv.name)
    const sharedInterest = this.findSharedInterest(a.interests, b.interests)
    const sharedInterestCount = this.countSharedInterests(a.interests, b.interests)
    a.nirv.rememberKnownNirv(b.nirv.name)
    b.nirv.rememberKnownNirv(a.nirv.name)
    const chat: ChatSession = {
      a,
      b,
      accumMs: 0,
      reliefPerTick: (alreadyKnown ? 5 : 10) + (sharedInterest ? 5 : 0),
      sharedInterest,
      sharedInterestCount,
      firstMeeting: !alreadyKnown,
    }
    this.chats.set(this.chatKey(a, b), chat)
    this.applyChatLines(chat)
    debugLog.log('social.chat_start', {
      ...botPairDebugFields(a, b),
      sharedInterest: sharedInterest ?? '',
      sharedInterestCount,
      firstMeeting: !alreadyKnown,
      reliefPerTick: chat.reliefPerTick,
    }, 'info')
  }

  private applyChatLines(chat: ChatSession): void {
    const [lineA, lineB] = pickSocialChatLines(chat)
    chat.a.nirv.showChatBubble(lineA)
    chat.b.nirv.showChatBubble(lineB)
  }

  private endChat(key: string, chat: ChatSession, reason: string): void {
    this.chats.delete(key)
    chat.a.nirv.hideChatBubble()
    chat.b.nirv.hideChatBubble()
    debugLog.log('social.chat_end', {
      ...botPairDebugFields(chat.a, chat.b),
      reason,
      sharedInterest: chat.sharedInterest ?? '',
      sharedInterestCount: chat.sharedInterestCount,
    }, 'info')
  }

  private canStartChat(bot: BotNirv): boolean {
    return ELIGIBLE_STATES.has(bot.state) && bot.nirv.sprite.visible
  }

  private canContinue(a: BotNirv, b: BotNirv): boolean {
    return this.canStartChat(a) && this.canStartChat(b) && this.isWithinDistance(a, b, KEEP_CHAT_DISTANCE_PX)
  }

  private isChatting(bot: BotNirv): boolean {
    for (const chat of this.chats.values()) {
      if (chat.a === bot || chat.b === bot) return true
    }
    return false
  }

  private isWithinDistance(a: BotNirv, b: BotNirv, distance: number): boolean {
    return Phaser.Math.Distance.Between(a.nirv.sprite.x, a.nirv.sprite.y, b.nirv.sprite.x, b.nirv.sprite.y) <= distance
  }

  private startChance(a: BotNirv, b: BotNirv): number {
    const socialDeficit = (200 - (a.nirv.getSocialNeed() + b.nirv.getSocialNeed())) / 220
    const relBias = this.relationshipSystem?.getPairSocialBias(a.id, b.id, 'private') ?? 0
    const relationshipChance = Phaser.Math.Clamp((relBias + 1) * 0.24, 0, 0.34)
    const moodModifier = getMoodSocialModifier(a.nirv.getMood()) + getMoodSocialModifier(b.nirv.getMood())
    return Phaser.Math.Clamp(socialDeficit + relationshipChance + moodModifier * 0.5, 0.06, 0.95)
  }

  private findSharedInterest(a: readonly MusicTag[], b: readonly MusicTag[]): MusicTag | null {
    return a.find(tag => b.includes(tag)) ?? null
  }

  private countSharedInterests(a: readonly MusicTag[], b: readonly MusicTag[]): number {
    let count = 0
    for (const tag of a) if (b.includes(tag)) count++
    return count
  }

  private chatKey(a: BotNirv, b: BotNirv): string {
    return [a.id, b.id].sort().join(':')
  }

  private endReason(a: BotNirv, b: BotNirv): string {
    if (!this.canStartChat(a) || !this.canStartChat(b)) return 'ineligible_state'
    if (!this.isWithinDistance(a, b, KEEP_CHAT_DISTANCE_PX)) return 'distance'
    return 'unknown'
  }
}
