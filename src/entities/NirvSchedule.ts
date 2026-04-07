import { gridToScreen } from '../utils/isoGrid'
import type { MusicTag } from '../data/musicTags'
import type { NirvProfession } from '../data/professions'

export interface ScheduleWaypoint {
  gridX: number
  gridY: number
  /** How long to stay at this waypoint in milliseconds */
  duration: number
}

export interface NirvScheduleConfig {
  id: string
  name: string
  colorIndex: number
  waypoints: ScheduleWaypoint[]
  profession: NirvProfession
  interests: MusicTag[]
  /** Tags for this bot's act when used as a solo stage attraction */
  performerTags: MusicTag[]
}

const BOT_NAMES = ['Ava', 'Rex', 'Luna', 'Kai', 'Mira', 'Zeke', 'Nova', 'Ethan', 'Isabella', 'Lucas',
  'Mia', 'Noah', 'Olivia', 'William', 'Carlos', 'Jessy', 'Emma', 'Joan', 'Orochinho', 'Orochi',
  'Milton', 'Bode', 'Pisca', 'Wanessa Wolf', 'Samira Close', 'Aline Barros']

/** Fixed roster: stable ids and taste/act tags for stage affinity */
const BOT_PROFILES: {
  profession: NirvProfession
  interests: MusicTag[]
  performerTags: MusicTag[]
}[] = [
  { profession: 'singer', interests: ['pop', 'happy', 'uplifting'], performerTags: ['pop', 'uplifting', 'happy'] },
  { profession: 'none', interests: ['rock', 'energetic'], performerTags: [] },
  { profession: 'musician', interests: ['jazz', 'acoustic', 'romantic'], performerTags: ['jazz', 'acoustic'] },
  { profession: 'performer', interests: ['pop-rock', 'energetic', 'rock'], performerTags: ['rock', 'energetic', 'pop-rock'] },
  { profession: 'none', interests: ['pop', 'romantic', 'sad'], performerTags: [] },
  { profession: 'singer', interests: ['acoustic', 'sad', 'romantic'], performerTags: ['acoustic', 'romantic', 'sad'] },
  { profession: 'musician', interests: ['jazz', 'happy'], performerTags: ['jazz', 'uplifting'] },
  { profession: 'none', interests: ['rock', 'energetic'], performerTags: [] },
  { profession: 'musician', interests: ['jazz', 'acoustic', 'romantic'], performerTags: ['jazz', 'acoustic'] },
  { profession: 'performer', interests: ['pop-rock', 'energetic', 'rock'], performerTags: ['rock', 'energetic', 'pop-rock'] },
  { profession: 'none', interests: ['pop', 'romantic', 'sad'], performerTags: [] },
  { profession: 'singer', interests: ['acoustic', 'sad', 'romantic'], performerTags: ['acoustic', 'romantic', 'sad'] },
  { profession: 'musician', interests: ['jazz', 'happy'], performerTags: ['jazz', 'uplifting'] },
  { profession: 'none', interests: ['rock', 'energetic'], performerTags: [] },
  { profession: 'musician', interests: ['jazz', 'acoustic', 'romantic'], performerTags: ['jazz', 'acoustic'] },
  { profession: 'performer', interests: ['pop-rock', 'energetic', 'rock'], performerTags: ['rock', 'energetic', 'pop-rock'] },
  { profession: 'none', interests: ['pop', 'romantic', 'sad'], performerTags: [] },
  { profession: 'singer', interests: ['acoustic', 'sad', 'romantic'], performerTags: ['acoustic', 'romantic', 'sad'] },
  { profession: 'musician', interests: ['jazz', 'happy'], performerTags: ['jazz', 'uplifting'] },
  { profession: 'none', interests: ['rock', 'energetic'], performerTags: [] },
  { profession: 'musician', interests: ['jazz', 'acoustic', 'romantic'], performerTags: ['jazz', 'acoustic'] },
  { profession: 'performer', interests: ['pop-rock', 'energetic', 'rock'], performerTags: ['rock', 'energetic', 'pop-rock'] },
  { profession: 'none', interests: ['pop', 'romantic', 'sad'], performerTags: [] },
  { profession: 'singer', interests: ['acoustic', 'sad', 'romantic'], performerTags: ['acoustic', 'romantic', 'sad'] },
  { profession: 'musician', interests: ['jazz', 'happy'], performerTags: ['jazz', 'uplifting'] },
  { profession: 'none', interests: ['rock', 'energetic'], performerTags: [] },
  { profession: 'musician', interests: ['jazz', 'acoustic', 'romantic'], performerTags: ['jazz', 'acoustic'] },
  { profession: 'performer', interests: ['pop-rock', 'energetic', 'rock'], performerTags: ['rock', 'energetic', 'pop-rock'] },
  { profession: 'none', interests: ['pop', 'romantic', 'sad'], performerTags: [] },
  { profession: 'singer', interests: ['acoustic', 'sad', 'romantic'], performerTags: ['acoustic', 'romantic', 'sad'] },
  { profession: 'musician', interests: ['jazz', 'happy'], performerTags: ['jazz', 'uplifting'] },
  { profession: 'none', interests: ['rock', 'energetic'], performerTags: [] },
  { profession: 'musician', interests: ['jazz', 'acoustic', 'romantic'], performerTags: ['jazz', 'acoustic'] },
  { profession: 'performer', interests: ['pop-rock', 'energetic', 'rock'], performerTags: ['rock', 'energetic', 'pop-rock'] },
]

export function generateDefaultSchedules(
  gridCols: number,
  gridRows: number,
): NirvScheduleConfig[] {
  const schedules: NirvScheduleConfig[] = []
  const margin = 4

  for (let i = 0; i < 26; i++) {
    const waypointCount = 3 + Math.floor(Math.random() * 3)
    const waypoints: ScheduleWaypoint[] = []

    for (let w = 0; w < waypointCount; w++) {
      waypoints.push({
        gridX: margin + Math.floor(Math.random() * (gridCols - margin * 2)),
        gridY: margin + Math.floor(Math.random() * (gridRows - margin * 2)),
        duration: 2000 + Math.floor(Math.random() * 4000),
      })
    }

    const profile = BOT_PROFILES[i] ?? BOT_PROFILES[0]
    schedules.push({
      id: `bot-${BOT_NAMES[i]!.toLowerCase()}`,
      name: BOT_NAMES[i]!,
      colorIndex: i + 1,
      waypoints,
      profession: profile.profession,
      interests: [...profile.interests],
      performerTags: [...profile.performerTags],
    })
  }

  return schedules
}

/** Convert grid coordinates to screen pixel position (isometric) */
export function gridToPixel(gridX: number, gridY: number): { x: number; y: number } {
  return gridToScreen(gridX, gridY)
}
