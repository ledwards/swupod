/**
 * Pod tournaments: the online event a pod plays after its draft.
 *
 * Pure rules only. Persistence lives in tournamentDb.ts; nothing here reads the
 * database, the clock or Math.random, so every rule is unit-testable.
 *
 * - Swiss: 3 points a match win, 1 a draw. A bye is a match win (2–0) and is
 *   left out of opponents' tiebreakers. Ties break on OMW%, each opponent's
 *   match-win rate floored at 33%. Nobody plays the same opponent twice while a
 *   pairing without the rematch exists.
 * - Swiss has no top cut: pods are at most eight, so the Swiss leader wins.
 * - Elimination: single elimination from the start, seeded by seat. Missing
 *   seats in a non-power-of-two bracket are byes for the top seeds.
 * - Results come from games. A Swiss best-of-three that ends level is a draw;
 *   elimination plays on until someone has the wins.
 */

export type TournamentFormat = 'swiss' | 'elimination' | 'none'
export type Stage = 'swiss' | 'elimination'
export type GameResult = 'player1' | 'player2' | 'draw'
export type MatchWinner = GameResult

export interface TournamentSettings {
  format: TournamentFormat
  rounds: number
  bestOf: 1 | 3
  botsPlay: boolean
}

export interface Entrant {
  id: string
  seat: number
  isBot: boolean
  name?: string
}

export interface TournamentMatch {
  id: string
  stage: Stage
  round: number
  table: number
  player1: string
  /** null is a bye. */
  player2: string | null
  bestOf: 1 | 3
  /** Results of the games played, in order. */
  games: GameResult[]
  winner: MatchWinner | null
}

export interface Pairing {
  stage: Stage
  round: number
  table: number
  player1: string
  player2: string | null
}

export const SWISS_WIN_POINTS = 3
export const SWISS_DRAW_POINTS = 1
export const OMW_FLOOR = 1 / 3
/** A level elimination series keeps going, but never forever: past this the higher seed advances. */
export const MAX_ELIMINATION_GAMES = 5

/** Swiss rounds that leave one undefeated player: ceil(log2(players)). */
export function recommendedRounds(playerCount: number): number {
  if (playerCount <= 2) return 1
  return Math.ceil(Math.log2(playerCount))
}

export function maxRounds(playerCount: number): number {
  return Math.max(1, playerCount - 1)
}

/** Settings as the host left them, made legal for this many entrants. A saved topCut is ignored. */
export function normalizeSettings(raw: unknown, playerCount: number): TournamentSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const formatRaw = value.format ?? value.afterDraft
  // No choice saved (pods made before After the draft existed) means no tournament.
  const format: TournamentFormat = formatRaw === 'elimination' ? 'elimination'
    : formatRaw === 'swiss' ? 'swiss' : 'none'
  const recommended = recommendedRounds(playerCount)
  const roundsRaw = Number(value.rounds)
  const rounds = Number.isInteger(roundsRaw) && roundsRaw >= 1
    ? Math.min(roundsRaw, maxRounds(playerCount)) : recommended
  const bestOf: 1 | 3 = Number(value.bestOf) === 1 ? 1 : 3
  const botsPlay = value.botsPlay !== false
  return { format, rounds, bestOf, botsPlay }
}

/** "Swiss 3 · Bo3" — the settings in brief. */
export function settingsSummary(s: TournamentSettings): string {
  if (s.format === 'none') return 'No tournament'
  return [s.format === 'swiss' ? `Swiss ${s.rounds}` : 'Bracket', `Bo${s.bestOf}`].join(' · ')
}

/** "Swiss 3 rounds" / "Bracket · Bo3" — the page subtitle after the set. */
export function settingsSubtitle(s: TournamentSettings): string {
  if (s.format === 'none') return ''
  if (s.format === 'elimination') return `Bracket · Bo${s.bestOf}`
  return `Swiss ${s.rounds} round${s.rounds === 1 ? '' : 's'}`
}

// ---------------------------------------------------------------------------
// Match results

export function gameScore(games: readonly GameResult[]): [number, number] {
  let a = 0, b = 0
  for (const g of games) { if (g === 'player1') a++; else if (g === 'player2') b++ }
  return [a, b]
}

/**
 * The match result implied by its games, or null while it is still being played.
 * Swiss allows a drawn match; elimination always produces a winner.
 */
export function decideMatch(games: readonly GameResult[], bestOf: 1 | 3, stage: Stage): MatchWinner | null {
  const need = bestOf === 1 ? 1 : 2
  const [a, b] = gameScore(games)
  if (a >= need) return 'player1'
  if (b >= need) return 'player2'
  if (stage === 'swiss') {
    if (games.length >= bestOf) return a > b ? 'player1' : b > a ? 'player2' : 'draw'
    return null
  }
  if (games.length >= MAX_ELIMINATION_GAMES) return b > a ? 'player2' : 'player1'
  return null
}

