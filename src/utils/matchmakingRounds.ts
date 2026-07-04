/**
 * Matchmaking rounds + matches for a competitive pod, fetched in ONE query
 * (U8, foundations hardening). Replaces the per-round practice_matches loop
 * that ran on the 2 s-polled GET /api/draft/[shareId] — an N+1 that grew with
 * round count on the hottest read path.
 *
 * LEFT JOIN from practice_rounds guarantees rounds with zero matches still
 * appear (with an empty matches array), exactly like the old per-round loop.
 * The returned shape is unchanged from what the route previously assembled.
 */
import { queryRows } from '@/lib/db'
import {
  summarizeCurrentPracticeGame,
  type CurrentPracticeGameSummary,
  type PersistedPracticeGameStatus,
  type PracticeGameResult,
} from '@/src/services/matchmaking/liveGames'

export interface MatchmakingPlayer {
  id: string
  username: string | null
  avatarUrl: string | null
}

export interface MatchmakingMatch {
  id: string
  player1: MatchmakingPlayer | null
  player2: MatchmakingPlayer | null
  isBye: boolean
  game1Result: unknown
  game2Result: unknown
  game3Result: unknown
  player1Submitted: unknown
  player2Submitted: unknown
  finalConfirmed: unknown
  matchWinner: unknown
  podOwnerOverride: unknown
  wayfinderMatchId: string | null
  games: MatchmakingGame[]
  currentGame: CurrentPracticeGameSummary
}

export interface MatchmakingGame {
  id: string
  gameNumber: number
  attemptNumber: number | null
  status: PersistedPracticeGameStatus
  createdByUserId: string | null
  lobbyId: string | null
  lobbyUrl: string | null
  spectateUrl: string | null
  wayfinderMatchId: string | null
  wayfinderGameId: string | null
  replayUrl: string | null
  result: PracticeGameResult | null
  failureReason: string | null
  lifecycleIdempotencyKey: string | null
  resultIdempotencyKey: string | null
  claimedAt: Date | string | null
  lobbyReadyAt: Date | string | null
  joinedAt: Date | string | null
  startedAt: Date | string | null
  completedAt: Date | string | null
  failedAt: Date | string | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
}

export interface MatchmakingRound {
  roundNumber: number
  status: string
  /** When the round began (practice_rounds.created_at) — anchors the round clock. */
  startedAt: Date | string | null
  matches: MatchmakingMatch[]
}

type QueryRowsFn = typeof queryRows

/**
 * Fetch every round (and its matches) for a pod in a single statement.
 *
 * @param podId - pods.id
 * @param q - query function (injectable so tests can count statements)
 */
