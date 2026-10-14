/**
 * Leader-vs-leader win rates from recorded matches. Each recorded match is one
 * player's report, so it counts once for the reporter (row leader) and once,
 * inverted, for the opponent's leader. Pure: rows in, grid out.
 */

export interface MatchupSourceRow {
  player_leader: string | null
  opponent_leader: string | null
  result: string | null
}

export interface MatchupCell {
  wins: number
  losses: number
  draws: number
  matches: number
  /** Row leader's win rate vs the column leader; null under the sample floor. */
  winRate: number | null
}

export interface LeaderMatchups {
  leaders: string[]
  /** Reports where both leaders are known (the only ones the grid can use). */
  identifiedMatches: number
  /** grid[row][col]; null on the mirror diagonal. */
  grid: (MatchupCell | null)[][]
}

const RESULT_SCORE: Record<string, 'W' | 'L' | 'D'> = { win: 'W', loss: 'L', draw: 'D' }
const INVERT = { W: 'L', L: 'W', D: 'D' } as const

// Reports name a leader either bare ("Cad Bane") or with its subtitle
// ("Cad Bane, Still Faster than You"); an unmatched leader arrives as a placeholder.
const UNRESOLVED = /^(unresolved|unknown)( leader)?$/i

function cleanName(value: string | null): string | null {
  const name = (value || '').split(',')[0]!.trim().replace(/\s+/g, ' ')
  if (!name || UNRESOLVED.test(name)) return null
  return name
}

/**
 * A report often arrives with the reporter's own leader unresolved, but the
 * match is tied to their pool, and that pool's built deck names the leader.
 */
export function withDeckLeaderFallback<T extends MatchupSourceRow & { deck_leader?: string | null }>(rows: T[]): T[] {
  return rows.map((row) => (cleanName(row.player_leader) || !row.deck_leader ? row : { ...row, player_leader: row.deck_leader }))
}

export function buildLeaderMatchups(
  rows: MatchupSourceRow[],
  { limit = 8, minMatches = 20 }: { limit?: number; minMatches?: number } = {},
): LeaderMatchups {
  const display = new Map<string, string>()
  const order = new Map<string, number>()
  const played = new Map<string, number>()
  const tallies = new Map<string, { W: number; L: number; D: number }>()
  let identifiedMatches = 0

  const keyOf = (raw: string | null): string | null => {
    const name = cleanName(raw)
    if (!name) return null
    const key = name.toLowerCase()
    if (!display.has(key)) { display.set(key, name); order.set(key, order.size) }
    return key
  }
  const tally = (a: string, b: string, outcome: 'W' | 'L' | 'D') => {
    const k = `${a}\u0000${b}`
    const t = tallies.get(k) || { W: 0, L: 0, D: 0 }
    t[outcome] += 1
    tallies.set(k, t)
  }

  for (const row of rows) {
    const outcome = RESULT_SCORE[(row.result || '').toLowerCase()]
    if (!outcome) continue
    const me = keyOf(row.player_leader)
    const them = keyOf(row.opponent_leader)
    if (!me || !them) continue
    identifiedMatches += 1
    played.set(me, (played.get(me) || 0) + 1)
    played.set(them, (played.get(them) || 0) + 1)
    if (me === them) continue
    tally(me, them, outcome)
    tally(them, me, INVERT[outcome])
  }

  const keys = [...played.keys()]
    .sort((a, b) => (played.get(b)! - played.get(a)!) || (order.get(a)! - order.get(b)!))
    .slice(0, limit)

  const grid = keys.map((rowKey) => keys.map((colKey): MatchupCell | null => {
    if (rowKey === colKey) return null
    const t = tallies.get(`${rowKey}\u0000${colKey}`) || { W: 0, L: 0, D: 0 }
    const matches = t.W + t.L + t.D
    return {
      wins: t.W,
      losses: t.L,
      draws: t.D,
      matches,
      winRate: matches >= minMatches && matches > 0 ? Math.round((t.W / matches) * 1000) / 10 : null,
    }
  }))

  return { leaders: keys.map((k) => display.get(k)!), identifiedMatches, grid }
}
