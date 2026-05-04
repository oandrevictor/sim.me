import type { BotNirv, BotState } from './BotNirv'

export type BotWorkRole = 'chef' | 'waiter' | 'farmer' | 'stocker' | 'performer'

export interface BotWorkRoleInfo {
  label: string
  shortLabel: string
  color: number
}

export const BOT_WORK_ROLE_ORDER: readonly BotWorkRole[] = [
  'chef',
  'waiter',
  'farmer',
  'stocker',
  'performer',
]

const ROLE_INFO: Record<BotWorkRole, BotWorkRoleInfo> = {
  chef: { label: 'Chef', shortLabel: 'CH', color: 0xdd8844 },
  waiter: { label: 'Waiter', shortLabel: 'WT', color: 0x88aadd },
  farmer: { label: 'Farmer', shortLabel: 'FR', color: 0xd6b85c },
  stocker: { label: 'Stocker', shortLabel: 'ST', color: 0x7fd0a7 },
  performer: { label: 'Performer', shortLabel: 'PF', color: 0xff88cc },
}

export function getWorkRoleInfo(role: BotWorkRole): BotWorkRoleInfo {
  return ROLE_INFO[role]
}

export function getActiveWorkRole(bot: Pick<BotNirv, 'state'>): BotWorkRole | null {
  return getActiveWorkRoleFromState(bot.state)
}

export function getActiveWorkRoleFromState(state: BotState | string): BotWorkRole | null {
  if (state.startsWith('chef_')) return 'chef'
  if (state.startsWith('waiter_')) return 'waiter'
  if (state.startsWith('farmer_')) return 'farmer'
  if (state.startsWith('stocker_')) return 'stocker'
  if (state === 'walking_to_perform' || state === 'performing_on_stage') return 'performer'
  return null
}
