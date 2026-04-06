import { OBJECT_SIZE } from '../objects/objectTypes'

/**
 * World-pixel offset from bed placement (x, y) to the mattress where the Nirv should lie.
 * Iso bed PNGs anchor at the footprint; without this, a rotated sprite sits on the floor edge.
 */
export function getBedSleepWorldOffset(bedRotation: 0 | 1): { dx: number; dy: number } {
  const dy = -OBJECT_SIZE * 0.95
  const dxMag = OBJECT_SIZE * 0.42
  const dx = bedRotation === 0 ? -dxMag : dxMag
  return { dx, dy }
}
