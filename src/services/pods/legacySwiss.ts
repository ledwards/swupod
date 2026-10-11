import { queryRow, queryRows } from '../../../lib/db'
import type { GameResult, MatchWinner, TournamentMatch, TournamentSettings } from './tournament'
import type { StoredTournament } from './tournamentDb'

/**
 * Competitive pods from before pod tournaments ran the old Swiss Practice
 * event: three Swiss rounds, best of three, humans only, kept in the
 * practice_rounds / practice_matches tables. The pod page reads those rows as
 * a tournament, read-only. Nothing is copied: players without alpha access
 * still play and report on the old page, so the old tables stay the record.
 */
export const LEGACY_SWISS_SETTINGS: TournamentSettings = { format: 'swiss', rounds: 3, bestOf: 3, topCut: 0, botsPlay: false }
/** The old event ended after its third round (src/services/matchmaking/advancement.ts). */
const LEGACY_ROUNDS = 3

export interface LegacyRoundRow { id: string; round_number: number; status: string; created_at: unknown }
export interface LegacyMatchRow {
  id: string; round_id: string; player1_id: string | null; player2_id: string | null; is_bye: boolean
  game1_result: unknown; game2_result: unknown; game3_result: unknown
  match_winner: unknown; final_confirmed: boolean; pod_owner_override: boolean; created_at: unknown
}
export interface LegacySeatRow { user_id: string; seat_number: number; is_bot: boolean }

const RESULTS = new Set(['player1', 'player2', 'draw'])
const asResult = (v: unknown): GameResult | null => (typeof v === 'string' && RESULTS.has(v) ? v as GameResult : null)
const time = (v: unknown) => { const t = v ? new Date(String(v)).getTime() : NaN; return Number.isFinite(t) ? t : 0 }

/** The old event's rows as a pod tournament. Null when the event never started. */
export function mapLegacySwiss(input: {
  podId: string; rounds: LegacyRoundRow[]; matches: LegacyMatchRow[]; seats: LegacySeatRow[]; matchmakingStatus?: unknown
}): StoredTournament | null {
  const rounds = [...input.rounds].sort((a, b) => a.round_number - b.round_number)
  if (!rounds.length) return null
  const seats = new Map(input.seats.map(s => [String(s.user_id), s]))
  const overridden = new Set<string>()
  const matches: TournamentMatch[] = []
  for (const round of rounds) {
    const rows = input.matches.filter(m => String(m.round_id) === String(round.id))
      // Byes after the tables, then in the order the old page paired them.
      .sort((a, b) => Number(a.is_bye) - Number(b.is_bye) || time(a.created_at) - time(b.created_at) || String(a.id).localeCompare(String(b.id)))
    rows.forEach((m, i) => {
      const p1 = m.player1_id ?? m.player2_id
      if (!p1) return
      const bye = m.is_bye || !m.player1_id || !m.player2_id
      const games = bye ? [] : [m.game1_result, m.game2_result, m.game3_result].map(asResult).filter((g): g is GameResult => g !== null)
      const winner: MatchWinner | null = bye ? 'player1' : (m.final_confirmed || m.pod_owner_override) ? asResult(m.match_winner) : null
      // A confirmed result the games do not show (a host override, or a game lost to a failed lobby).
      if (!bye && winner && (m.pod_owner_override || !games.length)) overridden.add(String(m.id))
      matches.push({ id: String(m.id), stage: 'swiss', round: round.round_number, table: i + 1, player1: String(p1), player2: bye ? null : String(m.player2_id), bestOf: 3, games, winner })
    })
  }
  const ids = new Set<string>()
  for (const m of matches) { ids.add(m.player1); if (m.player2) ids.add(m.player2) }
  const entrants = [...ids].map(id => ({ id, seat: seats.get(id)?.seat_number ?? 99, isBot: seats.get(id)?.is_bot === true }))
    .sort((a, b) => a.seat - b.seat)
  const last = rounds.at(-1)!
  const finished = input.matchmakingStatus === 'complete' || input.matchmakingStatus === 'cancelled'
    || (last.round_number >= LEGACY_ROUNDS && rounds.every(r => r.status === 'complete'))
  return {
    podId: input.podId, settings: LEGACY_SWISS_SETTINGS, status: finished ? 'complete' : 'running',
    entrants, matches, cutStartsAt: null, startedAt: time(rounds[0]!.created_at), overridden,
  }
}

/** The old Swiss Practice event of a competitive pod, read as a tournament; null when it never started. */
export async function loadLegacySwiss(podId: string): Promise<StoredTournament | null> {
  const rounds = await queryRows('SELECT id,round_number,status,created_at FROM practice_rounds WHERE pod_id=$1 ORDER BY round_number', [podId])
  if (!rounds.length) return null
  const [matches, seats, pod] = await Promise.all([
    queryRows(`SELECT id,round_id,player1_id,player2_id,is_bye,game1_result,game2_result,game3_result,match_winner,final_confirmed,pod_owner_override,created_at
      FROM practice_matches WHERE pod_id=$1`, [podId]),
    queryRows('SELECT user_id,seat_number,is_bot FROM pod_players WHERE pod_id=$1', [podId]),
    queryRow(`SELECT draft_state->>'matchmakingStatus' AS status FROM pods WHERE id=$1`, [podId]),
  ])
  return mapLegacySwiss({
    podId, rounds: rounds as unknown as LegacyRoundRow[], matches: matches as unknown as LegacyMatchRow[],
    seats: seats as unknown as LegacySeatRow[], matchmakingStatus: pod?.status,
  })
}

/** Whether a pod ran the old event, so the new one must not start over it. */
export async function hasLegacySwiss(podId: string): Promise<boolean> {
  return !!(await queryRow('SELECT 1 FROM practice_rounds WHERE pod_id=$1 LIMIT 1', [podId]))
}
