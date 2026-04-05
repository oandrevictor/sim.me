export interface Recipe {
  id: string
  label: string
  cookTimeMs: number
  eatTimeMs: number
  color: number
}

export const RECIPES: Recipe[] = [
  { id: 'sandwich',  label: 'Sandwich',  cookTimeMs: 10000, eatTimeMs: 5000,  color: 0xf5d89a },
  { id: 'soup',      label: 'Soup',      cookTimeMs: 15000, eatTimeMs: 8000,  color: 0xcc4422 },
  { id: 'pasta',     label: 'Pasta',     cookTimeMs: 20000, eatTimeMs: 10000, color: 0xffe066 },
  { id: 'hamburger', label: 'Hamburger', cookTimeMs: 25000, eatTimeMs: 7000,  color: 0x8b5e3c },
]

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find(r => r.id === id)
}
