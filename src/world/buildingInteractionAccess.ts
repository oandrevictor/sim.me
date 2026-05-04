import type { Building } from '../entities/Building'

export function actorInsideObjectBuilding(
  buildings: readonly Building[],
  actorX: number,
  actorY: number,
  objectX: number,
  objectY: number,
): boolean {
  const building = buildings.find(b => b.containsPixel(objectX, objectY))
  return !building || building.containsPixel(actorX, actorY)
}
