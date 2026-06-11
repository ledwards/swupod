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
}

export interface MatchmakingRound {
  roundNumber: number
  status: string
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
            pm.id AS match_id, pm.player1_id, pm.player2_id, pm.is_bye,
            pm.game1_result, pm.game2_result, pm.game3_result,
            pm.player1_submitted, pm.player2_submitted,
            pm.final_confirmed, pm.match_winner, pm.pod_owner_override,
            pm.wayfinder_match_id,
            u1.username AS p1_username, u1.avatar_url AS p1_avatar,
            u2.username AS p2_username, u2.avatar_url AS p2_avatar
     FROM practice_rounds pr
     LEFT JOIN practice_matches pm ON pm.round_id = pr.id
     LEFT JOIN users u1 ON pm.player1_id = u1.id
     LEFT JOIN users u2 ON pm.player2_id = u2.id
     WHERE pr.pod_id = $1
     ORDER BY pr.round_number, pm.created_at`,
    [podId]
  )

  const roundsById = new Map<string, MatchmakingRound>()
  const rounds: MatchmakingRound[] = []

  for (const row of rows) {
    const roundId = String(row['round_id'])
    let round = roundsById.get(roundId)
    if (!round) {
      round = {
        roundNumber: Number(row['round_number']),
        status: String(row['round_status']),
        matches: [],
      }
      roundsById.set(roundId, round)
      rounds.push(round)
    }

    // A round with zero matches contributes one row whose pm.* columns are
    // all NULL — keep the round, skip the phantom match.
    if (row['match_id'] == null) continue

    round.matches.push({
      id: String(row['match_id']),
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
    })
  }

  return rounds
}
