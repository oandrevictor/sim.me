import type { NirvProfession } from './professions'

export type ScheduleActivity = 'sleep' | 'morning' | 'work' | 'meal' | 'leisure' | 'home'

export interface ScheduleBlock {
  /** Inclusive start, exclusive end. May be > 1440 to wrap past midnight; consumers normalize. */
  startMinute: number
  endMinute: number
  activity: ScheduleActivity
}

export type ScheduleTemplate = readonly ScheduleBlock[]

export type WorkRole = 'chef' | 'waiter' | 'farmer' | 'stocker'

const HM = (h: number, m = 0): number => h * 60 + m

const PUBLIC_TEMPLATE: ScheduleTemplate = [
  { startMinute: HM(0), endMinute: HM(7, 30), activity: 'sleep' },
  { startMinute: HM(7, 30), endMinute: HM(8, 30), activity: 'morning' },
  { startMinute: HM(8, 30), endMinute: HM(12), activity: 'leisure' },
  { startMinute: HM(12), endMinute: HM(13), activity: 'meal' },
  { startMinute: HM(13), endMinute: HM(18), activity: 'leisure' },
  { startMinute: HM(18), endMinute: HM(19), activity: 'meal' },
  { startMinute: HM(19), endMinute: HM(22, 30), activity: 'leisure' },
  { startMinute: HM(22, 30), endMinute: HM(23), activity: 'home' },
  { startMinute: HM(23), endMinute: HM(24), activity: 'sleep' },
]

const PERFORMER_TEMPLATE: ScheduleTemplate = [
  { startMinute: HM(0), endMinute: HM(1), activity: 'home' },
  { startMinute: HM(1), endMinute: HM(9), activity: 'sleep' },
  { startMinute: HM(9), endMinute: HM(10), activity: 'morning' },
  { startMinute: HM(10), endMinute: HM(12), activity: 'leisure' },
  { startMinute: HM(12), endMinute: HM(13), activity: 'meal' },
  { startMinute: HM(13), endMinute: HM(18), activity: 'work' },
  { startMinute: HM(18), endMinute: HM(19), activity: 'meal' },
  { startMinute: HM(19), endMinute: HM(24), activity: 'work' },
]

export const SCHEDULE_TEMPLATES: Record<NirvProfession, ScheduleTemplate> = {
  none: PUBLIC_TEMPLATE,
  singer: PERFORMER_TEMPLATE,
  musician: PERFORMER_TEMPLATE,
  performer: PERFORMER_TEMPLATE,
}

interface RoleWindow { start: number; end: number }

export const ROLE_WORK_WINDOWS: Record<WorkRole, readonly RoleWindow[]> = {
  chef:    [{ start: HM(11), end: HM(14, 30) }, { start: HM(17, 30), end: HM(22) }],
  waiter:  [{ start: HM(11), end: HM(14, 30) }, { start: HM(17, 30), end: HM(22) }],
  farmer:  [{ start: HM(6), end: HM(11) }],
  stocker: [{ start: HM(9), end: HM(11) }, { start: HM(15), end: HM(17) }],
}

const JITTER_RANGE_MIN = 15

/** Stable signed offset in [-15, +15], deterministic from id + salt. */
export function jitterOffset(id: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  }
  // map to [-JITTER_RANGE_MIN, +JITTER_RANGE_MIN]
  const r = (h >>> 0) / 0xffffffff
  return Math.round((r * 2 - 1) * JITTER_RANGE_MIN)
}

/** Apply a small ±15min jitter to each block boundary, deterministic per bot id. */
export function applyJitter(blocks: ScheduleTemplate, id: string): ScheduleBlock[] {
  return blocks.map((b, i) => ({
    startMinute: b.startMinute + jitterOffset(id, i),
    endMinute: b.endMinute + jitterOffset(id, i + 1),
    activity: b.activity,
  }))
}

/** Overlay role work windows on top of a template, replacing only morning/leisure slots. */
export function overlayRoleWork(blocks: readonly ScheduleBlock[], roles: readonly WorkRole[]): ScheduleBlock[] {
  if (roles.length === 0) return blocks.map(b => ({ ...b }))
  const windows: RoleWindow[] = []
  for (const r of roles) windows.push(...ROLE_WORK_WINDOWS[r])

  const result: ScheduleBlock[] = []
  for (const b of blocks) {
    if (b.activity !== 'morning' && b.activity !== 'leisure') {
      result.push({ ...b })
      continue
    }
    // Carve work windows out of this block
    let cursor = b.startMinute
    const inSpan = windows
      .map(w => ({ start: Math.max(w.start, b.startMinute), end: Math.min(w.end, b.endMinute) }))
      .filter(w => w.end > w.start)
      .sort((a, b2) => a.start - b2.start)
    for (const w of inSpan) {
      if (cursor < w.start) result.push({ startMinute: cursor, endMinute: w.start, activity: b.activity })
      result.push({ startMinute: w.start, endMinute: w.end, activity: 'work' })
      cursor = w.end
    }
    if (cursor < b.endMinute) result.push({ startMinute: cursor, endMinute: b.endMinute, activity: b.activity })
  }
  return result
}

export function findActivity(blocks: readonly ScheduleBlock[], minute: number): ScheduleActivity {
  // blocks may have jitter; clamp / wrap to [0, 1440)
  const m = ((minute % 1440) + 1440) % 1440
  for (const b of blocks) {
    const start = ((b.startMinute % 1440) + 1440) % 1440
    const end = b.endMinute - b.startMinute >= 1440 ? start + 1440 : b.endMinute
    const normEnd = ((end - 1) % 1440 + 1440) % 1440 + 1
    if (start <= normEnd) {
      if (m >= start && m < normEnd) return b.activity
    } else {
      // wraps midnight
      if (m >= start || m < normEnd) return b.activity
    }
  }
  return 'leisure'
}
