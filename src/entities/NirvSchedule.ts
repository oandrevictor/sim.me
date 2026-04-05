import { gridToScreen } from '../utils/isoGrid'

export interface ScheduleWaypoint {
  gridX: number
  gridY: number
  /** How long to stay at this waypoint in milliseconds */
  duration: number
}

export interface NirvScheduleConfig {
  name: string
  colorIndex: number
  waypoints: ScheduleWaypoint[]
}

const BOT_NAMES = ['Ava', 'Rex', 'Luna', 'Kai', 'Mira', 'Zeke', 'Nova']

export function generateDefaultSchedules(
  gridCols: number,
  gridRows: number,
): NirvScheduleConfig[] {
  const schedules: NirvScheduleConfig[] = []
  const margin = 4 // keep bots away from edges

  for (let i = 0; i < 7; i++) {
    const waypointCount = 3 + Math.floor(Math.random() * 3) // 3-5 waypoints
    const waypoints: ScheduleWaypoint[] = []

    for (let w = 0; w < waypointCount; w++) {
      waypoints.push({
        gridX: margin + Math.floor(Math.random() * (gridCols - margin * 2)),
        gridY: margin + Math.floor(Math.random() * (gridRows - margin * 2)),
        duration: 2000 + Math.floor(Math.random() * 4000), // 2-6 seconds
      })
    }

    schedules.push({
      name: BOT_NAMES[i],
      colorIndex: i + 1, // 1-7 (0 is reserved for player)
      waypoints,
    })
  }

  return schedules
}

/** Convert grid coordinates to screen pixel position (isometric) */
export function gridToPixel(gridX: number, gridY: number): { x: number; y: number } {
  return gridToScreen(gridX, gridY)
}