/** The game to play next in this match, or null once it is decided. */
export function nextGameNumber(match: Pick<TournamentMatch, 'games' | 'winner' | 'player2'>): number | null {
  if (match.winner || !match.player2) return null
  return match.games.length + 1
}

/**
 * A host's corrected score, as games. Elimination may not end level; Swiss may.
 * Returns the games and the winner they imply.
 */
export function overrideGames(player1Wins: number, player2Wins: number, bestOf: 1 | 3, stage: Stage): { games: GameResult[]; winner: MatchWinner } {
  const need = bestOf === 1 ? 1 : 2
  const valid = Number.isInteger(player1Wins) && Number.isInteger(player2Wins) && player1Wins >= 0 && player2Wins >= 0
    && player1Wins <= need && player2Wins <= need && !(player1Wins === need && player2Wins === need)
  if (!valid) throw new Error('Invalid score')
  const games: GameResult[] = []
  // Interleave so the winner takes the last game: 2–1 is W L W, not W W L.
  const decided = player1Wins === need || player2Wins === need
  const loserFirst = player1Wins === need ? 'player2' : 'player1'
  const winnerSide = player1Wins === need ? 'player1' : 'player2'
  const loserWins = player1Wins === need ? player2Wins : player1Wins
  if (decided) {
    for (let i = 0; i < loserWins; i++) games.push(winnerSide, loserFirst)
    while (gameScore(games)[winnerSide === 'player1' ? 0 : 1] < need) games.push(winnerSide)
  } else {
    if (stage === 'elimination') throw new Error('An elimination match needs a winner')
    for (let i = 0; i < player1Wins; i++) games.push('player1')
    for (let i = 0; i < player2Wins; i++) games.push('player2')
    while (games.length < bestOf) games.push('draw')
  }
  const winner = decideMatch(games, bestOf, stage)
  if (!winner) throw new Error('Invalid score')
  return { games, winner }
}

/**
 * Bot-vs-bot matches resolve without a human: each game is a coin flip seeded by
 * the match id and game number, so a retry reproduces the same result.
 */
export function autoResolveGames(matchId: string, bestOf: 1 | 3, stage: Stage): GameResult[] {
  const games: GameResult[] = []
  for (let n = 1; !decideMatch(games, bestOf, stage); n++) games.push(hash32(`${matchId}:${n}`) % 2 === 0 ? 'player1' : 'player2')
  return games
}

