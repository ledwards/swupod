/**
 * Open-game Companion pipeline (Lobby V1, U2): claim contract, lobby attempt
 * lifecycle, and result finalize. Adapted from the Swiss Practice pipeline
 * (src/services/matchmaking/liveGames.ts) with the same recovery semantics:
 * attempt rows per lobby try, newest-lobby-wins, idempotent everything.
 *
 * Claim contract (mirrors practice's first-to-claim symmetry, R7/R34/R37):
 *  - create_lobby   caller's Companion should create the Karabast lobby
 *  - wait_for_lobby no lobby yet and caller shouldn't create (incapable or
 *                   another creation in flight)
 *  - join_lobby     lobby exists; caller's Companion should auto-join
 *  - open_lobby     lobby exists and caller created it; just (re)open it
 *  - lobby_link     lobby exists but caller has no capable Companion —
 *                   display the URL as a direct link (R37; display, never
 *                   a paste input)
 */
import type { TxClient } from '@/lib/db'
import { OpenGameError } from './openGames'

export type OpenGameLiveErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'terminal'
  | 'not_in_game'

export class OpenGameLiveError extends Error {
  code: OpenGameLiveErrorCode
  status: number

  constructor(code: OpenGameLiveErrorCode, message: string, status = 409) {
    super(message)
    this.name = 'OpenGameLiveError'
    this.code = code
    this.status = status
  }
}

const LIVE_PARENT_STATUSES = ['open', 'accepted', 'lobby_ready', 'in_progress']
const ACTIVE_ATTEMPT_STATUSES = ['creating', 'lobby_ready', 'in_progress']

export interface ClaimResult {
  action: 'create_lobby' | 'wait_for_lobby' | 'join_lobby' | 'open_lobby' | 'lobby_link'
  bestOf?: number
  attemptId?: string
  lobbyName?: string
  lobbyUrl?: string
  gameStatus: string
}

async function loadGameForUpdate(tx: TxClient, shareId: string): Promise<Record<string, unknown>> {
  const game = await tx.queryRow('SELECT * FROM open_games WHERE share_id = $1 FOR UPDATE', [shareId])
  if (!game) throw new OpenGameLiveError('not_found', 'Game not found', 404)
  return game
}

/**
 * Claim the game for the calling seat: tells that seat's UI/Companion what to
 * do next. Poster may claim their own OPEN listing (create-at-post, R34).
 */
export async function claimOpenGame(params: {
  shareId: string
  userId: string
  companionCapable: boolean
}): Promise<ClaimResult> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(async tx => {
    const game = await loadGameForUpdate(tx, params.shareId)
    const isSeat = game.player1_id === params.userId || game.player2_id === params.userId
    if (!isSeat) throw new OpenGameLiveError('forbidden', 'Only players in this game can do that', 403)
    if (!LIVE_PARENT_STATUSES.includes(String(game.status))) {
      throw new OpenGameLiveError('terminal', 'This game already ended')
    }

    const active = await tx.queryRow(
      `SELECT * FROM open_game_lobby_attempts
       WHERE open_game_id = $1 AND status = ANY($2)
       ORDER BY attempt_number DESC LIMIT 1`,
      [game.id, ACTIVE_ATTEMPT_STATUSES]
    )

    if (active && active.lobby_url) {
      const lobbyUrl = String(active.lobby_url)
      if (active.created_by_user_id === params.userId) {
        return { action: 'open_lobby', lobbyUrl, gameStatus: String(game.status) }
      }
      if (params.companionCapable) {
        return { action: 'join_lobby', lobbyUrl, gameStatus: String(game.status) }
      }
      return { action: 'lobby_link', lobbyUrl, gameStatus: String(game.status) }
    }

    if (active) {
      // A creation in flight (no lobby URL yet). A 'creating' attempt whose
      // Companion never reported back (closed tab, dev deck URL, extension
      // not loaded) must not wedge the lobby forever: after 60s the HOST's
      // next claim supersedes it and starts a fresh attempt.
      const ageMs = Date.now() - new Date(String(active.created_at)).getTime()
      const staleCreating =
        String(active.status) === 'creating' &&
        !active.lobby_url &&
        ageMs > 60_000 &&
        String(game.player1_id) === String(params.userId) &&
        params.companionCapable
      if (!staleCreating) {
        return { action: 'wait_for_lobby', gameStatus: String(game.status) }
      }
      await tx.query(
        `UPDATE open_game_lobby_attempts
         SET status = 'failed', failure_reason = 'stale_creating_superseded', updated_at = NOW()
         WHERE id = $1`,
        [active.id]
      )
    }

    if (!params.companionCapable) {
      return { action: 'wait_for_lobby', gameStatus: String(game.status) }
    }

    // No race to create: only the HOST's Companion creates the Karabast
    // lobby. The joiner waits for the link (join_lobby/lobby_link above once
    // an attempt has a URL).
    if (String(game.player1_id) !== String(params.userId)) {
      return { action: 'wait_for_lobby', gameStatus: String(game.status) }
    }

    const { buildLobbyName } = await import('@/src/utils/karabastLobby')
    const next = await tx.queryRow(
      `INSERT INTO open_game_lobby_attempts (open_game_id, attempt_number, status, created_by_user_id)
       VALUES ($1, COALESCE((SELECT MAX(attempt_number) FROM open_game_lobby_attempts WHERE open_game_id = $1), 0) + 1, 'creating', $2)
       RETURNING id`,
      [game.id, params.userId]
    )
    return {
      action: 'create_lobby',
      attemptId: String(next!.id),
      // R29: no archetype in the lobby name — deck identity stays hidden.
      lobbyName: buildLobbyName({ setCode: String(game.set_code), poolType: String(game.format) }),
      bestOf: Number(game.best_of) || 1,
      gameStatus: String(game.status),
    }
  })
}

