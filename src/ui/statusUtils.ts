import type { BotState } from '../entities/BotNirv'

export function getBotStatusLabel(state: BotState | string): string {
  switch (state) {
    case 'walking_to_chair': return 'Arriving...'
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