export function hash32(text: string): number {
  // FNV-1a: stable across runtimes, plenty for a coin flip.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

// ---------------------------------------------------------------------------
// Swiss standings

export interface Standing {
  rank: number
  id: string
  wins: number
  losses: number
  draws: number
  byes: number
  points: number
  /** 0–1. */
  omw: number
  /** The player's own match-win rate (byes count), floored at 33%; used for others' OMW. */
  mwp: number
}

/** Standings over the Swiss matches (elimination matches never change Swiss points). */
export function computeStandings(entrants: readonly Entrant[], matches: readonly TournamentMatch[]): Standing[] {
  const swiss = matches.filter(m => m.stage === 'swiss' && m.winner)
  const rows = new Map<string, Omit<Standing, 'rank' | 'omw' | 'mwp'> & { opponents: string[]; played: number }>()
  for (const e of entrants) rows.set(e.id, { id: e.id, wins: 0, losses: 0, draws: 0, byes: 0, points: 0, opponents: [], played: 0 })
  for (const m of swiss) {
    const a = rows.get(m.player1), b = m.player2 ? rows.get(m.player2) : undefined
    if (!a) continue
    if (!m.player2) { a.wins++; a.byes++; a.played++; continue }
    if (!b) continue
    a.played++; b.played++
    a.opponents.push(b.id); b.opponents.push(a.id)
    if (m.winner === 'player1') { a.wins++; b.losses++ }
    else if (m.winner === 'player2') { b.wins++; a.losses++ }
    else { a.draws++; b.draws++ }
  }
  for (const r of rows.values()) r.points = r.wins * SWISS_WIN_POINTS + r.draws * SWISS_DRAW_POINTS
  const mwp = new Map<string, number>()
  for (const r of rows.values()) mwp.set(r.id, r.played ? Math.max(OMW_FLOOR, r.points / (SWISS_WIN_POINTS * r.played)) : OMW_FLOOR)
  const seat = new Map(entrants.map(e => [e.id, e.seat]))
  const list = [...rows.values()].map(r => ({
    id: r.id, wins: r.wins, losses: r.losses, draws: r.draws, byes: r.byes, points: r.points,
    mwp: mwp.get(r.id)!,
    omw: r.opponents.length ? r.opponents.reduce((s, o) => s + (mwp.get(o) ?? OMW_FLOOR), 0) / r.opponents.length : OMW_FLOOR,
  }))
  list.sort((x, y) => y.points - x.points || y.omw - x.omw || (seat.get(x.id) ?? 0) - (seat.get(y.id) ?? 0))
  return list.map((r, i) => ({ ...r, rank: i + 1 }))
}

// ---------------------------------------------------------------------------
// Swiss pairing

const REMATCH_PENALTY = 1_000_000

/** Who gets the bye: the lowest-ranked player without one, preferring a bot so a human keeps playing. */
export function chooseBye(standings: readonly Standing[], entrants: readonly Entrant[]): string {
  const bot = new Map(entrants.map(e => [e.id, e.isBot]))
  const order = [...standings].reverse()
  const pick = (list: Standing[]) => list.find(s => bot.get(s.id)) ?? list[0]
  const without = order.filter(s => s.byes === 0)
  const pool = without.length ? without : order
  const lowest = pool[0]!.points
  return pick(pool.filter(s => s.points === lowest))!.id
}

/**
 * Pair a Swiss round. Round 1 pairs across the table by seat (seat 1 v seat 5
 * of eight). Later rounds use an exact minimum-cost matching: a rematch costs
 * more than any score gap, so none happens while a rematch-free pairing exists,
 * and players otherwise meet the closest record. Tables are numbered from the top.
 */
export function pairSwissRound(entrants: readonly Entrant[], matches: readonly TournamentMatch[], round: number): Pairing[] {
  const standings = computeStandings(entrants, matches)
  const rank = new Map(standings.map(s => [s.id, s]))
  let players = round === 1 ? [...entrants].sort((a, b) => a.seat - b.seat).map(e => e.id) : standings.map(s => s.id)
  let bye: string | null = null
  if (players.length % 2) {
    bye = chooseBye(standings, entrants)
    players = players.filter(id => id !== bye)
  }
  let pairs: [string, string][]
  if (round === 1) {
    const half = players.length / 2
    pairs = players.slice(0, half).map((id, i) => [id, players[i + half]!])
  } else {
    const met = new Set<string>()
    for (const m of matches) if (m.player2) { met.add(`${m.player1}|${m.player2}`); met.add(`${m.player2}|${m.player1}`) }
    pairs = minCostMatching(players, (a, b) => {
      const d = (rank.get(a)!.points - rank.get(b)!.points)
      return (met.has(`${a}|${b}`) ? REMATCH_PENALTY : 0) + d * d
    })
  }
  const order = (id: string) => rank.get(id)!.rank
  pairs.sort((x, y) => Math.min(order(x[0]), order(x[1])) - Math.min(order(y[0]), order(y[1])))
  const result: Pairing[] = pairs.map(([a, b], i) => {
    // The higher-ranked player sits in seat 1 (player one).
    const [p1, p2] = order(a) <= order(b) ? [a, b] : [b, a]
    return { stage: 'swiss', round, table: i + 1, player1: p1, player2: p2 }
  })
  if (bye) result.push({ stage: 'swiss', round, table: result.length + 1, player1: bye, player2: null })
  return result
}

/** Exact minimum-cost perfect matching; pods are at most eight players. Ties keep list order. */
function minCostMatching(ids: string[], cost: (a: string, b: string) => number): [string, string][] {
  const n = ids.length
  const memo = new Map<number, { cost: number; pairs: [number, number][] }>()
  const solve = (mask: number): { cost: number; pairs: [number, number][] } => {
    if (mask === 0) return { cost: 0, pairs: [] }
    const hit = memo.get(mask); if (hit) return hit
    let i = 0; while (!(mask & (1 << i))) i++
    let best: { cost: number; pairs: [number, number][] } | null = null
    for (let j = i + 1; j < n; j++) {
      if (!(mask & (1 << j))) continue
      const sub = solve(mask & ~(1 << i) & ~(1 << j))
      const total = cost(ids[i]!, ids[j]!) + sub.cost
      if (!best || total < best.cost) best = { cost: total, pairs: [[i, j], ...sub.pairs] }
    }
    memo.set(mask, best!); return best!
  }
  return solve((1 << n) - 1).pairs.map(([i, j]) => [ids[i]!, ids[j]!])
}

// ---------------------------------------------------------------------------
// Elimination

/** Standard bracket order: seeds 1 and 2 can only meet in the final. 8 → 1,8,4,5,2,7,3,6. */
export function bracketSeedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    const next = order.length * 2
    order = order.flatMap(s => [s, next + 1 - s])
  }
  return order.slice(0, Math.max(1, size))
}

