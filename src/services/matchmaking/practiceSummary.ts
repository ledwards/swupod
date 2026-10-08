import { queryRow, queryRows } from '@/lib/db'
import { computeRankedStandings } from './standings'
import {
  fetchRoundsWithMatches,
  type MatchmakingMatch,
  type MatchmakingRound,
} from '@/src/utils/matchmakingRounds'
import { jsonParse } from '@/src/utils/json'

export type PracticeSwissSummaryStatus = 'ready' | 'unavailable'

export interface PracticeSwissSummaryInput {
  practiceMatchGameId?: string | null
  poolShareId?: string | null
}

export interface PracticeSwissPairing {
  table: string | null
  opponent: string | null
  status: string | null
}

export interface PracticeSwissStanding {
  rank: number
  playerName: string
  record: string | null
  points: number | null
}

export interface PracticeSwissSummary {
  status: PracticeSwissSummaryStatus
  practiceMatchGameId: string | null
  poolShareId: string | null
  currentRound: number | null
  pairing: PracticeSwissPairing | null
  playerRecord: string | null
  standings: PracticeSwissStanding[]
  unavailableReason: string | null
}

interface PoolPracticeRow {
  user_id: string
  pod_id: string | null
  competitive: boolean | null
  draft_state: unknown
}

interface PodPlayerRow {
  id: string
  username: string | null
  dropped: boolean | null
}

function unavailable(input: PracticeSwissSummaryInput, reason: string): PracticeSwissSummary {
  return {
    status: 'unavailable',
    practiceMatchGameId: input.practiceMatchGameId ?? null,
    poolShareId: input.poolShareId ?? null,
    currentRound: null,
    pairing: null,
    playerRecord: null,
    standings: [],
    unavailableReason: reason,
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function recordText(wins: number, losses: number, draws: number): string {
  return `${wins}-${losses}${draws > 0 ? `-${draws}` : ''}`
}

function currentRoundFrom(draftState: Record<string, unknown>, rounds: MatchmakingRound[]): number | null {
  const fromState = numberOrNull(draftState['currentRound'])
  if (fromState != null) return fromState
  return rounds.length > 0 ? Math.max(...rounds.map(round => round.roundNumber)) : null
}

function matchContainingGame(rounds: MatchmakingRound[], practiceMatchGameId: string | null | undefined): {
  round: MatchmakingRound
  match: MatchmakingMatch
  index: number
} | null {
  if (!practiceMatchGameId) return null
  for (const round of rounds) {
    const index = round.matches.findIndex(match => match.games.some(game => game.id === practiceMatchGameId))
    if (index >= 0) return { round, match: round.matches[index]!, index }
  }
  return null
}

function matchForPlayer(round: MatchmakingRound | null, userId: string): { match: MatchmakingMatch; index: number } | null {
  if (!round) return null
  const index = round.matches.findIndex(match =>
    match.player1?.id === userId || match.player2?.id === userId
  )
  return index >= 0 ? { match: round.matches[index]!, index } : null
}

function pairingFor(match: MatchmakingMatch, index: number, userId: string): PracticeSwissPairing {
  let opponent: string | null = null
  if (match.isBye) {
    opponent = 'Bye'
  } else if (match.player1?.id === userId) {
    opponent = match.player2?.username ?? 'Opponent pending'
  } else if (match.player2?.id === userId) {
    opponent = match.player1?.username ?? 'Opponent pending'
  }

  return {
    table: String(index + 1),
    opponent,
    status: match.finalConfirmed === true ? 'complete' : (match.currentGame?.status ?? 'paired'),
  }
}

export async function getPracticeSwissSummary(input: PracticeSwissSummaryInput): Promise<PracticeSwissSummary> {
  if (!input.poolShareId) return unavailable(input, 'pool_share_id_missing')

  const pool = await queryRow(
    `SELECT cp.user_id, cp.pod_id, p.competitive, p.draft_state
     FROM card_pools cp
     LEFT JOIN pods p ON p.id = cp.pod_id
     WHERE cp.share_id = $1`,
    [input.poolShareId]
  ) as PoolPracticeRow | null

  if (!pool) return unavailable(input, 'pool_not_found')
  if (!pool.pod_id || pool.competitive !== true) return unavailable(input, 'practice_not_competitive')

  const players = await queryRows(
    `SELECT pp.user_id AS id, u.username, pp.dropped
     FROM pod_players pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.pod_id = $1
       AND COALESCE(pp.is_bot, false) = false
     ORDER BY pp.seat_number`,
    [pool.pod_id]
  ) as unknown as PodPlayerRow[]

  const rounds = await fetchRoundsWithMatches(pool.pod_id)
  if (rounds.length === 0) return unavailable(input, 'rounds_not_started')

  const draftState = jsonParse<Record<string, unknown>>(pool.draft_state as Record<string, unknown> | string | null, {}) ?? {}
  const currentRound = currentRoundFrom(draftState, rounds)
  const gameMatch = matchContainingGame(rounds, input.practiceMatchGameId)
  const activeRound = gameMatch?.round
    ?? rounds.find(round => round.roundNumber === currentRound)
    ?? rounds[rounds.length - 1]
    ?? null
  const activeMatch = gameMatch
    ? { match: gameMatch.match, index: gameMatch.index }
    : matchForPlayer(activeRound, pool.user_id)

  const standings = computeRankedStandings(rounds as Parameters<typeof computeRankedStandings>[0], players)
  const mappedStandings = standings.map(row => ({
    rank: row.rank,
    playerName: row.username,
    record: recordText(row.wins, row.losses, row.draws),
    points: row.wins * 2 + row.draws,
  }))
  const self = standings.find(row => row.id === pool.user_id)

  return {
    status: 'ready',
    practiceMatchGameId: input.practiceMatchGameId ?? null,
    poolShareId: input.poolShareId,
    currentRound,
    pairing: activeMatch ? pairingFor(activeMatch.match, activeMatch.index, pool.user_id) : null,
    playerRecord: self ? recordText(self.wins, self.losses, self.draws) : null,
    standings: mappedStandings,
    unavailableReason: null,
  }
}
