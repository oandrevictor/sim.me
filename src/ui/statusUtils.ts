import type { BotState } from '../entities/BotNirv'

export function getBotStatusLabel(state: BotState | string): string {
  switch (state) {
    case 'walking_to_chair': return 'Arriving...'
    case 'walking_to_water': return 'Getting water'
    case 'walking_to_water_queue': return 'Joining water line'
    case 'waiting_at_water_queue': return 'In line for water'
    case 'drinking_water': return 'Drinking'
    case 'seated': return 'Seated'
    case 'awaiting_service': return 'Waiting for food'
    case 'eating': return 'Eating'
    case 'walking_to_stage': return 'Coming to watch'
    case 'watching_stage': return 'Watching'
    case 'walking_to_perform': return 'Taking the stage'
    case 'performing_on_stage': return 'Performing'
    default: return state
  }
}

export function getBotStatusColor(state: BotState | string): string {
  switch (state) {
    case 'walking_to_chair': return '#8888aa'
    case 'walking_to_water': return '#6699cc'
    case 'walking_to_water_queue': return '#5588bb'
    case 'waiting_at_water_queue': return '#77aadd'
    case 'drinking_water': return '#88ccff'
    case 'seated': return '#44cccc'
    case 'awaiting_service': return '#ffaa33'
    case 'eating': return '#44dd88'
    case 'walking_to_stage': return '#8888aa'
    case 'watching_stage': return '#ffd700'
    case 'walking_to_perform': return '#cc88ff'
    case 'performing_on_stage': return '#ff88cc'
    default: return '#aaaacc'
  }
}