// ---------------------------------------------------------------------------
// Lifecycle ingestion (Companion → PTP)
// ---------------------------------------------------------------------------

export type OpenGameLifecycleStatus = 'lobby_ready' | 'opponent_joined' | 'in_progress' | 'failed'

export interface LifecycleParams {
  openGameShareId: string
  status: OpenGameLifecycleStatus
  /**
   * Set when the report arrived with a SESSION credential (the Companion's
   * direct fallback while the Wayfinder hub is unreachable) instead of the
   * service key. That caller must be a seat of the game — enforced here.
   * Null/absent = trusted server-to-server call (hub, PTP_SERVICE_KEY).
   */
  actorUserId?: string | null
  lobbyId?: string | null
  lobbyUrl?: string | null
  spectateUrl?: string | null
  wayfinderMatchId?: string | null
  wayfinderGameId?: string | null
  failureReason?: string | null
  lifecycleIdempotencyKey?: string | null
  /** R37: a Companion-running Karabast-side joiner reports their own pool. */
  joinerPoolShareId?: string | null
}

export interface LifecycleResult {
  shareId: string
  gameStatus: string
  duplicate: boolean
  boardChanged: boolean
  player1Id: string
  player2Id: string | null
}

export async function recordOpenGameLifecycle(params: LifecycleParams): Promise<LifecycleResult> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(async tx => {
    const game = await loadGameForUpdate(tx, params.openGameShareId)

    // Session-credentialed reports (Companion direct fallback) are only valid
    // from a seat of this game — anyone else's cookie is a 403, mirroring the
    // claim path's seat gate.
    if (
      params.actorUserId &&
      game.player1_id !== params.actorUserId &&
      game.player2_id !== params.actorUserId
    ) {
      throw new OpenGameLiveError('forbidden', 'Only players in this game can do that', 403)
    }

    const done = (duplicate: boolean, boardChanged = false): LifecycleResult => ({
      shareId: String(game.share_id),
      gameStatus: String(game.status),
      duplicate,
      boardChanged,
      player1Id: String(game.player1_id),
      player2Id: game.player2_id ? String(game.player2_id) : null,
    })

    if (params.lifecycleIdempotencyKey) {
      const seen = await tx.queryRow(
        'SELECT 1 AS hit FROM open_game_lobby_attempts WHERE lifecycle_idempotency_key = $1',
        [params.lifecycleIdempotencyKey]
      )
      if (seen) return done(true)
    }

    if (!LIVE_PARENT_STATUSES.includes(String(game.status))) {
      // Terminal games acknowledge but never resurrect.
      return done(false)
    }

    let attempt = await tx.queryRow(
      `SELECT * FROM open_game_lobby_attempts
       WHERE open_game_id = $1 AND status = ANY($2)
       ORDER BY attempt_number DESC LIMIT 1`,
      [game.id, ACTIVE_ATTEMPT_STATUSES]
    )
    if (!attempt) {
      // Lifecycle can land before any claim recorded an attempt (races, and
      // the MANUAL flow: the host makes the Karabast lobby by hand, so no
      // create_lobby claim ever happened — the Companion's manual-lobby
      // binding reports lobby_ready directly). Create the attempt so the
      // event has a home, attributed to the host (player1 — only the host's
      // Companion ever creates/binds a lobby) so their next claim resolves
      // to open_lobby instead of join_lobby.
      attempt = await tx.queryRow(
        `INSERT INTO open_game_lobby_attempts (open_game_id, attempt_number, status, created_by_user_id)
         VALUES ($1, COALESCE((SELECT MAX(attempt_number) FROM open_game_lobby_attempts WHERE open_game_id = $1), 0) + 1, 'creating', $2)
         RETURNING *`,
        [game.id, game.player1_id]
      )
    }

    const key = params.lifecycleIdempotencyKey ?? null
    let parentStatus = String(game.status)
    let boardChanged = false

    switch (params.status) {
      case 'lobby_ready': {
        await tx.query(
          `UPDATE open_game_lobby_attempts
           SET status = 'lobby_ready', lobby_id = COALESCE($2, lobby_id),
               lobby_url = COALESCE($3, lobby_url), spectate_url = COALESCE($4, spectate_url),
               wayfinder_match_id = COALESCE($5, wayfinder_match_id),
               lifecycle_idempotency_key = COALESCE($6, lifecycle_idempotency_key),
               lobby_ready_at = COALESCE(lobby_ready_at, NOW()), updated_at = NOW()
           WHERE id = $1`,
          [attempt!.id, params.lobbyId ?? null, params.lobbyUrl ?? null, params.spectateUrl ?? null, params.wayfinderMatchId ?? null, key]
        )
        // An OPEN listing keeps its board slot while the lobby pre-creates (R34).
        if (parentStatus === 'accepted') parentStatus = 'lobby_ready'
        break
      }
      case 'opponent_joined': {
        await tx.query(
          `UPDATE open_game_lobby_attempts
           SET opponent_joined_at = COALESCE(opponent_joined_at, NOW()),
               lifecycle_idempotency_key = COALESCE($2, lifecycle_idempotency_key), updated_at = NOW()
           WHERE id = $1`,
          [attempt!.id, key]
        )
        // R37: someone is in the lobby — the listing leaves the board NOW.
        if (parentStatus === 'open') boardChanged = true
        if (game.player2_id == null) {
          const bound = await bindKarabastJoiner(tx, game, params.joinerPoolShareId ?? null)
          if (!bound) {
            await tx.query('UPDATE open_games SET player2_external = TRUE, updated_at = NOW() WHERE id = $1', [game.id])
          }
        }
        parentStatus = 'in_progress'
        break
      }
      case 'in_progress': {
        await tx.query(
          `UPDATE open_game_lobby_attempts
           SET status = 'in_progress', started_at = COALESCE(started_at, NOW()),
               wayfinder_game_id = COALESCE($2, wayfinder_game_id),
               lifecycle_idempotency_key = COALESCE($3, lifecycle_idempotency_key), updated_at = NOW()
           WHERE id = $1`,
          [attempt!.id, params.wayfinderGameId ?? null, key]
        )
        if (parentStatus === 'open') boardChanged = true
        parentStatus = 'in_progress'
        break
      }
      case 'failed': {
        await tx.query(
          `UPDATE open_game_lobby_attempts
           SET status = 'failed', failure_reason = $2, failed_at = NOW(),
               lifecycle_idempotency_key = COALESCE($3, lifecycle_idempotency_key), updated_at = NOW()
           WHERE id = $1`,
          [attempt!.id, params.failureReason ?? null, key]
        )
        // Dead-lobby recovery: if the ACTIVE attempt had already promoted the
        // game to lobby_ready and now died pre-game (host abandoned the
        // Karabast lobby, automation collapse), revert to 'accepted' so the
        // GET stops carrying a dead lobbyUrl and BOTH seats fall back to the
        // create state (host: Create/Play button, joiner: waiting note). Never
        // touches a game with a recorded result, and 'open'/'accepted'/
        // 'in_progress' parents stay put — the next claim starts a fresh attempt.
        if (parentStatus === 'lobby_ready' && game.result == null) parentStatus = 'accepted'
        break
      }
    }

    if (parentStatus !== String(game.status)) {
      await tx.query('UPDATE open_games SET status = $2, updated_at = NOW() WHERE id = $1', [game.id, parentStatus])
    }

    const fresh = await tx.queryRow('SELECT status, player2_id FROM open_games WHERE id = $1', [game.id])
    return {
      shareId: String(game.share_id),
      gameStatus: String(fresh!.status),
      duplicate: false,
      boardChanged,
      player1Id: String(game.player1_id),
      player2Id: fresh!.player2_id ? String(fresh!.player2_id) : null,
    }
  })
}

