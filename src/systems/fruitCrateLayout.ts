/** Three standing spots around the crate (screen space; +y is down). */
const SLOT_DX = [0, 38, -38]
const SLOT_DY = [42, 22, 22]

export const FRUIT_CRATE_SLOT_COUNT = 3

export function fruitSlotWorldPosition(
  stationX: number,
  stationY: number,
  slotIndex: number,
): { x: number; y: number } {
  const i = Math.max(0, Math.min(FRUIT_CRATE_SLOT_COUNT - 1, slotIndex))
  return { x: stationX + SLOT_DX[i], y: stationY + SLOT_DY[i] }
}
