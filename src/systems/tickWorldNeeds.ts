import type { BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'

/** Applies one shared game-minute worth of need changes to the whole roster. */
export function tickWorldNeeds(
  player: Nirv,
  bots: readonly BotNirv[],
  isPlayerSleeping: boolean,
): void {
  player.applyMinuteDehydration()
  player.applyMinuteSatiation()
  player.applyMinuteFunDecay()
  player.applyMinuteBladder()
  player.applyMinuteSocialNeed()
  if (!isPlayerSleeping) player.applyMinuteRestDecay()

  for (const bot of bots) {
    bot.nirv.applyMinuteDehydration()
    bot.nirv.applyMinuteSatiation()
    bot.nirv.applyMinuteFunDecay()
    bot.nirv.applyMinuteBladder()
    bot.nirv.applyMinuteSocialNeed()
    if (bot.state !== 'sleeping') bot.nirv.applyMinuteRestDecay()
  }
}