/**
 * R37 seat-2 binding: a Karabast-side joiner running the Companion reports
 * their pool; bind it when it's a different PTP user with a compatible,
 * built deck. Returns false when the seat stays external.
 */
async function bindKarabastJoiner(
  tx: TxClient,
  game: Record<string, unknown>,
  joinerPoolShareId: string | null
): Promise<boolean> {
  if (!joinerPoolShareId) return false
  const pool = await tx.queryRow(
    `SELECT cp.id, cp.user_id, cp.set_code, cp.pool_type,
            (bd.card_pool_id IS NOT NULL) AS deck_ready
     FROM card_pools cp
     LEFT JOIN built_decks bd ON bd.card_pool_id = cp.id
     WHERE cp.share_id = $1`,
    [joinerPoolShareId]
  )
  if (!pool || !pool.user_id) return false
  if (pool.user_id === game.player1_id) return false
  if (String(pool.set_code) !== String(game.set_code) || String(pool.pool_type) !== String(game.format)) return false
  if (pool.deck_ready !== true) return false
  await tx.query(
    `UPDATE open_games SET player2_id = $2, player2_pool_id = $3, player2_external = FALSE,
            accepted_at = COALESCE(accepted_at, NOW()), updated_at = NOW()
     WHERE id = $1`,
    [game.id, pool.user_id, pool.id]
  )
  return true
}

