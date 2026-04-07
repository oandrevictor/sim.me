export type NirvProfession = 'none' | 'singer' | 'musician' | 'performer'

export function isPerformerProfession(p: NirvProfession): boolean {
  return p === 'singer' || p === 'musician' || p === 'performer'
}
