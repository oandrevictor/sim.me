/** Max chefs from placed stoves and counters (tiers evaluated high → low). */
export function maxChefs(stoves: number, counters: number): number {
  if (stoves > 6 && counters > 10) return 4
  if (stoves > 4 && counters > 6) return 3
  if (stoves > 2 && counters > 3) return 2
  return 1
}

/** Max waiters from placed counters and tables (tiers evaluated high → low). */
export function maxWaiters(counters: number, tables: number): number {
  if (counters > 10 && tables > 12) return 5
  if (counters > 8 && tables > 8) return 5
  if (counters > 6 && tables > 5) return 4
  if (counters > 4 && tables > 3) return 3
  if (counters > 2 && tables > 2) return 2
  return 1
}
