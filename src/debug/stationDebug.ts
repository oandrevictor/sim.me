import type { BotNirv } from '../entities/BotNirv'
import { debugLog, type DebugFields, type DebugLogLevel } from './DebugLogger'
import { botDebugFields } from './debugActor'

export function logBotStation(
  type: string,
  bot: BotNirv,
  objectType: string,
  x: number,
  y: number,
  reason: string,
  level: DebugLogLevel = 'debug',
  extra: DebugFields = {},
): void {
  debugLog.log(type, {
    ...botDebugFields(bot),
    objectType,
    objectX: round(x),
    objectY: round(y),
    reason,
    ...extra,
  }, level)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
