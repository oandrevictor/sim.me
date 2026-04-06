/** Screen-space step between people waiting in line behind the tap (down = +y). */
export const WATER_QUEUE_STEP_PX = 40

export function queueSlotBehindStation(
  stationX: number,
  stationY: number,
  lineIndex: number,
): { x: number; y: number } {
  return {
    x: stationX,
    y: stationY + WATER_QUEUE_STEP_PX * (lineIndex + 1),
  }
}
