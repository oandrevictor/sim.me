import type { BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import { CRITICAL_HYDRATION_THRESHOLD } from '../entities/nirvHydration'
import { CRITICAL_SATIATION } from '../entities/nirvHunger'
import { CRITICAL_REST_THRESHOLD } from '../entities/nirvSleep'
import { debugLog } from './DebugLogger'

const SOCIAL_CRITICAL_THRESHOLD = 20
const FUN_CRITICAL_THRESHOLD = 15

type NeedName = 'hydration' | 'satiation' | 'rest' | 'bladder' | 'social' | 'fun'

interface NeedSnapshot {
  need: NeedName
  value: number
  threshold: number
  critical: boolean
}

export class NirvNeedDebugTracker {
  private readonly active = new Map<string, boolean>()

  update(player: Nirv, bots: readonly BotNirv[]): void {
    this.trackActor('player', player.name, 'player', player)
    for (const bot of bots) {
      this.trackActor(bot.id, bot.nirv.name, bot.state, bot.nirv)
    }
  }

  private trackActor(actorId: string, actorName: string, state: string, nirv: Nirv): void {
    for (const need of collectNeeds(nirv)) {
      const key = `${actorId}:${need.need}`
      const wasCritical = this.active.get(key) ?? false
      if (need.critical === wasCritical) continue
      this.active.set(key, need.critical)
      debugLog.log(need.critical ? 'nirv.need_critical_enter' : 'nirv.need_critical_exit', {
        actorId,
        actorName,
        state,
        need: need.need,
        value: round(need.value),
        threshold: round(need.threshold),
      }, need.critical ? 'warn' : 'info')
    }
  }
}

function collectNeeds(nirv: Nirv): NeedSnapshot[] {
  const bladderThreshold = Math.max(0, nirv.bladderLevelThreshold - 10)
  return [
    need('hydration', nirv.getHydrationLevel(), CRITICAL_HYDRATION_THRESHOLD),
    need('satiation', nirv.getSatiation(), CRITICAL_SATIATION),
    need('rest', nirv.getRestLevel(), CRITICAL_REST_THRESHOLD),
    need('bladder', nirv.getBladderLevel(), bladderThreshold),
    need('social', nirv.getSocialNeed(), SOCIAL_CRITICAL_THRESHOLD),
    need('fun', nirv.getFunLevel(), FUN_CRITICAL_THRESHOLD),
  ]
}

function need(needName: NeedName, value: number, threshold: number): NeedSnapshot {
  return { need: needName, value, threshold, critical: value <= threshold }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