export function bracketSize(players: number): number {
  let size = 2
  while (size < players) size *= 2
  return size
}

/** First bracket round from players in seed order (index 0 is seed 1). Missing seeds are byes. */
export function seedBracket(seeded: readonly string[], round = 1): Pairing[] {
  const size = bracketSize(seeded.length)
  const order = bracketSeedOrder(size)
  const pairs: Pairing[] = []
  for (let i = 0; i < order.length; i += 2) {
    const a = seeded[order[i]! - 1] ?? null, b = seeded[order[i + 1]! - 1] ?? null
    if (!a && !b) continue
    const [p1, p2] = a ? [a, b] : [b!, null]
    pairs.push({ stage: 'elimination', round, table: pairs.length + 1, player1: p1, player2: p2 })
  }
  return pairs
}

export function winnerId(m: Pick<TournamentMatch, 'winner' | 'player1' | 'player2'>): string | null {
  if (!m.player2) return m.player1
  return m.winner === 'player1' ? m.player1 : m.winner === 'player2' ? m.player2 : null
}

/** Winners of tables 1+2 meet at table 1 of the next round, 3+4 at table 2, and so on. */
export function nextBracketRound(previous: readonly TournamentMatch[]): Pairing[] {
  const sorted = [...previous].sort((a, b) => a.table - b.table)
  const pairs: Pairing[] = []
  for (let i = 0; i < sorted.length; i += 2) {
    const a = winnerId(sorted[i]!), b = sorted[i + 1] ? winnerId(sorted[i + 1]!) : null
    if (!a) throw new Error('Bracket round is not finished')
    pairs.push({ stage: 'elimination', round: sorted[0]!.round + 1, table: pairs.length + 1, player1: a, player2: b })
  }
  return pairs
}

/** "Quarterfinals" / "Semifinals" / "Final" by how many matches a bracket round has. */
export function bracketRoundName(matchesInRound: number): string {
  if (matchesInRound <= 1) return 'Final'
  if (matchesInRound === 2) return 'Semifinals'
  if (matchesInRound <= 4) return 'Quarterfinals'
  return `Round of ${matchesInRound * 2}`
}

/** Every bracket round name, first to last, for a bracket of this many players. */
export function bracketRoundNames(players: number): string[] {
  const names: string[] = []
  for (let matches = bracketSize(players) / 2; matches >= 1; matches /= 2) names.push(bracketRoundName(matches))
  return names
}

// ---------------------------------------------------------------------------
// Advancement

export interface TournamentState {
  settings: TournamentSettings
  status: 'running' | 'complete'
  entrants: Entrant[]
  matches: TournamentMatch[]
}

export type AdvanceAction =
  | { type: 'wait' }
  | { type: 'pair'; pairings: Pairing[] }
  | { type: 'complete' }

/** The first round of a tournament. */
export function openingPairings(settings: TournamentSettings, entrants: readonly Entrant[]): Pairing[] {
  if (settings.format === 'elimination') return seedBracket([...entrants].sort((a, b) => a.seat - b.seat).map(e => e.id))
  return pairSwissRound(entrants, [], 1)
}

/**
 * What happens next. Rounds advance on their own once every table in the
 * current round has a result; Swiss ends after its last round.
 */
export function planAdvance(state: TournamentState): AdvanceAction {
  if (state.status !== 'running') return { type: 'wait' }
  const { settings, matches } = state
  if (!matches.length) return { type: 'pair', pairings: openingPairings(settings, state.entrants) }
  const stage: Stage = matches.some(m => m.stage === 'elimination') ? 'elimination' : 'swiss'
  const round = Math.max(...matches.filter(m => m.stage === stage).map(m => m.round))
  const current = matches.filter(m => m.stage === stage && m.round === round)
  if (current.some(m => !m.winner)) return { type: 'wait' }
  if (stage === 'swiss') {
    if (round < settings.rounds) return { type: 'pair', pairings: pairSwissRound(state.entrants, matches, round + 1) }
    return { type: 'complete' }
  }
  if (current.length <= 1) return { type: 'complete' }
  return { type: 'pair', pairings: nextBracketRound(current) }
}

/** The champion once the tournament is over (bracket winner, or the Swiss leader). */
export function champion(state: TournamentState): string | null {
  if (state.status !== 'complete') return null
  const elim = state.matches.filter(m => m.stage === 'elimination')
  if (elim.length) {
    const last = Math.max(...elim.map(m => m.round))
    const final = elim.filter(m => m.round === last)
    return final.length === 1 ? winnerId(final[0]!) : null
  }
  return computeStandings(state.entrants, state.matches)[0]?.id ?? null
}
