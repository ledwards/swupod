// Canonical Live Swiss Practice fixture.
//
// This is the single source of truth for the pod / pool / round / match graph
// used by live Swiss Practice end-to-end testing. It is consumed by:
//   - the test-only HTTP bridge (app/api/test/live-swiss/{seed,state,cleanup})
//     so an EXTERNAL harness (e.g. the Wayfinder plugin e2e in its own repo) can
//     stand up and observe a Swiss pod on a running PTP instance, and
//   - the in-repo Playwright e2e (tests/e2e/live-swiss-fake-companion.spec.ts).
//
// Keeping one implementation guarantees the cross-repo harness and the local
// e2e always seed identical state, so assertions written against one hold for
// the other.
//
// The helpers take a minimal `SqlExec` so they work both server-side (lib/db's
// `query`) and inside the Playwright process (a raw `pg.Pool`). Neither caller
// has to share a connection pool implementation.

export interface SqlResult {
  rows: Array<Record<string, unknown>>
  rowCount?: number | null
}

export type SqlExec = (text: string, params?: unknown[]) => Promise<SqlResult>

export interface SeededMatch {
  matchId: string
  player1Id: string
  player2Id: string
  player1PoolShareId: string
  player2PoolShareId: string
}

export interface SeededLiveSwissPod {
  podId: string
  podShareId: string
  roundId: string
  poolShareIds: string[]
  matches: SeededMatch[]
}

export interface SeedLiveSwissOptions {
  /** Exactly four user ids. Seats 1..4 map to userIds[0..3]. */
  userIds: string[]
  setCode?: string
  setName?: string
  podName?: string
}

export interface LiveSwissGameState {
  gameId: string
  gameNumber: number
  attemptNumber: number
  status: string
  lobbyId: string | null
  lobbyUrl: string | null
  spectateUrl: string | null
  wayfinderMatchId: string | null
  wayfinderGameId: string | null
  result: string | null
  replayUrl: string | null
  failureReason: string | null
}

export interface LiveSwissMatchState {
  matchId: string
  player1Id: string | null
  player2Id: string | null
  isBye: boolean
  gameResults: Array<string | null>
  finalConfirmed: boolean
  matchWinner: string | null
  wayfinderMatchId: string | null
  games: LiveSwissGameState[]
}

export interface LiveSwissRoundState {
  roundId: string
  roundNumber: number
  status: string
  matches: LiveSwissMatchState[]
}

export interface LiveSwissPodState {
  podId: string
  podShareId: string
  currentRound: number | null
  rounds: LiveSwissRoundState[]
}

/**
 * Test endpoints are disabled in production unless explicitly allowed. Mirrors
 * the guard used by app/api/test/create-user/route.ts so all PTP test-only
 * surfaces share one risk posture.
 */
export function liveSwissTestEndpointsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || Boolean(process.env.ALLOW_TEST_USERS)
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Seed a 4-player competitive pod in the matchmaking phase with an active
 * round 1 and two head-to-head matches. Round-1 pairing is seats (1 vs 3) and
 * (2 vs 4) — chosen so that completing round 1 produces the deterministic
 * round-2 pairing (1 vs 2) and (3 vs 4) that the e2e asserts on.
 *
 * Does NOT create users — the caller owns user creation and auth (the HTTP
 * route mints session tokens, the Playwright spec uses its own test users).
 */
