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
  | 'walking_to_house_door'
  | 'ringing_house'
  | 'walking_into_house'
  | 'inside_house'
  | 'walking_out_of_house'
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
  | 'waiter_returning_plate'
  | 'farmer_idle'
  | 'farmer_to_crop'
  | 'farmer_working'
  | 'stocker_idle'
  | 'stocker_to_station'
  | 'stocker_restocking'

export function isRestaurantStaffState(s: BotState): boolean {
  return (
    s === 'chef_idle' ||
    s === 'chef_to_stove' ||
    s === 'chef_cooking' ||
    s === 'chef_to_counter' ||
    s === 'waiter_idle' ||
    s === 'waiter_to_counter' ||
    s === 'waiter_to_table' ||
    s === 'waiter_returning_plate'
  )
}

export function isFarmerState(s: BotState): boolean {
  return s === 'farmer_idle' || s === 'farmer_to_crop' || s === 'farmer_working'
}

export function isStockerState(s: BotState): boolean {
  return s === 'stocker_idle' || s === 'stocker_to_station' || s === 'stocker_restocking'
}

export function isWorkJobState(s: BotState): boolean {
  return isRestaurantStaffState(s) || isFarmerState(s) || isStockerState(s)
}

export function isHouseState(s: BotState): boolean {
  return (
    s === 'walking_to_house_door' ||
    s === 'ringing_house' ||
    s === 'walking_into_house' ||
    s === 'inside_house' ||
    s === 'walking_out_of_house'
  )
}
