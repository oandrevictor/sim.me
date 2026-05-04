import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import type { DebugFields } from './DebugLogger'

export function botDebugFields(bot: BotNirv): DebugFields {
  return {
    actorId: bot.id,
    actorName: bot.nirv.name,
    state: bot.state,
    actorX: round(bot.nirv.sprite.x),
    actorY: round(bot.nirv.sprite.y),
  }
}

export function playerDebugFields(player: Nirv): DebugFields {
  return {
    actorId: 'player',
    actorName: player.name,
    state: 'player',
    actorX: round(player.sprite.x),
    actorY: round(player.sprite.y),
  }
}

export function botPairDebugFields(a: BotNirv, b: BotNirv): DebugFields {
  return {
    actorId: a.id,
    actorName: a.nirv.name,
    actorState: a.state,
    otherActorId: b.id,
    otherActorName: b.nirv.name,
    otherActorState: b.state,
    distance: round(Phaser.Math.Distance.Between(
      a.nirv.sprite.x,
      a.nirv.sprite.y,
      b.nirv.sprite.x,
      b.nirv.sprite.y,
    )),
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