export async function seedLiveSwissPod(
  exec: SqlExec,
  {
    userIds,
    setCode = 'SOR',
    setName = 'Spark of Rebellion',
    podName = 'Live Swiss Fixture',
  }: SeedLiveSwissOptions
): Promise<SeededLiveSwissPod> {
  if (!Array.isArray(userIds) || userIds.length !== 4) {
    throw new Error('seedLiveSwissPod requires exactly 4 userIds')
  }
  const [user1, user2, user3, user4] = userIds
  if (!user1 || !user2 || !user3 || !user4) {
    throw new Error('seedLiveSwissPod requires four non-empty userIds')
  }

  const podShareId = uniqueId('live-swiss-pod')
  const podRows = (await exec(
    `INSERT INTO pods (
       share_id, host_id, set_code, set_name, name, status,
       max_players, current_players, competitive, draft_state, state_version,
       box_packs, is_public
     )
     VALUES ($1, $2, $3, $4, $5, 'complete', 4, 4, true, $6::jsonb, 1, '[]'::jsonb, false)
     RETURNING id`,
    [
      podShareId,
      userIds[0],
      setCode,
      setName,
      podName,
      JSON.stringify({ phase: 'matchmaking', matchmakingStatus: 'active', currentRound: 1 }),
    ]
  )).rows as Array<{ id: string }>
  const podId = podRows[0]?.id
  if (!podId) throw new Error('seedLiveSwissPod: pod insert returned no id')

  const poolShareIds: string[] = []
  for (let i = 0; i < userIds.length; i++) {
    const poolShareId = uniqueId(`live-swiss-pool-${i}`)
    await exec(
      `INSERT INTO card_pools (
         share_id, pod_id, user_id, set_code, pool_type, cards, deck_builder_state,
         wins, losses, draws, wayfinder_match_ids, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, 'draft', '[]'::jsonb, $5::jsonb, 0, 0, 0, '{}', NOW(), NOW())`,
      [
        poolShareId,
        podId,
        userIds[i],
        setCode,
        JSON.stringify({ cardPositions: {}, poolName: `Live Swiss Deck ${i + 1}` }),
      ]
    )
    poolShareIds.push(poolShareId)
  }

  for (let seat = 0; seat < userIds.length; seat++) {
    await exec(
      `INSERT INTO pod_players (
         pod_id, user_id, seat_number, pick_status, is_bot,
         leaders, drafted_leaders, drafted_cards, current_pack
       )
       VALUES ($1, $2, $3, 'done', false, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
      [podId, userIds[seat], seat + 1]
    )
  }

  const roundRows = (await exec(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at)
     VALUES ($1, 1, 'active', NOW())
     RETURNING id`,
    [podId]
  )).rows as Array<{ id: string }>
  const roundId = roundRows[0]?.id
  if (!roundId) throw new Error('seedLiveSwissPod: round insert returned no id')

  const matchOneId = await insertPracticeMatch(exec, roundId, podId, user1, user3)
  const matchTwoId = await insertPracticeMatch(exec, roundId, podId, user2, user4)

  const [pool1, pool2, pool3, pool4] = poolShareIds
  if (!pool1 || !pool2 || !pool3 || !pool4) {
    throw new Error('seedLiveSwissPod: expected four pool share ids')
  }

  return {
    podId,
    podShareId,
    roundId,
    poolShareIds,
    matches: [
      {
        matchId: matchOneId,
        player1Id: user1,
        player2Id: user3,
        player1PoolShareId: pool1,
        player2PoolShareId: pool3,
      },
      {
        matchId: matchTwoId,
        player1Id: user2,
        player2Id: user4,
        player1PoolShareId: pool2,
        player2PoolShareId: pool4,
      },
    ],
  }
}

async function insertPracticeMatch(
  exec: SqlExec,
  roundId: string,
  podId: string,
  player1Id: string,
  player2Id: string
): Promise<string> {
  const rows = (await exec(
    `INSERT INTO practice_matches (
       round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, created_at
     )
     VALUES ($1, $2, $3, $4, false, false, NOW())
     RETURNING id`,
    [roundId, podId, player1Id, player2Id]
  )).rows as Array<{ id: string }>
  const id = rows[0]?.id
  if (!id) throw new Error('insertPracticeMatch: insert returned no id')
  return id
}

/**
 * Read the full live Swiss state for a pod by share id: every round, its
 * matches (aggregate Bo3 result + per-game live rows). Returns null if no pod
 * with that share id exists. Intended for deterministic external assertions.
 */
