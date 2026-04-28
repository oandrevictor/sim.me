export type BotState =
  | 'walking'
  | 'waiting'
  | 'walking_to_chair'
  | 'seated'
  | 'awaiting_service'
  | 'eating'
  | 'walking_to_stage'
  | 'watching_stage'
  | 'walking_to_perform'
  | 'performing_on_stage'
  | 'walking_to_water'
  | 'walking_to_water_queue'
  | 'waiting_at_water_queue'
  | 'drinking_water'
  | 'walking_to_snack'
  | 'walking_to_snack_queue'
  | 'waiting_at_snack_queue'
  | 'snack_interact'
  | 'snack_wander'
  | 'snack_eat'
  | 'walking_to_fruit'
  | 'walking_to_fruit_queue'
  | 'waiting_at_fruit_queue'
  | 'fruit_interact'
  | 'fruit_wander'
  | 'fruit_eat'
  | 'walking_to_bed'
  | 'sleeping'
  | 'walking_to_toilet'
  | 'walking_to_toilet_queue'
  | 'waiting_at_toilet_queue'
  | 'using_toilet'
  | 'chef_idle'
  | 'chef_to_stove'
  | 'chef_cooking'
  | 'chef_to_counter'
  | 'waiter_idle'
  | 'waiter_to_counter'
  | 'waiter_to_table'
  | 'farmer_idle'
  | 'farmer_to_crop'
  | 'farmer_working'

export function isRestaurantStaffState(s: BotState): boolean {
  return (
    s === 'chef_idle' ||
    s === 'chef_to_stove' ||
    s === 'chef_cooking' ||
    s === 'chef_to_counter' ||
    s === 'waiter_idle' ||
    s === 'waiter_to_counter' ||
    s === 'waiter_to_table'
  )
}

export function isFarmerState(s: BotState): boolean {
  return s === 'farmer_idle' || s === 'farmer_to_crop' || s === 'farmer_working'
}

export function isWorkJobState(s: BotState): boolean {
  return isRestaurantStaffState(s) || isFarmerState(s)
}