// ---------------------------------------------------------------------------
// Result finalize
// ---------------------------------------------------------------------------

export interface OpenGameResultParams {
  openGameShareId: string
  reportingPoolShareId: string
  result: 'win' | 'loss' | 'draw'
  wayfinderMatchId: string
  replayUrl?: string | null
  playerLeader?: string | null
  playerLeaderImage?: string | null
  playerBase?: string | null
  playerArchetype?: string | null
  opponentLeader?: string | null
  opponentLeaderImage?: string | null
  opponentBase?: string | null
  opponentArchetype?: string | null
  opponentName?: string | null
}

export interface OpenGameResultOutcome {
  duplicate: boolean
  terminal: boolean
  shareId: string
  player1Id?: string
  player2Id?: string | null
}

function canonicalMatchId(matchId: string): string {
  return matchId.startsWith('ing-') ? matchId.slice(4) : matchId
}

/**
 * Finalize an open game from a Companion result report. The REPORTER's own
 * pool counters and casual_matches row are handled by the existing
 * non-competitive route path; this finalizes the open_games row and writes
 * the OPPOSITE seat (attribution from the open_games row, never
 * ptp_lobby_pool_links — the documented identity-loss failure class).
 */
export async function recordOpenGameResult(params: OpenGameResultParams): Promise<OpenGameResultOutcome> {
  const { withTransaction } = await import('@/lib/db')
  const canonicalId = canonicalMatchId(params.wayfinderMatchId)

  return withTransaction(async tx => {
    const game = await loadGameForUpdate(tx, params.openGameShareId)
    const shareId = String(game.share_id)

    if (!LIVE_PARENT_STATUSES.includes(String(game.status)) && String(game.status) !== 'complete') {
      return { duplicate: false, terminal: true, shareId }
    }
    if (game.result != null || String(game.status) === 'complete') {
      return { duplicate: true, terminal: false, shareId }
    }

    const reporterPool = await tx.queryRow('SELECT id FROM card_pools WHERE share_id = $1', [params.reportingPoolShareId])
    if (!reporterPool) throw new OpenGameLiveError('not_in_game', 'Reporting pool not found', 404)

    let reporterSeat: 1 | 2
    if (reporterPool.id === game.player1_pool_id) reporterSeat = 1
    else if (reporterPool.id === game.player2_pool_id) reporterSeat = 2
    else throw new OpenGameLiveError('not_in_game', 'Pool is not seated in this game')

    const gameResult =
      params.result === 'draw'
        ? 'draw'
        : (params.result === 'win') === (reporterSeat === 1)
          ? 'player1'
          : 'player2'

    await tx.query(
      `UPDATE open_games
       SET status = 'complete', result = $2, wayfinder_match_id = $3,
           result_idempotency_key = COALESCE(result_idempotency_key, $3),
           completed_at = NOW(), resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [game.id, gameResult, canonicalId]
    )
    await tx.query(
      `UPDATE open_game_lobby_attempts SET status = 'complete', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
       WHERE open_game_id = $1 AND status = ANY($2)`,
      [game.id, ACTIVE_ATTEMPT_STATUSES]
    )

    // Opposite-seat write-through (single-delivery finalize for both seats).
    const oppUserId = reporterSeat === 1 ? game.player2_id : game.player1_id
    const oppPoolId = reporterSeat === 1 ? game.player2_pool_id : game.player1_pool_id
    if (oppUserId && oppPoolId) {
      const oppResult = params.result === 'draw' ? 'draw' : params.result === 'win' ? 'loss' : 'win'
      const { isLeaderMirrorMatch } = await import('@/src/utils/mirrorMatch')
      const mirror = isLeaderMirrorMatch(params.playerLeader ?? null, params.opponentLeader ?? null)
      const winDelta = !mirror && oppResult === 'win' ? 1 : 0
      const lossDelta = !mirror && oppResult === 'loss' ? 1 : 0
      const drawDelta = !mirror && oppResult === 'draw' ? 1 : 0

      await tx.query(
        `UPDATE card_pools
         SET wins = wins + CASE WHEN $4 = ANY(COALESCE(wayfinder_match_ids, '{}')) THEN 0 ELSE $1 END,
             losses = losses + CASE WHEN $4 = ANY(COALESCE(wayfinder_match_ids, '{}')) THEN 0 ELSE $2 END,
             draws = draws + CASE WHEN $4 = ANY(COALESCE(wayfinder_match_ids, '{}')) THEN 0 ELSE $3 END,
             wayfinder_match_ids = CASE
               WHEN $4 = ANY(COALESCE(wayfinder_match_ids, '{}')) THEN wayfinder_match_ids
               ELSE array_append(COALESCE(wayfinder_match_ids, '{}'), $4)
             END,
             updated_at = NOW()
         WHERE id = $5`,
        [winDelta, lossDelta, drawDelta, canonicalId, oppPoolId]
      )

      const reporterUsername = await tx.queryRow(
        'SELECT username FROM users WHERE id = $1',
        [reporterSeat === 1 ? game.player1_id : game.player2_id]
      )
      // Perspective swap: the opposite seat's "player" is the reporter's "opponent".
      await tx.query(
        `INSERT INTO casual_matches (
           user_id, card_pool_id, wayfinder_match_id, wayfinder_replay_url, result,
           opponent_name,
           player_leader, player_leader_image, player_base, player_archetype,
           opponent_leader, opponent_leader_image, opponent_base, opponent_archetype
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (user_id, card_pool_id, wayfinder_match_id) WHERE wayfinder_match_id IS NOT NULL
         DO UPDATE SET
           wayfinder_replay_url = COALESCE(EXCLUDED.wayfinder_replay_url, casual_matches.wayfinder_replay_url),
           result = EXCLUDED.result`,
        [
          oppUserId, oppPoolId, canonicalId, params.replayUrl ?? null, oppResult,
          reporterUsername?.username ?? null,
          params.opponentLeader ?? null, params.opponentLeaderImage ?? null, params.opponentBase ?? null, params.opponentArchetype ?? null,
          params.playerLeader ?? null, params.playerLeaderImage ?? null, params.playerBase ?? null, params.playerArchetype ?? null,
        ]
      )
    }

    return {
      duplicate: false,
      terminal: false,
      shareId,
      player1Id: String(game.player1_id),
      player2Id: game.player2_id ? String(game.player2_id) : null,
    }
  })
}

// Re-export for route convenience (shared error surface with openGames).
export { OpenGameError }
