/** Shared vocabulary for performance style and audience taste */
export const MUSIC_TAGS = [
  'pop',
  'rock',
  'pop-rock',
  'romantic',
  'sad',
  'happy',
  'uplifting',
  'energetic',
  'acoustic',
  'jazz',
] as const

export type MusicTag = (typeof MUSIC_TAGS)[number]

export function isMusicTag(s: string): s is MusicTag {
  return (MUSIC_TAGS as readonly string[]).includes(s)
}
