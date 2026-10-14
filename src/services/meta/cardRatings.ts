/** Helpers for the Meta card lists. Pure. */

/** Field win rate for a metric: total wins over total games across every card. */
export function pooledWinRate<T>(cards: T[], winsKey: keyof T, countKey: keyof T): number | null {
  let wins = 0
  let games = 0
  for (const card of cards) {
    const n = Number(card[countKey]) || 0
    if (n <= 0) continue
    games += n
    wins += Number(card[winsKey]) || 0
  }
  return games > 0 ? Math.round((wins / games) * 1000) / 10 : null
}

/** Sort by a numeric accessor; rows without a value always sink to the bottom. */
export function sortRows<T>(rows: T[], value: (row: T) => number | null | undefined, dir: 'ascending' | 'descending'): T[] {
  const sign = dir === 'ascending' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return sign * (va - vb)
  })
}