export async function fetchRoundsWithMatches(
  podId: string,
  q: QueryRowsFn = queryRows
): Promise<MatchmakingRound[]> {
  const rows = await q(
    `SELECT pr.id AS round_id, pr.round_number, pr.status AS round_status,
            pr.created_at AS round_created_at,
            pm.id AS match_id, pm.player1_id, pm.player2_id, pm.is_bye,
            pm.game1_result, pm.game2_result, pm.game3_result,
            pm.player1_submitted, pm.player2_submitted,
            pm.final_confirmed, pm.match_winner, pm.pod_owner_override,
            pm.wayfinder_match_id,
            u1.username AS p1_username, u1.avatar_url AS p1_avatar,
            u2.username AS p2_username, u2.avatar_url AS p2_avatar,
            pmg.id AS game_id, pmg.game_number AS live_game_number,
            pmg.attempt_number AS live_attempt_number, pmg.status AS live_status,
            pmg.created_by_user_id AS live_created_by_user_id,
            pmg.lobby_id AS live_lobby_id, pmg.lobby_url AS live_lobby_url,
            pmg.spectate_url AS live_spectate_url,
            pmg.wayfinder_match_id AS live_wayfinder_match_id,
            pmg.wayfinder_game_id AS live_wayfinder_game_id,
            pmg.replay_url AS live_replay_url, pmg.result AS live_result,
            pmg.failure_reason AS live_failure_reason,
            pmg.lifecycle_idempotency_key AS live_lifecycle_idempotency_key,
            pmg.result_idempotency_key AS live_result_idempotency_key,
            pmg.claimed_at AS live_claimed_at,
            pmg.lobby_ready_at AS live_lobby_ready_at,
            pmg.joined_at AS live_joined_at,
            pmg.started_at AS live_started_at,
            pmg.completed_at AS live_completed_at,
            pmg.failed_at AS live_failed_at,
            pmg.created_at AS live_created_at,
            pmg.updated_at AS live_updated_at
     FROM practice_rounds pr
     LEFT JOIN practice_matches pm ON pm.round_id = pr.id
     LEFT JOIN users u1 ON pm.player1_id = u1.id
     LEFT JOIN users u2 ON pm.player2_id = u2.id
     LEFT JOIN practice_match_games pmg ON pmg.match_id = pm.id
     WHERE pr.pod_id = $1
     ORDER BY pr.round_number, pm.created_at, pmg.game_number, pmg.attempt_number`,
    [podId]
  )

  const roundsById = new Map<string, MatchmakingRound>()
  const matchesById = new Map<string, MatchmakingMatch>()
  const rounds: MatchmakingRound[] = []

  for (const row of rows) {
    const roundId = String(row['round_id'])
    let round = roundsById.get(roundId)
    if (!round) {
      round = {
        roundNumber: Number(row['round_number']),
        status: String(row['round_status']),
        startedAt: dateOrStringOrNull(row['round_created_at']),
        matches: [],
      }
      roundsById.set(roundId, round)
      rounds.push(round)
    }

    // A round with zero matches contributes one row whose pm.* columns are
    // all NULL — keep the round, skip the phantom match.
    if (row['match_id'] == null) continue

    const matchId = String(row['match_id'])
    let match = matchesById.get(matchId)
    if (!match) {
      match = {
        id: matchId,
        player1: row['player1_id']
          ? {
              id: String(row['player1_id']),
              username: (row['p1_username'] as string | null) ?? null,
              avatarUrl: (row['p1_avatar'] as string | null) ?? null,
            }
          : null,
        player2: row['player2_id']
          ? {
              id: String(row['player2_id']),
              username: (row['p2_username'] as string | null) ?? null,
              avatarUrl: (row['p2_avatar'] as string | null) ?? null,
            }
          : null,
        isBye: row['is_bye'] as boolean,
        game1Result: row['game1_result'],
        game2Result: row['game2_result'],
        game3Result: row['game3_result'],
        player1Submitted: row['player1_submitted'],
        player2Submitted: row['player2_submitted'],
        finalConfirmed: row['final_confirmed'],
        matchWinner: row['match_winner'],
        podOwnerOverride: row['pod_owner_override'],
        wayfinderMatchId: (row['wayfinder_match_id'] as string | null) || null,
        games: [],
        currentGame: summarizeCurrentPracticeGame({
          isBye: row['is_bye'] as boolean,
          finalConfirmed: row['final_confirmed'] as boolean,
          matchWinner: (row['match_winner'] as string | null) ?? null,
          game1Result: (row['game1_result'] as string | null) ?? null,
          game2Result: (row['game2_result'] as string | null) ?? null,
          game3Result: (row['game3_result'] as string | null) ?? null,
        }),
      }
      matchesById.set(matchId, match)
      round.matches.push(match)
    }

    if (row['game_id'] != null) {
      match.games.push(gameFromRow(row))
    }
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      match.currentGame = summarizeCurrentPracticeGame({
        isBye: match.isBye,
        finalConfirmed: match.finalConfirmed === true,
        matchWinner: stringOrNull(match.matchWinner),
        game1Result: stringOrNull(match.game1Result),
        game2Result: stringOrNull(match.game2Result),
        game3Result: stringOrNull(match.game3Result),
      }, match.games)
    }
  }

  return rounds
}

function gameFromRow(row: Record<string, unknown>): MatchmakingGame {
  return {
    id: String(row['game_id']),
    gameNumber: Number(row['live_game_number']),
    attemptNumber: numberOrNull(row['live_attempt_number']),
    status: row['live_status'] as PersistedPracticeGameStatus,
    createdByUserId: stringOrNull(row['live_created_by_user_id']),
    lobbyId: stringOrNull(row['live_lobby_id']),
    lobbyUrl: stringOrNull(row['live_lobby_url']),
    spectateUrl: stringOrNull(row['live_spectate_url']),
    wayfinderMatchId: stringOrNull(row['live_wayfinder_match_id']),
    wayfinderGameId: stringOrNull(row['live_wayfinder_game_id']),
    replayUrl: stringOrNull(row['live_replay_url']),
    result: gameResultOrNull(row['live_result']),
    failureReason: stringOrNull(row['live_failure_reason']),
    lifecycleIdempotencyKey: stringOrNull(row['live_lifecycle_idempotency_key']),
    resultIdempotencyKey: stringOrNull(row['live_result_idempotency_key']),
    claimedAt: dateOrStringOrNull(row['live_claimed_at']),
    lobbyReadyAt: dateOrStringOrNull(row['live_lobby_ready_at']),
    joinedAt: dateOrStringOrNull(row['live_joined_at']),
    startedAt: dateOrStringOrNull(row['live_started_at']),
    completedAt: dateOrStringOrNull(row['live_completed_at']),
    failedAt: dateOrStringOrNull(row['live_failed_at']),
    createdAt: dateOrStringOrNull(row['live_created_at']),
    updatedAt: dateOrStringOrNull(row['live_updated_at']),
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dateOrStringOrNull(value: unknown): Date | string | null {
  return value instanceof Date || typeof value === 'string' ? value : null
}

function gameResultOrNull(value: unknown): PracticeGameResult | null {
  return value === 'player1' || value === 'player2' || value === 'draw' ? value : null
}
