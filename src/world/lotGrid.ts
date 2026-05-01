import type { LotRecord } from '../storage/lotPersistence'

export function lotCellKey(gx: number, gy: number): string {
  return `${gx},${gy}`
}

export function parseLotCellKey(key: string): [number, number] {
  const [gx, gy] = key.split(',').map(Number)
  return [gx, gy]
}

export function lotAtCell(lots: readonly LotRecord[], gx: number, gy: number): LotRecord | null {
  const key = lotCellKey(gx, gy)
  return lots.find(lot => lot.cells.some(cell => lotCellKey(cell.gx, cell.gy) === key)) ?? null
}
