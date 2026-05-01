import { isHouseState, type BotState } from './botStates'

const REDIRECT_PATH_STATES: ReadonlySet<BotState> = new Set<BotState>([
  'walking_to_chair',
  'walking_to_water',
  'walking_to_water_queue',
  'walking_to_toilet',
  'walking_to_toilet_queue',
  'walking_to_snack',
  'walking_to_snack_queue',
  'snack_wander',
  'walking_to_fruit',
  'walking_to_fruit_queue',
  'fruit_wander',
  'walking_to_bed',
  'walking_to_stage',
  'walking_to_perform',
  'chef_to_stove',
  'chef_to_counter',
  'waiter_to_counter',
  'waiter_to_table',
  'waiter_returning_plate',
  'farmer_to_crop',
  'stocker_to_station',
])

export function isRedirectPathState(state: BotState): boolean {
  return isHouseState(state) || REDIRECT_PATH_STATES.has(state)
}