export async function readLiveSwissPodState(
  exec: SqlExec,
  podShareId: string
): Promise<LiveSwissPodState | null> {
  const podRow = (await exec(
    'SELECT id, draft_state FROM pods WHERE share_id = $1',
    [podShareId]
  )).rows[0] as { id: string; draft_state: Record<string, unknown> | null } | undefined
  if (!podRow) return null

  const podId = podRow.id
  const draftState = podRow.draft_state ?? {}
  const currentRound = typeof draftState.currentRound === 'number' ? draftState.currentRound : null

  const rounds = (await exec(
    'SELECT id, round_number, status FROM practice_rounds WHERE pod_id = $1 ORDER BY round_number',
    [podId]
  )).rows as Array<{ id: string; round_number: number; status: string }>

  const matches = (await exec(
    `SELECT id, round_id, player1_id, player2_id, is_bye,
            game1_result, game2_result, game3_result,
            final_confirmed, match_winner, wayfinder_match_id
     FROM practice_matches WHERE pod_id = $1 ORDER BY created_at`,
    [podId]
  )).rows as Array<{
    id: string
    round_id: string
    player1_id: string | null
    player2_id: string | null
    is_bye: boolean
    game1_result: string | null
    game2_result: string | null
    game3_result: string | null
    final_confirmed: boolean
    match_winner: string | null
    wayfinder_match_id: string | null
  }>

  const games = (await exec(
    `SELECT id, match_id, game_number, attempt_number, status, lobby_id, lobby_url,
            spectate_url, wayfinder_match_id, wayfinder_game_id, result, replay_url, failure_reason
     FROM practice_match_games WHERE pod_id = $1 ORDER BY game_number, attempt_number`,
    [podId]
  )).rows as Array<{
    id: string
    match_id: string
    game_number: number
    attempt_number: number
    status: string
    lobby_id: string | null
    lobby_url: string | null
    spectate_url: string | null
    wayfinder_match_id: string | null
    wayfinder_game_id: string | null
    result: string | null
    replay_url: string | null
    failure_reason: string | null
  }>

  return {
    podId,
    podShareId,
    currentRound,
    rounds: rounds.map(round => ({
      roundId: round.id,
      roundNumber: round.round_number,
      status: round.status,
      matches: matches
        .filter(match => match.round_id === round.id)
        .map(match => ({
          matchId: match.id,
          player1Id: match.player1_id,
          player2Id: match.player2_id,
          isBye: match.is_bye,
          gameResults: [match.game1_result, match.game2_result, match.game3_result],
          finalConfirmed: match.final_confirmed,
          matchWinner: match.match_winner,
          wayfinderMatchId: match.wayfinder_match_id,
          games: games
            .filter(game => game.match_id === match.id)
            .map(game => ({
              gameId: game.id,
              gameNumber: game.game_number,
              attemptNumber: game.attempt_number,
              status: game.status,
              lobbyId: game.lobby_id,
              lobbyUrl: game.lobby_url,
              spectateUrl: game.spectate_url,
              wayfinderMatchId: game.wayfinder_match_id,
              wayfinderGameId: game.wayfinder_game_id,
              result: game.result,
              replayUrl: game.replay_url,
              failureReason: game.failure_reason,
            })),
        })),
    })),
  }
}

/**
 * Delete every pod-scoped row created by seedLiveSwissPod. Ordered so that rows
 * referencing users(id) (practice_match_games.created_by_user_id,
 * practice_matches.player*_id) are removed before any user cleanup the caller
 * performs afterward.
 */
export async function cleanupLiveSwissPod(
  exec: SqlExec,
  { podId }: { podId: string }
): Promise<void> {
  await exec('DELETE FROM practice_match_games WHERE pod_id = $1', [podId])
  await exec('DELETE FROM practice_matches WHERE pod_id = $1', [podId])
  await exec('DELETE FROM practice_rounds WHERE pod_id = $1', [podId])
  await exec('DELETE FROM card_pools WHERE pod_id = $1', [podId])
  await exec('DELETE FROM pod_players WHERE pod_id = $1', [podId])
  await exec('DELETE FROM pods WHERE id = $1', [podId])
}
