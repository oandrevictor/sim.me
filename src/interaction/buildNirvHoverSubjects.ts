import type { BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import type { NirvHoverSubject } from './NirvNameHover'

function toHoverSubject(nirv: Nirv): NirvHoverSubject {
  return {
    sprite: nirv.sprite,
    name: nirv.name,
    hydrationLevel: nirv.getHydrationLevel(),
    restLevel: nirv.getRestLevel(),
    satiation: nirv.getSatiation(),
    funLevel: nirv.getFunLevel(),
    bladderLevel: nirv.getBladderLevel(),
    socialNeed: nirv.getSocialNeed(),
  }
}

/** Builds hover-card data for the player and all bots. */
export function buildNirvHoverSubjects(
  player: Nirv,
  bots: readonly BotNirv[],
): NirvHoverSubject[] {
  return [toHoverSubject(player), ...bots.map(bot => toHoverSubject(bot.nirv))]
}
