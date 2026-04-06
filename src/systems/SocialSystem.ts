import Phaser from 'phaser'
import type { BotNirv, BotState } from '../entities/BotNirv'
import type { MusicTag } from '../data/musicTags'

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
])

type ChatSession = {
  a: BotNirv
  b: BotNirv
  accumMs: number
  reliefPerTick: number
  sharedInterest: MusicTag | null
  firstMeeting: boolean
}

const GENERIC_LINES: [string, string][] = [
  ['Nice crowd today.', 'Yeah, it is packed.'],
  ['How is your day going?', 'Better now.'],
  ['Good to catch up.', 'Same here.'],
  ['How are you doing?', 'I am doing great, thank you.'],
  ['Nice weather today.', 'Yes, it is perfect for a concert.']
  
]

const QUEUE_LINES: [string, string][] = [
  ['This line is moving slowly.', 'At least we have company.'],
  ['Worth the wait?', 'Probably.'],
  ['Why is this line so long?', 'I think there is a concert tonight.']
]

const STAGE_LINES: [string, string][] = [
  ['Great show, right?', 'Best set so far.'],
  ['That stage sounds good.', 'I could watch all night.'],
  ['Wow, that was a great show!', 'I agree, it was amazing.'],
  ['That was a great show!', 'I agree, it was amazing.'],
  ['What is the setlist for tonight?', 'I am not sure, but I heard they are playing some new songs.']

]

export class SocialSystem {
  private scanAccum = 0
  private chats = new Map<string, ChatSession>()

  constructor(private readonly bots: readonly BotNirv[]) {}

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
        this.endChat(key, chat)
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
      }
    }
  }

  private tryStartChats(): void {
    for (let i = 0; i < this.bots.length; i++) {
      const a = this.bots[i]
      if (!a || this.isChatting(a) || !this.canStartChat(a)) continue
      for (let j = i + 1; j < this.bots.length; j++) {
        const b = this.bots[j]
        if (!b || this.isChatting(b) || !this.canStartChat(b)) continue
        if (!this.isWithinDistance(a, b, START_CHAT_DISTANCE_PX)) continue
        if (Math.random() > this.startChance(a, b)) continue
        this.startChat(a, b)
        break
      }
    }
  }

  private startChat(a: BotNirv, b: BotNirv): void {
    const alreadyKnown = a.nirv.knowsNirv(b.nirv.name) || b.nirv.knowsNirv(a.nirv.name)
    const sharedInterest = this.findSharedInterest(a.interests, b.interests)
    a.nirv.rememberKnownNirv(b.nirv.name)
    b.nirv.rememberKnownNirv(a.nirv.name)
    const chat: ChatSession = {
      a,
      b,
      accumMs: 0,
      reliefPerTick: (alreadyKnown ? 5 : 10) + (sharedInterest ? 5 : 0),
      sharedInterest,
      firstMeeting: !alreadyKnown,
    }
    this.chats.set(this.chatKey(a, b), chat)
    this.applyChatLines(chat)
  }

  private applyChatLines(chat: ChatSession): void {
    const [lineA, lineB] = this.pickLines(chat)
    chat.a.nirv.showChatBubble(lineA)
    chat.b.nirv.showChatBubble(lineB)
  }

  private pickLines(chat: ChatSession): [string, string] {
    if (chat.sharedInterest) {
      return chat.firstMeeting
        ? [`You like ${chat.sharedInterest}?`, `Yeah, I love ${chat.sharedInterest}.`]
        : [`Still into ${chat.sharedInterest}?`, `Always into ${chat.sharedInterest}.`]
    }
    if (chat.a.state === 'watching_stage' || chat.b.state === 'watching_stage') {
      return Phaser.Utils.Array.GetRandom(STAGE_LINES)
    }
    if (this.isQueueState(chat.a.state) || this.isQueueState(chat.b.state)) {
      return Phaser.Utils.Array.GetRandom(QUEUE_LINES)
    }
    return Phaser.Utils.Array.GetRandom(GENERIC_LINES)
  }

  private endChat(key: string, chat: ChatSession): void {
    this.chats.delete(key)
    chat.a.nirv.hideChatBubble()
    chat.b.nirv.hideChatBubble()
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
    return Phaser.Math.Clamp((a.nirv.getSocialNeed() + b.nirv.getSocialNeed()) / 220, 0.12, 0.92)
  }

  private findSharedInterest(a: readonly MusicTag[], b: readonly MusicTag[]): MusicTag | null {
    return a.find(tag => b.includes(tag)) ?? null
  }

  private isQueueState(state: BotState): boolean {
    return state === 'waiting_at_water_queue' || state === 'waiting_at_snack_queue' || state === 'waiting_at_fruit_queue' || state === 'waiting_at_toilet_queue'
  }

  private chatKey(a: BotNirv, b: BotNirv): string {
    return [a.id, b.id].sort().join(':')
  }
}
