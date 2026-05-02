import Phaser from 'phaser'
import type { BotNirv, BotState } from '../entities/BotNirv'
import type { MusicTag } from '../data/musicTags'

interface SocialChatLineContext {
  a: BotNirv
  b: BotNirv
  sharedInterest: MusicTag | null
  firstMeeting: boolean
}

const GENERIC_LINES: [string, string][] = [
  ['Nice crowd today.', 'Yeah, it is packed.'],
  ['How is your day going?', 'Better now.'],
  ['Good to catch up.', 'Same here.'],
  ['How are you doing?', 'I am doing great, thank you.'],
  ['Nice weather today.', 'Yes, it is perfect for a concert.'],
]

const QUEUE_LINES: [string, string][] = [
  ['This line is moving slowly.', 'At least we have company.'],
  ['Worth the wait?', 'Probably.'],
  ['Why is this line so long?', 'I think there is a concert tonight.'],
]

const STAGE_LINES: [string, string][] = [
  ['Great show, right?', 'Best set so far.'],
  ['That stage sounds good.', 'I could watch all night.'],
  ['Wow, that was a great show!', 'I agree, it was amazing.'],
  ['That was a great show!', 'I agree, it was amazing.'],
  ['What is the setlist for tonight?', 'I am not sure, but I heard they are playing some new songs.'],
]

const STRESSED_LINES: [string, string][] = [
  ['I am exhausted.', 'Me too, honestly.'],
  ['Not feeling great today.', 'Sorry to hear that.'],
  ['This is a lot.', 'Tell me about it.'],
  ['I need a break.', 'Yeah, same here.'],
  ['Everything feels off today.', 'I know that feeling.'],
]

const MISERABLE_LINES: [string, string][] = [
  ['I can barely keep going.', 'Hang in there.'],
  ['This is too much.', 'You okay?'],
  ['I need to sit down.', 'Let me know if you need anything.'],
  ['I am not okay.', 'I am sorry.'],
  ['Why does everything feel so hard?', 'It will pass.'],
]

export function pickSocialChatLines(chat: SocialChatLineContext): [string, string] {
  const moodA = chat.a.nirv.getMood()
  const moodB = chat.b.nirv.getMood()
  const worstMood = (moodA === 'miserable' || moodB === 'miserable') ? 'miserable'
    : (moodA === 'stressed' || moodB === 'stressed') ? 'stressed'
    : moodA

  if (worstMood === 'miserable') return Phaser.Utils.Array.GetRandom(MISERABLE_LINES)
  if (worstMood === 'stressed') return Phaser.Utils.Array.GetRandom(STRESSED_LINES)

  if (chat.sharedInterest) {
    return chat.firstMeeting
      ? [`You like ${chat.sharedInterest}?`, `Yeah, I love ${chat.sharedInterest}.`]
      : [`Still into ${chat.sharedInterest}?`, `Always into ${chat.sharedInterest}.`]
  }
  if (worstMood === 'happy') {
    if (chat.a.state === 'watching_stage' || chat.b.state === 'watching_stage') {
      return Phaser.Utils.Array.GetRandom(STAGE_LINES)
    }
    if (isQueueState(chat.a.state) || isQueueState(chat.b.state)) {
      return Phaser.Utils.Array.GetRandom(QUEUE_LINES)
    }
  }
  if (chat.a.state === 'watching_stage' || chat.b.state === 'watching_stage') {
    return Phaser.Utils.Array.GetRandom(STAGE_LINES)
  }
  if (isQueueState(chat.a.state) || isQueueState(chat.b.state)) {
    return Phaser.Utils.Array.GetRandom(QUEUE_LINES)
  }
  return Phaser.Utils.Array.GetRandom(GENERIC_LINES)
}

function isQueueState(state: BotState): boolean {
  return state === 'waiting_at_water_queue' ||
    state === 'waiting_at_snack_queue' ||
    state === 'waiting_at_fruit_queue' ||
    state === 'waiting_at_toilet_queue'
}
