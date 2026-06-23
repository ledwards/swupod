import { deriveMatchWinner } from './results'
import type { TxClient } from '@/lib/db'
import type { RoundAdvanceResult } from './advancement'

export type PracticeGameResult = 'player1' | 'player2' | 'draw'

export type PersistedPracticeGameStatus =
  | 'creating'
  | 'lobby_ready'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'voided'

export type PracticeGameStatus = 'pending' | PersistedPracticeGameStatus

export type GameNumber = 1 | 2 | 3

export interface PracticeMatchAggregateLike {
  isBye?: boolean | null
  finalConfirmed?: boolean | null
  matchWinner?: string | null
  game1Result?: PracticeGameResult | string | null
  game2Result?: PracticeGameResult | string | null
  game3Result?: PracticeGameResult | string | null
}

export interface PracticeMatchGameLike {
  id?: string | null
  matchId?: string | null
  roundId?: string | null
  podId?: string | null
  gameNumber: number
  attemptNumber?: number | null
  status: PersistedPracticeGameStatus
  result?: PracticeGameResult | null
  lobbyId?: string | null
  replayUrl?: string | null
  lobbyUrl?: string | null
  spectateUrl?: string | null
  wayfinderMatchId?: string | null
  wayfinderGameId?: string | null
  createdByUserId?: string | null
  lifecycleIdempotencyKey?: string | null
  resultIdempotencyKey?: string | null
  claimedAt?: Date | string | null
  lobbyReadyAt?: Date | string | null
  joinedAt?: Date | string | null
  startedAt?: Date | string | null
  completedAt?: Date | string | null
  failedAt?: Date | string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
  failureReason?: string | null
}

export interface GameResultsByNumber {
  game1: PracticeGameResult | null
  game2: PracticeGameResult | null
  game3: PracticeGameResult | null
}

export interface CurrentPracticeGameSummary {
  status: PracticeGameStatus
  gameNumber: GameNumber | null
  game: PracticeMatchGameLike | null
  result: PracticeGameResult | null
  replayUrl: string | null
  lobbyUrl: string | null
  spectateUrl: string | null
  elapsedSeconds: number | null
  stale: boolean
  retryable: boolean
}

export type PracticeGameClaimAction =
  | 'create_lobby'
  | 'join_lobby'
  | 'wait_for_lobby'
  | 'already_complete'
  | 'manual_only'

export type PracticeGameLifecycleStatus = 'lobby_ready' | 'joined' | 'in_progress' | 'failed'
export type WayfinderReportedResult = 'win' | 'loss' | 'draw'

export interface PracticeGameClaimParams {
  shareId: string
  matchId: string
  userId: string
  now?: Date
  staleAfterMs?: number | undefined
}

export interface PracticeGameClaimResult {
  action: PracticeGameClaimAction
  practiceMatchGameId: string | null
  matchId: string
  podId: string
  roundId: string
  shareId: string
  gameNumber: GameNumber | null
  attemptNumber: number | null
  status: PracticeGameStatus
  createdByUserId: string | null
  lobbyUrl: string | null
  spectateUrl: string | null
  stale: boolean
  retryable: boolean
  manualFallbackAvailable: true
  isNewlyCreated: boolean
}

export class PracticeGameClaimError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PracticeGameClaimError'
  }
}

export interface PracticeGameLifecycleParams {
  practiceMatchGameId: string
  poolShareId: string
  status: PracticeGameLifecycleStatus
  lobbyId?: string | null
  lobbyUrl?: string | null
  spectateUrl?: string | null
  wayfinderMatchId?: string | null
  wayfinderGameId?: string | null
  failureReason?: string | null
  lifecycleIdempotencyKey?: string | null
  occurredAt?: Date | string | null
}

export interface PracticeGameLifecycleResult {
  ok: true
  changed: boolean
  practiceMatchGameId: string
  podId: string
  shareId: string
  status: PersistedPracticeGameStatus
  previousStatus: PersistedPracticeGameStatus
}

export class PracticeGameLifecycleError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PracticeGameLifecycleError'
  }
}

export interface PracticeGameResultParams {
  poolShareId: string
  wayfinderMatchId: string
  result: WayfinderReportedResult
  practiceMatchGameId?: string | null
  gameNumber?: number | null
  /** Karabast game format ("Limited"/"Premier"). Swiss Practice is Limited;
   *  non-Limited games are rejected. Optional — fail-open when absent. */
  format?: string | null
  replayUrl?: string | null
  wayfinderGameId?: string | null
  playerLeader?: string | null
  playerLeaderImage?: string | null
  playerBase?: string | null
  playerBaseImage?: string | null
  playerArchetype?: string | null
  opponentLeader?: string | null
  opponentLeaderImage?: string | null
  opponentBase?: string | null
  opponentBaseImage?: string | null
  opponentArchetype?: string | null
  occurredAt?: Date | string | null
}

export interface PracticeGameResultRecordResult {
  ok: true
  changed: boolean
  duplicate: boolean
  shareId: string
  podId: string
  matchId: string
  practiceMatchGameId: string | null
  gameNumber: GameNumber
  matchFinalized: boolean
  roundAdvanced: boolean
  eventCompleted: boolean
  advanceResult: RoundAdvanceResult | null
}

/**
 * Params for a Bo3 SET-concede match forfeit. Unlike a per-game result this is
 * MATCH-grained: there is no gameNumber/slot. `result` is the REPORTING pool
 * owner's match outcome ("win" when the opponent conceded the set, "loss" when
 * the owner conceded) — the same owner-POV convention as a per-game result.
 */
export interface PracticeMatchForfeitParams {
  poolShareId: string
  result: WayfinderReportedResult
  /** Synthetic Wayfinder match id — used as the per-pool W/L dedup key. */
  wayfinderMatchId?: string | null
  /** Optional anchor: resolve the match via this game id instead of the active round. */
  practiceMatchGameId?: string | null
}

export interface PracticeMatchForfeitResult {
  ok: true
  changed: boolean
  /** True when the match was already final_confirmed (idempotent no-op). */
  alreadyFinalized: boolean
  shareId: string
  podId: string
  matchId: string
  matchWinner: 'player1' | 'player2'
  roundAdvanced: boolean
  eventCompleted: boolean
  advanceResult: RoundAdvanceResult | null
}

export class PracticeGameResultError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PracticeGameResultError'
  }
}

interface PracticeGameStaleOptions {
  now?: Date
  staleAfterMs?: number | undefined
}

const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000
const GAME_NUMBERS: GameNumber[] = [1, 2, 3]

const LEGAL_TRANSITIONS: Record<PracticeGameStatus, PracticeGameStatus[]> = {
  pending: ['creating'],
  creating: ['lobby_ready', 'in_progress', 'complete', 'failed', 'voided'],
  lobby_ready: ['in_progress', 'complete', 'failed', 'voided'],
  in_progress: ['complete', 'failed', 'voided'],
  complete: [],
  failed: [],
  voided: [],
}

const RETRYABLE_STALE_STATUSES: PersistedPracticeGameStatus[] = ['creating', 'lobby_ready']

export function resultColumnForGameNumber(gameNumber: number): keyof PracticeMatchAggregateLike {
  if (gameNumber === 1) return 'game1Result'
  if (gameNumber === 2) return 'game2Result'
  if (gameNumber === 3) return 'game3Result'
  throw new RangeError(`Unsupported Swiss Practice game number: ${gameNumber}`)
}

export function canTransitionPracticeGameStatus(
  from: PracticeGameStatus,
  to: PracticeGameStatus
): boolean {
  if (from === to) return true
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertPracticeGameStatusTransition(
  from: PracticeGameStatus,
  to: PracticeGameStatus
): void {
  if (!canTransitionPracticeGameStatus(from, to)) {
    throw new Error(`Illegal Swiss Practice game transition: ${from} -> ${to}`)
  }
}

export function normalizePracticeGameResult(
  result: PracticeGameResult | string | null | undefined
): PracticeGameResult | null {
  return result === 'player1' || result === 'player2' || result === 'draw'
    ? result
    : null
}

export function officialGameForNumber(
  games: PracticeMatchGameLike[],
  gameNumber: number
): PracticeMatchGameLike | null {
  const candidates = games
    .filter(game => game.gameNumber === gameNumber && game.status !== 'failed' && game.status !== 'voided')
    .sort(compareGamesMostOfficialFirst)

  return candidates[0] ?? null
}

export function latestAttemptForGameNumber(
  games: PracticeMatchGameLike[],
  gameNumber: number
): PracticeMatchGameLike | null {
  const candidates = games
    .filter(game => game.gameNumber === gameNumber)
    .sort(compareGamesNewestFirst)

  return candidates[0] ?? null
}

export function completedResultsByGameNumber(
  match: PracticeMatchAggregateLike,
  games: PracticeMatchGameLike[] = []
): GameResultsByNumber {
  const results: GameResultsByNumber = {
    game1: normalizePracticeGameResult(match.game1Result),
    game2: normalizePracticeGameResult(match.game2Result),
    game3: normalizePracticeGameResult(match.game3Result),
  }

  for (const gameNumber of GAME_NUMBERS) {
    const game = officialGameForNumber(games, gameNumber)
    if (game?.status === 'complete') {
      const result = normalizePracticeGameResult(game.result)
      if (result) {
        results[`game${gameNumber}` as keyof GameResultsByNumber] = result
      }
    }
  }

  return results
}

export function nextNeededGameNumber(
  match: PracticeMatchAggregateLike,
  games: PracticeMatchGameLike[] = []
): GameNumber | null {
  if (match.isBye || match.finalConfirmed || match.matchWinner) return null

  const results = completedResultsByGameNumber(match, games)
  if (!results.game1) return 1

  if (deriveMatchWinner(results.game1, results.game2, results.game3)) return null
  if (!results.game2) return 2

  if (deriveMatchWinner(results.game1, results.game2, results.game3)) return null
  if (!results.game3) return 3

  return null
}

export function nextAttemptNumber(
  games: PracticeMatchGameLike[],
  gameNumber: number
): number {
  const attempts = games
    .filter(game => game.gameNumber === gameNumber)
    .map(game => game.attemptNumber ?? 1)

  return Math.max(0, ...attempts) + 1
}

export function isRetryablePracticeGame(
  game: PracticeMatchGameLike | null | undefined,
  { now = new Date(), staleAfterMs }: PracticeGameStaleOptions = {}
): boolean {
  if (!game) return false
  if (game.status === 'failed' || game.status === 'voided') return true
  return isStalePracticeGame(game, { now, staleAfterMs })
}

export function isStalePracticeGame(
  game: PracticeMatchGameLike | null | undefined,
  { now = new Date(), staleAfterMs }: PracticeGameStaleOptions = {}
): boolean {
  if (!game || staleAfterMs === undefined) return false
  if (!RETRYABLE_STALE_STATUSES.includes(game.status)) return false

  const anchor = coerceDate(game.claimedAt) ?? coerceDate(game.createdAt) ?? coerceDate(game.updatedAt)
  if (!anchor) return false

  return now.getTime() - anchor.getTime() >= staleAfterMs
}

export function elapsedPracticeGameSeconds(
  game: PracticeMatchGameLike | null | undefined,
  now = new Date()
): number | null {
  const startedAt = coerceDate(game?.startedAt)
  if (!startedAt) return null
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000))
}

export function formatElapsedPracticeGame(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null

  const safeSeconds = Math.max(0, Math.floor(seconds))
  const totalMinutes = Math.floor(safeSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${totalMinutes}m`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

export function summarizeCurrentPracticeGame(
  match: PracticeMatchAggregateLike,
  games: PracticeMatchGameLike[] = [],
  {
    now = new Date(),
    staleAfterMs,
  }: PracticeGameStaleOptions = {}
): CurrentPracticeGameSummary {
  const gameNumber = nextNeededGameNumber(match, games)

  if (gameNumber === null) {
    return emptySummary('complete', null)
  }

  const officialGame = officialGameForNumber(games, gameNumber)
  const latestAttempt = latestAttemptForGameNumber(games, gameNumber)
  const game = officialGame ?? latestAttempt

  if (!game) {
    return emptySummary('pending', gameNumber)
  }

  const stale = isStalePracticeGame(game, { now, staleAfterMs })
  const retryable = isRetryablePracticeGame(game, { now, staleAfterMs })

  return {
    status: game.status,
    gameNumber,
    game,
    result: normalizePracticeGameResult(game.result),
    replayUrl: game.replayUrl ?? null,
    lobbyUrl: game.lobbyUrl ?? null,
    spectateUrl: game.spectateUrl ?? null,
    elapsedSeconds: elapsedPracticeGameSeconds(game, now),
    stale,
    retryable,
  }
}

export function mirrorCompletedGameToAggregate(
  match: PracticeMatchAggregateLike,
  game: PracticeMatchGameLike
): PracticeMatchAggregateLike {
  if (game.status !== 'complete') return match

  const result = normalizePracticeGameResult(game.result)
  if (!result) return match

  return {
    ...match,
    [resultColumnForGameNumber(game.gameNumber)]: result,
  }
}

export async function claimPracticeMatchGame(
  params: PracticeGameClaimParams
): Promise<PracticeGameClaimResult> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(tx => claimPracticeMatchGameInTransaction(tx, params))
}

export async function recordPracticeMatchGameLifecycle(
  params: PracticeGameLifecycleParams
): Promise<PracticeGameLifecycleResult> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(tx => recordPracticeMatchGameLifecycleInTransaction(tx, params))
}

export async function recordPracticeMatchGameResult(
  params: PracticeGameResultParams
): Promise<PracticeGameResultRecordResult> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(tx => recordPracticeMatchGameResultInTransaction(tx, params))
}

export async function forfeitPracticeMatch(
  params: PracticeMatchForfeitParams
): Promise<PracticeMatchForfeitResult> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(tx => forfeitPracticeMatchInTransaction(tx, params))
}

export async function claimPracticeMatchGameInTransaction(
  tx: TxClient,
  {
    shareId,
    matchId,
    userId,
    now = new Date(),
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
  }: PracticeGameClaimParams
): Promise<PracticeGameClaimResult> {
  const matchRow = await tx.queryRow(
    `SELECT
       pm.id,
       pm.round_id,
       pm.pod_id,
       pm.player1_id,
       pm.player2_id,
       pm.is_bye,
       pm.game1_result,
       pm.game2_result,
       pm.game3_result,
       pm.final_confirmed,
       pm.match_winner,
       pr.round_number,
       pr.status AS round_status,
       p.share_id,
       p.status AS pod_status,
       p.competitive,
       p.draft_state
     FROM practice_matches pm
     JOIN practice_rounds pr ON pm.round_id = pr.id
     JOIN pods p ON pm.pod_id = p.id
     WHERE pm.id = $1 AND p.share_id = $2
     FOR UPDATE OF pm, pr, p`,
    [matchId, shareId]
  )

  if (!matchRow) {
    throw new PracticeGameClaimError(404, 'match_not_found', 'Match not found')
  }

  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [matchRow.pod_id])

  validateClaimableMatch(matchRow, userId)

  const games = (await tx.queryRows(
    `SELECT *
     FROM practice_match_games
     WHERE match_id = $1
     ORDER BY game_number, attempt_number
     FOR UPDATE`,
    [matchId]
  )).map(normalizePracticeMatchGameRow)

  const matchAggregate = matchAggregateFromRow(matchRow)
  const gameNumber = nextNeededGameNumber(matchAggregate, games)

  if (gameNumber === null) {
    return claimResultFromSummary({
      action: 'already_complete',
      matchRow,
      gameNumber: null,
      game: null,
      now,
      staleAfterMs,
      isNewlyCreated: false,
    })
  }

  const officialGame = officialGameForNumber(games, gameNumber)

  if (officialGame) {
    const stale = isStalePracticeGame(officialGame, { now, staleAfterMs })
    if (!stale) {
      return claimResultFromSummary({
        action: actionForClaimedGame(officialGame, userId),
        matchRow,
        gameNumber,
        game: officialGame,
        now,
        staleAfterMs,
        isNewlyCreated: false,
      })
    }

    await tx.query(
      `UPDATE practice_match_games
       SET status = 'failed',
           failed_at = COALESCE(failed_at, $2),
           failure_reason = COALESCE(failure_reason, 'Timed out waiting for Wayfinder lobby'),
           updated_at = $2
       WHERE id = $1`,
      [officialGame.id, now]
    )

    officialGame.status = 'failed'
    officialGame.failedAt = officialGame.failedAt ?? now
    officialGame.failureReason = officialGame.failureReason ?? 'Timed out waiting for Wayfinder lobby'
  }

  const latestAttempt = latestAttemptForGameNumber(games, gameNumber)
  if (latestAttempt && latestAttempt.status !== 'failed' && latestAttempt.status !== 'voided') {
    return claimResultFromSummary({
      action: 'manual_only',
      matchRow,
      gameNumber,
      game: latestAttempt,
      now,
      staleAfterMs,
      isNewlyCreated: false,
    })
  }

  const game = await createPracticeMatchGameAttempt(tx, {
    matchRow,
    gameNumber,
    attemptNumber: nextAttemptNumber(games, gameNumber),
    userId,
    now,
  })

  return claimResultFromSummary({
    action: 'create_lobby',
    matchRow,
    gameNumber,
    game,
    now,
    staleAfterMs,
    isNewlyCreated: true,
  })
}

export async function recordPracticeMatchGameLifecycleInTransaction(
  tx: TxClient,
  params: PracticeGameLifecycleParams
): Promise<PracticeGameLifecycleResult> {
  const occurredAt = coerceDate(params.occurredAt) ?? new Date()
  const eventStatus = normalizeLifecycleStatus(params.status)

  const row = await tx.queryRow(
    `SELECT
       pmg.*,
       pm.player1_id,
       pm.player2_id,
       p.share_id,
       cp.user_id AS reporting_user_id,
       cp.pod_id AS reporting_pod_id
     FROM practice_match_games pmg
     JOIN practice_matches pm ON pmg.match_id = pm.id
     JOIN pods p ON pmg.pod_id = p.id
     LEFT JOIN card_pools cp ON cp.share_id = $2
     WHERE pmg.id = $1
     FOR UPDATE OF pmg, pm`,
    [params.practiceMatchGameId, params.poolShareId]
  )

  if (!row) {
    throw new PracticeGameLifecycleError(404, 'game_not_found', 'Practice match game not found')
  }

  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [row.pod_id])

  assertLifecycleParticipant(row)

  // Recovery / "newest lobby wins": open a NEW lobby_ready attempt for this game
  // number instead of rejecting an (illegal) transition, when either:
  //  - the current attempt already died (failed/voided are terminal) — e.g. the
  //    auto-create failed and the player made the lobby by hand; or
  //  - a lobby_ready arrives carrying a DIFFERENT lobby than the current one —
  //    i.e. the player remade the lobby because something broke mid-game.
  const reportsLobby = eventStatus === 'lobby_ready' || eventStatus === 'joined' || eventStatus === 'in_progress'
  const currentlyTerminal = row.status === 'failed' || row.status === 'voided'
  const reportLobbyId = nonEmptyStringOrNull(params.lobbyId)
  const currentLobbyId = nonEmptyStringOrNull(row.lobby_id)
  const supersedingLobby = eventStatus === 'lobby_ready' && reportLobbyId != null && currentLobbyId != null && reportLobbyId !== currentLobbyId
  if (reportsLobby && (currentlyTerminal || supersedingLobby)) {
    if (!hasLobbyIdentity(row, params)) {
      throw new PracticeGameLifecycleError(400, 'missing_lobby_identity', 'Lobby lifecycle events require a lobby id or URL')
    }
    return recordLobbyRecoveryAttempt(tx, row, params, occurredAt)
  }

  validateLifecycleContext(row, params)

  const game = normalizePracticeMatchGameRow(row)
  const previousStatus = game.status
  const nextStatus = nextLifecycleStatus(game.status, eventStatus)

  if (nextStatus === game.status && isDuplicateLifecyclePayload(game, params)) {
    return {
      ok: true,
      changed: false,
      practiceMatchGameId: String(row.id),
      podId: String(row.pod_id),
      shareId: String(row.share_id),
      status: game.status,
      previousStatus,
    }
  }

  await tx.query(
    `UPDATE practice_match_games
     SET status = $2,
         lobby_id = COALESCE(lobby_id, $3),
         lobby_url = COALESCE(lobby_url, $4),
         spectate_url = COALESCE(spectate_url, $5),
         wayfinder_match_id = COALESCE(wayfinder_match_id, $6),
         wayfinder_game_id = COALESCE(wayfinder_game_id, $7),
         failure_reason = COALESCE($8, failure_reason),
         lifecycle_idempotency_key = COALESCE(lifecycle_idempotency_key, $9),
         lobby_ready_at = CASE
           WHEN $2 IN ('lobby_ready', 'in_progress') THEN COALESCE(lobby_ready_at, $10)
           ELSE lobby_ready_at
         END,
         joined_at = CASE
           WHEN $11 = 'joined' THEN COALESCE(joined_at, $10)
           ELSE joined_at
         END,
         started_at = CASE
           WHEN $2 = 'in_progress' THEN COALESCE(started_at, $10)
           ELSE started_at
         END,
         failed_at = CASE
           WHEN $2 = 'failed' THEN COALESCE(failed_at, $10)
           ELSE failed_at
         END,
         updated_at = $10
     WHERE id = $1`,
    [
      params.practiceMatchGameId,
      nextStatus,
      nonEmptyStringOrNull(params.lobbyId),
      nonEmptyStringOrNull(params.lobbyUrl),
      nonEmptyStringOrNull(params.spectateUrl),
      nonEmptyStringOrNull(params.wayfinderMatchId),
      nonEmptyStringOrNull(params.wayfinderGameId),
      nonEmptyStringOrNull(params.failureReason),
      nonEmptyStringOrNull(params.lifecycleIdempotencyKey),
      occurredAt,
      eventStatus,
    ]
  )

  return {
    ok: true,
    changed: nextStatus !== previousStatus || hasLifecycleMetadata(params),
    practiceMatchGameId: String(row.id),
    podId: String(row.pod_id),
    shareId: String(row.share_id),
    status: nextStatus,
    previousStatus,
  }
}

// A lobby was reported for a game whose latest attempt is terminal
// (failed/voided). Open a NEW lobby_ready attempt for the same game number so
// the lobby becomes canonical — the automatic "newest wins" recovery path.
async function recordLobbyRecoveryAttempt(
  tx: TxClient,
  row: Record<string, unknown>,
  params: PracticeGameLifecycleParams,
  occurredAt: Date
): Promise<PracticeGameLifecycleResult> {
  const gameNumber = row.game_number as GameNumber

  // Lock all attempts for this game number to compute the next attempt number
  // and free the partial-unique "active" slot (idx_practice_match_games_active).
  const siblings = (await tx.queryRows(
    `SELECT * FROM practice_match_games
     WHERE match_id = $1 AND game_number = $2
     FOR UPDATE`,
    [row.match_id, gameNumber]
  )).map(normalizePracticeMatchGameRow)
  const attemptNumber = nextAttemptNumber(siblings, gameNumber)

  // Void any still-active attempt so the new lobby_ready can take the active
  // slot — "newest lobby wins".
  await tx.query(
    `UPDATE practice_match_games
     SET status = 'voided',
         failed_at = COALESCE(failed_at, $3),
         failure_reason = COALESCE(failure_reason, 'Superseded by a recovered lobby'),
         updated_at = $3
     WHERE match_id = $1 AND game_number = $2
       AND status IN ('creating', 'lobby_ready')`,
    [row.match_id, gameNumber, occurredAt]
  )

  const inserted = await tx.queryRow(
    `INSERT INTO practice_match_games (
       match_id, round_id, pod_id, game_number, attempt_number,
       status, lobby_id, lobby_url, spectate_url,
       wayfinder_match_id, wayfinder_game_id,
       created_by_user_id, claimed_at, lobby_ready_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'lobby_ready', $6, $7, $8, $9, $10, $11, $12, $12, $12, $12)
     RETURNING *`,
    [
      row.match_id,
      row.round_id,
      row.pod_id,
      gameNumber,
      attemptNumber,
      nonEmptyStringOrNull(params.lobbyId),
      nonEmptyStringOrNull(params.lobbyUrl),
      nonEmptyStringOrNull(params.spectateUrl),
      nonEmptyStringOrNull(params.wayfinderMatchId),
      nonEmptyStringOrNull(params.wayfinderGameId),
      row.reporting_user_id,
      occurredAt,
    ]
  )

  return {
    ok: true,
    changed: true,
    practiceMatchGameId: String(inserted!.id),
    podId: String(row.pod_id),
    shareId: String(row.share_id),
    status: 'lobby_ready',
    previousStatus: normalizePracticeGameStatus(row.status),
  }
}

function isLimitedFormat(format: string | null | undefined): boolean {
  return typeof format === 'string' && format.trim().toLowerCase() === 'limited'
}

// Reject games that don't belong to this Swiss Practice series. Fail-opens when
// the data is absent, so a legit game is never dropped for a missing field.
function assertSwissPracticeGameMatches(params: PracticeGameResultParams): void {
  // Format must be Limited — Swiss Practice is a Limited draft. This is the
  // reliable safeguard: it catches a Premier game even when the player's drafted
  // leader happens to match the one they played casually.
  if (params.format && !isLimitedFormat(params.format)) {
    throw new PracticeGameResultError(
      422,
      'not_limited_format',
      `Ignoring a ${params.format} game — Swiss Practice games are Limited only`
    )
  }

  // NOTE: a game-1 "must use your drafted leader/base" check isn't reliable yet.
  // The Companion reports the leader as a Karabast numeric id (e.g. 5648009238)
  // while the drafted deck stores the NAME ("Cad Bane"), so there is no common
  // key to compare — an earlier attempt false-rejected real games. Revisit once
  // the Companion sends the leader name (or a shared id).
}

export async function recordPracticeMatchGameResultInTransaction(
  tx: TxClient,
  params: PracticeGameResultParams
): Promise<PracticeGameResultRecordResult> {
  const occurredAt = coerceDate(params.occurredAt) ?? new Date()
  const pool = await tx.queryRow(
    `SELECT
       cp.id AS card_pool_id,
       cp.user_id,
       cp.pod_id,
       p.share_id AS pod_share_id,
       p.competitive
     FROM card_pools cp
     JOIN pods p ON cp.pod_id = p.id
     WHERE cp.share_id = $1`,
    [params.poolShareId]
  )

  if (!pool) {
    throw new PracticeGameResultError(404, 'pool_not_found', 'Pool not found')
  }

  if (pool.competitive !== true) {
    throw new PracticeGameResultError(400, 'not_competitive', 'Pool is not in a competitive pod')
  }

  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [pool.pod_id])

  const resolved = await resolveResultTarget(tx, params, pool)
  const { matchRow, gameRow, gameNumber } = resolved

  // Safeguard: only count games that actually belong to this Swiss Practice
  // series. Rejects, e.g., a Premier Constructed game the player happened to be
  // playing on the side (which the Companion would otherwise log as game 1).
  assertSwissPracticeGameMatches(params)

  const reporterIsPlayer1 = matchRow.player1_id === pool.user_id
  const gameResult = resultFromReporterPerspective(params.result, reporterIsPlayer1)
  const resultIdempotencyKey = resultIdempotencyKeyFor(params, gameNumber)

  const duplicateRow = await tx.queryRow(
    `SELECT id
     FROM practice_match_games
     WHERE result_idempotency_key = $1`,
    [resultIdempotencyKey]
  )
  if (duplicateRow) {
    return {
      ok: true,
      changed: false,
      duplicate: true,
      shareId: String(pool.pod_share_id),
      podId: String(pool.pod_id),
      matchId: String(matchRow.id),
      practiceMatchGameId: String(duplicateRow.id),
      gameNumber,
      matchFinalized: false,
      roundAdvanced: false,
      eventCompleted: false,
      advanceResult: null,
    }
  }

  const currentAggregate = matchAggregateFromRow(matchRow)
  const currentResult = currentAggregate[resultColumnForGameNumber(gameNumber)]
  if (currentResult && currentResult !== gameResult) {
    throw new PracticeGameResultError(409, 'game_result_conflict', 'This game already has a different result')
  }

  const nextGameRow = gameRow
    ? await completeExistingGameRow(tx, {
        gameRow,
        params,
        gameResult,
        resultIdempotencyKey,
        occurredAt,
      })
    : await insertCompletedGameRow(tx, {
        matchRow,
        gameNumber,
        attemptNumber: resolved.nextAttemptNumber,
        createdByUserId: stringOrNull(pool.user_id),
        params,
        gameResult,
        resultIdempotencyKey,
        occurredAt,
      })

  const identities = identityColumnsForReporter(params, reporterIsPlayer1)
  await mirrorGameResultToPracticeMatch(tx, {
    matchId: String(matchRow.id),
    gameNumber,
    gameResult,
    wayfinderMatchId: params.wayfinderMatchId,
    replayUrl: params.replayUrl ?? null,
    identities,
  })

  const updatedMatch = await tx.queryRow(
    `SELECT *
     FROM practice_matches
     WHERE id = $1
     FOR UPDATE`,
    [matchRow.id]
  )
  if (!updatedMatch) {
    throw new PracticeGameResultError(404, 'match_not_found', 'Practice match not found')
  }

  const winner = deriveMatchWinner(
    stringOrNull(updatedMatch.game1_result),
    stringOrNull(updatedMatch.game2_result),
    stringOrNull(updatedMatch.game3_result)
  )

  let matchFinalized = false
  let advanceResult: RoundAdvanceResult | null = null
  if (winner && updatedMatch.final_confirmed !== true) {
    await tx.query(
      `UPDATE practice_matches
       SET final_confirmed = true,
           match_winner = $2,
           player1_submitted = true,
           player2_submitted = true
       WHERE id = $1`,
      [updatedMatch.id, winner]
    )

    await updatePlayerPoolRecordsOnce(tx, {
      podId: String(pool.pod_id),
      player1Id: stringOrNull(updatedMatch.player1_id),
      player2Id: stringOrNull(updatedMatch.player2_id),
      winner,
      wayfinderMatchId: params.wayfinderMatchId,
    })

    matchFinalized = true
    const { checkAndAdvanceRoundInTransaction } = await import('./advancement')
    advanceResult = await checkAndAdvanceRoundInTransaction(tx, String(pool.pod_id))
  }

  // Bo3 continuation: the match isn't decided, so the next game plays in the
  // SAME Karabast lobby. Carry the lobby forward as an in-progress next game so
  // the live status reads "Game N+1 In Progress" immediately; the Companion's
  // result then completes it (resolved by game number). If the lobby breaks and
  // the player makes a new one, the recovery branch supersedes this attempt.
  if (!winner && gameNumber < 3) {
    await carryLobbyForwardToNextGame(tx, {
      matchRow: updatedMatch,
      nextGameNumber: (gameNumber + 1) as GameNumber,
      lobbyId: nextGameRow.lobbyId ?? null,
      lobbyUrl: nextGameRow.lobbyUrl ?? null,
      createdByUserId: stringOrNull(nextGameRow.createdByUserId) ?? stringOrNull(pool.user_id),
      now: occurredAt,
    })
  }

  return {
    ok: true,
    changed: true,
    duplicate: false,
    shareId: String(pool.pod_share_id),
    podId: String(pool.pod_id),
    matchId: String(updatedMatch.id),
    practiceMatchGameId: nextGameRow.id ?? null,
    gameNumber,
    matchFinalized,
    roundAdvanced: advanceResult?.advanced ?? false,
    eventCompleted: advanceResult?.completedEvent ?? false,
    advanceResult,
  }
}

// Bo3 continuation: insert the next game as an in-progress row reusing the same
// lobby, so it shows live immediately. No-op if there's no lobby to carry or the
// next game already exists.
async function carryLobbyForwardToNextGame(
  tx: TxClient,
  {
    matchRow,
    nextGameNumber,
    lobbyId,
    lobbyUrl,
    createdByUserId,
    now,
  }: {
    matchRow: Record<string, unknown>
    nextGameNumber: GameNumber
    lobbyId: string | null
    lobbyUrl: string | null
    createdByUserId: string | null
    now: Date
  }
): Promise<void> {
  if (!lobbyId && !lobbyUrl) return

  const existing = await tx.queryRow(
    `SELECT 1 FROM practice_match_games
     WHERE match_id = $1 AND game_number = $2
       AND status IN ('creating', 'lobby_ready', 'in_progress', 'complete')
     LIMIT 1`,
    [matchRow.id, nextGameNumber]
  )
  if (existing) return

  await tx.query(
    `INSERT INTO practice_match_games (
       match_id, round_id, pod_id, game_number, attempt_number,
       status, lobby_id, lobby_url, created_by_user_id,
       claimed_at, lobby_ready_at, started_at, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, 1, 'in_progress', $5, $6, $7, $8, $8, $8, $8, $8)`,
    [
      matchRow.id,
      matchRow.round_id,
      matchRow.pod_id,
      nextGameNumber,
      lobbyId,
      lobbyUrl,
      createdByUserId,
      now,
    ]
  )
}

/**
 * Forfeit-finalize a Bo3 practice match after a SET concede.
 *
 * Unlike {@link recordPracticeMatchGameResultInTransaction} this does NOT touch
 * the per-game slots — a set concede ends the match regardless of the game
 * tally, so we set `match_winner` = the non-conceder and `final_confirmed`
 * directly, then run the normal advancement. Idempotent: a second call (the
 * real-time report + the ingestion reaffirmation both fire) is a no-op once the
 * match is already final_confirmed.
 */
export async function forfeitPracticeMatchInTransaction(
  tx: TxClient,
  params: PracticeMatchForfeitParams
): Promise<PracticeMatchForfeitResult> {
  const pool = await tx.queryRow(
    `SELECT
       cp.id AS card_pool_id,
       cp.user_id,
       cp.pod_id,
       p.share_id AS pod_share_id,
       p.competitive
     FROM card_pools cp
     JOIN pods p ON cp.pod_id = p.id
     WHERE cp.share_id = $1`,
    [params.poolShareId]
  )
  if (!pool) {
    throw new PracticeGameResultError(404, 'pool_not_found', 'Pool not found')
  }
  if (pool.competitive !== true) {
    throw new PracticeGameResultError(400, 'not_competitive', 'Pool is not in a competitive pod')
  }
  if (params.result === 'draw') {
    throw new PracticeGameResultError(400, 'forfeit_not_draw', 'A match forfeit cannot be a draw')
  }

  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [pool.pod_id])

  // Resolve the match: prefer an explicit practiceMatchGameId anchor, else the
  // pool owner's active-round match. Mirrors resolveResultTarget but
  // match-grained (no game slot).
  let matchRow: Record<string, unknown> | null = null
  if (params.practiceMatchGameId) {
    matchRow = await tx.queryRow(
      `SELECT pm.*
       FROM practice_match_games pmg
       JOIN practice_matches pm ON pmg.match_id = pm.id
       WHERE pmg.id = $1
       FOR UPDATE OF pm`,
      [params.practiceMatchGameId]
    )
  } else {
    const activeRound = await tx.queryRow(
      `SELECT id
       FROM practice_rounds
       WHERE pod_id = $1 AND status = 'active'
       ORDER BY round_number DESC
       LIMIT 1
       FOR UPDATE`,
      [pool.pod_id]
    )
    if (!activeRound) {
      throw new PracticeGameResultError(404, 'active_round_not_found', 'No active round found')
    }
    matchRow = await tx.queryRow(
      `SELECT *
       FROM practice_matches
       WHERE round_id = $1
         AND is_bye = false
         AND (player1_id = $2 OR player2_id = $2)
       FOR UPDATE`,
      [activeRound.id, pool.user_id]
    )
  }

  if (!matchRow) {
    throw new PracticeGameResultError(404, 'match_not_found', 'No active practice match found for this player')
  }
  if (matchRow.pod_id !== pool.pod_id) {
    throw new PracticeGameResultError(403, 'game_not_in_pool_pod', 'Practice match is not in this pod')
  }
  validateReporterInMatch(matchRow, pool)

  // Idempotent: already finalized (the real-time + ingestion senders both fire).
  if (matchRow.final_confirmed === true) {
    return {
      ok: true,
      changed: false,
      alreadyFinalized: true,
      shareId: String(pool.pod_share_id),
      podId: String(pool.pod_id),
      matchId: String(matchRow.id),
      matchWinner: (stringOrNull(matchRow.match_winner) ?? 'player1') as 'player1' | 'player2',
      roundAdvanced: false,
      eventCompleted: false,
      advanceResult: null,
    }
  }

  const reporterIsPlayer1 = matchRow.player1_id === pool.user_id
  const winner = resultFromReporterPerspective(params.result, reporterIsPlayer1) as 'player1' | 'player2'

  await tx.query(
    `UPDATE practice_matches
     SET final_confirmed = true,
         match_winner = $2,
         player1_submitted = true,
         player2_submitted = true,
         wayfinder_match_id = COALESCE(wayfinder_match_id, $3)
     WHERE id = $1
       AND final_confirmed IS NOT TRUE`,
    [matchRow.id, winner, params.wayfinderMatchId ?? null]
  )

  await updatePlayerPoolRecordsOnce(tx, {
    podId: String(pool.pod_id),
    player1Id: stringOrNull(matchRow.player1_id),
    player2Id: stringOrNull(matchRow.player2_id),
    winner,
    wayfinderMatchId: params.wayfinderMatchId ?? `forfeit:${String(matchRow.id)}`,
  })

  const { checkAndAdvanceRoundInTransaction } = await import('./advancement')
  const advanceResult = await checkAndAdvanceRoundInTransaction(tx, String(pool.pod_id))

  return {
    ok: true,
    changed: true,
    alreadyFinalized: false,
    shareId: String(pool.pod_share_id),
    podId: String(pool.pod_id),
    matchId: String(matchRow.id),
    matchWinner: winner,
    roundAdvanced: advanceResult?.advanced ?? false,
    eventCompleted: advanceResult?.completedEvent ?? false,
    advanceResult,
  }
}

export function normalizePracticeMatchGameRow(row: Record<string, unknown>): PracticeMatchGameLike {
  return {
    id: stringOrNull(row.id),
    matchId: stringOrNull(row.match_id),
    roundId: stringOrNull(row.round_id),
    podId: stringOrNull(row.pod_id),
    gameNumber: Number(row.game_number),
    attemptNumber: numberOrNull(row.attempt_number),
    status: normalizePracticeGameStatus(row.status),
    result: normalizePracticeGameResult(row.result as string | null | undefined),
    lobbyId: stringOrNull(row.lobby_id),
    lobbyUrl: stringOrNull(row.lobby_url),
    spectateUrl: stringOrNull(row.spectate_url),
    wayfinderMatchId: stringOrNull(row.wayfinder_match_id),
    wayfinderGameId: stringOrNull(row.wayfinder_game_id),
    replayUrl: stringOrNull(row.replay_url),
    createdByUserId: stringOrNull(row.created_by_user_id),
    lifecycleIdempotencyKey: stringOrNull(row.lifecycle_idempotency_key),
    resultIdempotencyKey: stringOrNull(row.result_idempotency_key),
    claimedAt: dateOrNull(row.claimed_at),
    lobbyReadyAt: dateOrNull(row.lobby_ready_at),
    joinedAt: dateOrNull(row.joined_at),
    startedAt: dateOrNull(row.started_at),
    completedAt: dateOrNull(row.completed_at),
    failedAt: dateOrNull(row.failed_at),
    createdAt: dateOrNull(row.created_at),
    updatedAt: dateOrNull(row.updated_at),
    failureReason: stringOrNull(row.failure_reason),
  }
}

function emptySummary(
  status: PracticeGameStatus,
  gameNumber: GameNumber | null
): CurrentPracticeGameSummary {
  return {
    status,
    gameNumber,
    game: null,
    result: null,
    replayUrl: null,
    lobbyUrl: null,
    spectateUrl: null,
    elapsedSeconds: null,
    stale: false,
    retryable: false,
  }
}

function validateClaimableMatch(matchRow: Record<string, unknown>, userId: string): void {
  const draftState = parseDraftState(matchRow.draft_state)
  const matchmakingStatus = typeof draftState.matchmakingStatus === 'string'
    ? draftState.matchmakingStatus
    : 'active'
  const currentRound = typeof draftState.currentRound === 'number'
    ? draftState.currentRound
    : numberOrNull(draftState.currentRound)

  // A competitive pod is 'complete' once the DRAFT finishes — that is the normal
  // pod status all through Swiss Practice (the matchmaking phase). Requiring
  // 'active' here wrongly rejected every real Swiss launch with "Draft is not
  // active". Only a genuinely dead pod should block; the real Swiss gates
  // (competitive + matchmaking phase + active round) are enforced below.
  if (matchRow.pod_status !== 'active' && matchRow.pod_status !== 'complete') {
    throw new PracticeGameClaimError(400, 'pod_not_active', 'Draft is not active')
  }

  if (matchRow.competitive !== true) {
    throw new PracticeGameClaimError(400, 'not_competitive', 'Pod is not in competitive mode')
  }

  if (draftState.phase !== 'matchmaking' || matchmakingStatus !== 'active') {
    throw new PracticeGameClaimError(400, 'swiss_not_active', 'Swiss Practice is not active')
  }

  if (matchRow.round_status !== 'active') {
    throw new PracticeGameClaimError(409, 'round_not_active', 'This match is not in the active round')
  }

  if (currentRound !== null && Number(matchRow.round_number) !== currentRound) {
    throw new PracticeGameClaimError(409, 'round_not_current', 'This match is not in the current round')
  }

  if (matchRow.is_bye === true) {
    throw new PracticeGameClaimError(400, 'bye_match', 'Bye matches cannot create games')
  }

  if (matchRow.final_confirmed === true) {
    throw new PracticeGameClaimError(400, 'match_complete', 'Match already confirmed')
  }

  if (matchRow.player1_id !== userId && matchRow.player2_id !== userId) {
    throw new PracticeGameClaimError(403, 'not_participant', 'You are not in this match')
  }
}

function assertLifecycleParticipant(row: Record<string, unknown>): void {
  if (!row.reporting_user_id || row.reporting_pod_id !== row.pod_id) {
    throw new PracticeGameLifecycleError(403, 'pool_not_in_match_pod', 'Reporting pool is not in this match pod')
  }

  if (row.reporting_user_id !== row.player1_id && row.reporting_user_id !== row.player2_id) {
    throw new PracticeGameLifecycleError(403, 'pool_not_match_participant', 'Reporting pool is not in this match')
  }
}

function validateLifecycleContext(
  row: Record<string, unknown>,
  params: PracticeGameLifecycleParams
): void {
  assertLifecycleParticipant(row)

  if ((params.status === 'lobby_ready' || params.status === 'joined') && !hasLobbyIdentity(row, params)) {
    throw new PracticeGameLifecycleError(400, 'missing_lobby_identity', 'Lobby lifecycle events require a lobby id or URL')
  }

  if (params.status === 'in_progress' && !hasLobbyIdentity(row, params)) {
    throw new PracticeGameLifecycleError(400, 'missing_lobby_identity', 'In-progress lifecycle events require a lobby id or URL')
  }

  const currentStatus = normalizePracticeGameStatus(row.status)
  const eventStatus = normalizeLifecycleStatus(params.status)
  if (!canApplyLifecycleStatus(currentStatus, eventStatus)) {
    throw new PracticeGameLifecycleError(
      409,
      'illegal_transition',
      `Illegal Swiss Practice lifecycle transition: ${currentStatus} -> ${eventStatus}`
    )
  }
}

async function resolveResultTarget(
  tx: TxClient,
  params: PracticeGameResultParams,
  pool: Record<string, unknown>
): Promise<{
  matchRow: Record<string, unknown>
  gameRow: PracticeMatchGameLike | null
  gameNumber: GameNumber
  nextAttemptNumber: number
}> {
  if (params.practiceMatchGameId) {
    const row = await tx.queryRow(
      `SELECT
         pmg.*,
         pm.id AS practice_match_id,
         pm.player1_id,
         pm.player2_id,
         pm.is_bye,
         pm.game1_result,
         pm.game2_result,
         pm.game3_result,
         pm.final_confirmed,
         pm.match_winner
       FROM practice_match_games pmg
       JOIN practice_matches pm ON pmg.match_id = pm.id
       WHERE pmg.id = $1
       FOR UPDATE OF pmg, pm`,
      [params.practiceMatchGameId]
    )

    if (!row) {
      throw new PracticeGameResultError(404, 'game_not_found', 'Practice match game not found')
    }

    if (row.pod_id !== pool.pod_id) {
      throw new PracticeGameResultError(403, 'game_not_in_pool_pod', 'Practice match game is not in this pod')
    }

    validateReporterInMatch(row, pool)

    const matchRow = matchRowFromJoinedGameRow(row)

    // The anchor identifies the MATCH/series; the reported gameNumber identifies
    // the SLOT. In a single-lobby Bo3 the Companion only ever claims game 1, then
    // reports games 2/3 against game 1's anchor with an incremented gameNumber —
    // so resolve the slot from the reported number (exactly like the no-anchor
    // path below) instead of pinning every result back onto the anchor row's own
    // game_number (which silently collapsed games 2/3 onto game 1).
    const games = (await tx.queryRows(
      `SELECT *
       FROM practice_match_games
       WHERE match_id = $1
       ORDER BY game_number, attempt_number
       FOR UPDATE`,
      [row.match_id]
    )).map(normalizePracticeMatchGameRow)

    let gameNumber = params.gameNumber
      ? asGameNumber(params.gameNumber)
      : asGameNumber(row.game_number)
    // Same redirect as the no-anchor path: a reported number that lands on an
    // already-decided game (lobby numbering reset for a fresh series game) moves
    // to the game the series actually needs next.
    const targetedResult = matchAggregateFromRow(matchRow)[resultColumnForGameNumber(gameNumber)]
    if (targetedResult != null && matchRow.final_confirmed !== true) {
      gameNumber = inferResultGameNumber(matchRow, games)
    }

    return {
      matchRow,
      gameRow: officialGameForNumber(games, gameNumber),
      gameNumber,
      nextAttemptNumber: nextAttemptNumber(games, gameNumber),
    }
  }

  const activeRound = await tx.queryRow(
    `SELECT id
     FROM practice_rounds
     WHERE pod_id = $1 AND status = 'active'
     ORDER BY round_number DESC
     LIMIT 1
     FOR UPDATE`,
    [pool.pod_id]
  )

  if (!activeRound) {
    throw new PracticeGameResultError(404, 'active_round_not_found', 'No active round found')
  }

  const matchRow = await tx.queryRow(
    `SELECT *
     FROM practice_matches
     WHERE round_id = $1
       AND is_bye = false
       AND (player1_id = $2 OR player2_id = $2)
     FOR UPDATE`,
    [activeRound.id, pool.user_id]
  )

  if (!matchRow) {
    throw new PracticeGameResultError(404, 'match_not_found', 'No active practice match found for this player')
  }

  validateReporterInMatch(matchRow, pool)

  const games = (await tx.queryRows(
    `SELECT *
     FROM practice_match_games
     WHERE match_id = $1
     ORDER BY game_number, attempt_number
     FOR UPDATE`,
    [matchRow.id]
  )).map(normalizePracticeMatchGameRow)

  let gameNumber = params.gameNumber
    ? asGameNumber(params.gameNumber)
    : inferResultGameNumber(matchRow, games)
  // The Companion's reported gameNumber is the per-LOBBY Karabast number, which
  // resets whenever players make a NEW lobby for the next series game (a fresh
  // Bo3, a retry, a recovery lobby) — so it can point at an already-decided
  // game (e.g. "game 1 of this new lobby" when the match is past game 1). When
  // that number lands on a decided game and the match isn't over yet, redirect
  // to the game the series actually needs next: the next observed game IS the
  // next series game. A genuine duplicate on a FINISHED match keeps its number
  // so the idempotency dedup still catches it. (Limited-format gate still runs.)
  const targetedResult = matchAggregateFromRow(matchRow)[resultColumnForGameNumber(gameNumber)]
  if (targetedResult != null && matchRow.final_confirmed !== true) {
    gameNumber = inferResultGameNumber(matchRow, games)
  }
  const gameRow = officialGameForNumber(games, gameNumber)

  return {
    matchRow,
    gameRow,
    gameNumber,
    nextAttemptNumber: nextAttemptNumber(games, gameNumber),
  }
}

function validateReporterInMatch(row: Record<string, unknown>, pool: Record<string, unknown>): void {
  if (row.is_bye === true) {
    throw new PracticeGameResultError(400, 'bye_match', 'Bye matches cannot record game results')
  }

  if (row.player1_id !== pool.user_id && row.player2_id !== pool.user_id) {
    throw new PracticeGameResultError(403, 'pool_not_match_participant', 'Reporting pool is not in this match')
  }
}

function matchRowFromJoinedGameRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.match_id,
    round_id: row.round_id,
    pod_id: row.pod_id,
    player1_id: row.player1_id,
    player2_id: row.player2_id,
    is_bye: row.is_bye,
    game1_result: row.game1_result,
    game2_result: row.game2_result,
    game3_result: row.game3_result,
    final_confirmed: row.final_confirmed,
    match_winner: row.match_winner,
  }
}

function inferResultGameNumber(
  matchRow: Record<string, unknown>,
  games: PracticeMatchGameLike[]
): GameNumber {
  const gameNumber = nextNeededGameNumber(matchAggregateFromRow(matchRow), games)
  if (gameNumber === null) {
    throw new PracticeGameResultError(409, 'match_already_decided', 'Match already has enough game results')
  }

  return gameNumber
}

export function resultFromReporterPerspective(
  result: WayfinderReportedResult,
  reporterIsPlayer1: boolean
): PracticeGameResult {
  if (result === 'draw') return 'draw'
  if (reporterIsPlayer1) return result === 'win' ? 'player1' : 'player2'
  return result === 'win' ? 'player2' : 'player1'
}

async function completeExistingGameRow(
  tx: TxClient,
  {
    gameRow,
    params,
    gameResult,
    resultIdempotencyKey,
    occurredAt,
  }: {
    gameRow: PracticeMatchGameLike
    params: PracticeGameResultParams
    gameResult: PracticeGameResult
    resultIdempotencyKey: string
    occurredAt: Date
  }
): Promise<PracticeMatchGameLike> {
  if (!gameRow.id) {
    throw new PracticeGameResultError(500, 'missing_game_id', 'Practice match game row is missing an id')
  }

  if (gameRow.status === 'failed' || gameRow.status === 'voided') {
    throw new PracticeGameResultError(409, 'inactive_game_row', 'Cannot complete a failed or voided game attempt')
  }

  const existingResult = normalizePracticeGameResult(gameRow.result)
  if (gameRow.status === 'complete' && existingResult && existingResult !== gameResult) {
    throw new PracticeGameResultError(409, 'game_result_conflict', 'This game already has a different result')
  }

  const row = await tx.queryRow(
    `UPDATE practice_match_games
     SET status = 'complete',
         result = COALESCE(result, $2),
         wayfinder_match_id = COALESCE(wayfinder_match_id, $3),
         wayfinder_game_id = COALESCE(wayfinder_game_id, $4),
         replay_url = COALESCE($5, replay_url),
         result_idempotency_key = COALESCE(result_idempotency_key, $6),
         started_at = COALESCE(started_at, $7),
         completed_at = COALESCE(completed_at, $7),
         updated_at = $7
     WHERE id = $1
     RETURNING *`,
    [
      gameRow.id,
      gameResult,
      params.wayfinderMatchId,
      nonEmptyStringOrNull(params.wayfinderGameId),
      nonEmptyStringOrNull(params.replayUrl),
      resultIdempotencyKey,
      occurredAt,
    ]
  )

  if (!row) {
    throw new PracticeGameResultError(404, 'game_not_found', 'Practice match game not found')
  }

  return normalizePracticeMatchGameRow(row)
}

async function insertCompletedGameRow(
  tx: TxClient,
  {
    matchRow,
    gameNumber,
    attemptNumber,
    createdByUserId,
    params,
    gameResult,
    resultIdempotencyKey,
    occurredAt,
  }: {
    matchRow: Record<string, unknown>
    gameNumber: GameNumber
    attemptNumber: number
    createdByUserId: string | null
    params: PracticeGameResultParams
    gameResult: PracticeGameResult
    resultIdempotencyKey: string
    occurredAt: Date
  }
): Promise<PracticeMatchGameLike> {
  const row = await tx.queryRow(
    `INSERT INTO practice_match_games (
       match_id,
       round_id,
       pod_id,
       game_number,
       attempt_number,
       status,
       created_by_user_id,
       wayfinder_match_id,
       wayfinder_game_id,
       replay_url,
       result,
       result_idempotency_key,
       claimed_at,
       started_at,
       completed_at,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'complete', $6, $7, $8, $9, $10, $11, $12, $12, $12, $12, $12)
     RETURNING *`,
    [
      matchRow.id,
      matchRow.round_id,
      matchRow.pod_id,
      gameNumber,
      attemptNumber,
      createdByUserId,
      params.wayfinderMatchId,
      nonEmptyStringOrNull(params.wayfinderGameId),
      nonEmptyStringOrNull(params.replayUrl),
      gameResult,
      resultIdempotencyKey,
      occurredAt,
    ]
  )

  if (!row) {
    throw new PracticeGameResultError(500, 'game_insert_failed', 'Failed to record practice game result')
  }

  return normalizePracticeMatchGameRow(row)
}

function resultIdempotencyKeyFor(
  params: PracticeGameResultParams,
  gameNumber: GameNumber
): string {
  const wayfinderGameId = nonEmptyStringOrNull(params.wayfinderGameId)
  if (wayfinderGameId) return `wayfinder-game:${wayfinderGameId}`
  return `wayfinder-match:${params.wayfinderMatchId}:game:${gameNumber}`
}

function identityColumnsForReporter(
  params: PracticeGameResultParams,
  reporterIsPlayer1: boolean
): {
  player1: DeckIdentity
  player2: DeckIdentity
} {
  const player = {
    leader: params.playerLeader ?? null,
    leaderImage: params.playerLeaderImage ?? null,
    base: params.playerBase ?? null,
    baseImage: params.playerBaseImage ?? null,
    archetype: params.playerArchetype ?? null,
  }
  const opponent = {
    leader: params.opponentLeader ?? null,
    leaderImage: params.opponentLeaderImage ?? null,
    base: params.opponentBase ?? null,
    baseImage: params.opponentBaseImage ?? null,
    archetype: params.opponentArchetype ?? null,
  }

  return reporterIsPlayer1
    ? { player1: player, player2: opponent }
    : { player1: opponent, player2: player }
}

interface DeckIdentity {
  leader: string | null
  leaderImage: string | null
  base: string | null
  baseImage: string | null
  archetype: string | null
}

async function mirrorGameResultToPracticeMatch(
  tx: TxClient,
  {
    matchId,
    gameNumber,
    gameResult,
    wayfinderMatchId,
    replayUrl,
    identities,
  }: {
    matchId: string
    gameNumber: GameNumber
    gameResult: PracticeGameResult
    wayfinderMatchId: string
    replayUrl: string | null
    identities: { player1: DeckIdentity; player2: DeckIdentity }
  }
): Promise<void> {
  const gameColumn = resultColumnForGameNumber(gameNumber).replace('Result', '_result').toLowerCase()
  await tx.query(
    `UPDATE practice_matches SET
       ${gameColumn} = COALESCE(${gameColumn}, $2),
       wayfinder_match_id = COALESCE($3, wayfinder_match_id),
       wayfinder_replay_url = COALESCE($4, wayfinder_replay_url),
       player1_leader = COALESCE($5, player1_leader),
       player1_leader_image = COALESCE($6, player1_leader_image),
       player1_base = COALESCE($7, player1_base),
       player1_base_image = COALESCE($8, player1_base_image),
       player1_archetype = COALESCE($9, player1_archetype),
       player2_leader = COALESCE($10, player2_leader),
       player2_leader_image = COALESCE($11, player2_leader_image),
       player2_base = COALESCE($12, player2_base),
       player2_base_image = COALESCE($13, player2_base_image),
       player2_archetype = COALESCE($14, player2_archetype)
     WHERE id = $1`,
    [
      matchId,
      gameResult,
      wayfinderMatchId,
      replayUrl,
      identities.player1.leader,
      identities.player1.leaderImage,
      identities.player1.base,
      identities.player1.baseImage,
      identities.player1.archetype,
      identities.player2.leader,
      identities.player2.leaderImage,
      identities.player2.base,
      identities.player2.baseImage,
      identities.player2.archetype,
    ]
  )
}

async function updatePlayerPoolRecordsOnce(
  tx: TxClient,
  {
    podId,
    player1Id,
    player2Id,
    winner,
    wayfinderMatchId,
  }: {
    podId: string
    player1Id: string | null
    player2Id: string | null
    winner: string
    wayfinderMatchId: string
  }
): Promise<void> {
  if (winner === 'player1') {
    await updatePoolRecordDelta(tx, { podId, userId: player1Id, wins: 1, losses: 0, draws: 0, wayfinderMatchId })
    await updatePoolRecordDelta(tx, { podId, userId: player2Id, wins: 0, losses: 1, draws: 0, wayfinderMatchId })
  } else if (winner === 'player2') {
    await updatePoolRecordDelta(tx, { podId, userId: player1Id, wins: 0, losses: 1, draws: 0, wayfinderMatchId })
    await updatePoolRecordDelta(tx, { podId, userId: player2Id, wins: 1, losses: 0, draws: 0, wayfinderMatchId })
  } else if (winner === 'draw') {
    await updatePoolRecordDelta(tx, { podId, userId: player1Id, wins: 0, losses: 0, draws: 1, wayfinderMatchId })
    await updatePoolRecordDelta(tx, { podId, userId: player2Id, wins: 0, losses: 0, draws: 1, wayfinderMatchId })
  }
}

async function updatePoolRecordDelta(
  tx: TxClient,
  {
    podId,
    userId,
    wins,
    losses,
    draws,
    wayfinderMatchId,
  }: {
    podId: string
    userId: string | null
    wins: number
    losses: number
    draws: number
    wayfinderMatchId: string
  }
): Promise<void> {
  if (!userId) return

  await tx.query(
    `UPDATE card_pools
     SET wins = wins + $1,
         losses = losses + $2,
         draws = draws + $3,
         wayfinder_match_ids = array_append(wayfinder_match_ids, $4),
         updated_at = NOW()
     WHERE user_id = $5
       AND pod_id = $6
       AND NOT ($4 = ANY(wayfinder_match_ids))`,
    [wins, losses, draws, wayfinderMatchId, userId, podId]
  )
}

function matchAggregateFromRow(row: Record<string, unknown>): PracticeMatchAggregateLike {
  return {
    isBye: row.is_bye === true,
    finalConfirmed: row.final_confirmed === true,
    matchWinner: stringOrNull(row.match_winner),
    game1Result: stringOrNull(row.game1_result),
    game2Result: stringOrNull(row.game2_result),
    game3Result: stringOrNull(row.game3_result),
  }
}

function actionForClaimedGame(
  game: PracticeMatchGameLike,
  userId: string
): PracticeGameClaimAction {
  if (game.status === 'creating') {
    return game.createdByUserId === userId ? 'create_lobby' : 'wait_for_lobby'
  }

  if ((game.status === 'lobby_ready' || game.status === 'in_progress') && game.lobbyUrl) {
    return 'join_lobby'
  }

  if (game.status === 'complete') return 'already_complete'

  return 'wait_for_lobby'
}

function canApplyLifecycleStatus(
  currentStatus: PersistedPracticeGameStatus,
  eventStatus: PracticeGameLifecycleStatus
): boolean {
  const nextStatus = lifecycleTargetStatus(currentStatus, eventStatus)
  if (currentStatus === nextStatus) return true
  if (isOlderLifecycleStatus(currentStatus, nextStatus)) return true
  return canTransitionPracticeGameStatus(currentStatus, nextStatus)
}

function nextLifecycleStatus(
  currentStatus: PersistedPracticeGameStatus,
  eventStatus: PracticeGameLifecycleStatus
): PersistedPracticeGameStatus {
  const nextStatus = lifecycleTargetStatus(currentStatus, eventStatus)
  if (isOlderLifecycleStatus(currentStatus, nextStatus)) {
    return currentStatus
  }

  return nextStatus
}

function lifecycleTargetStatus(
  currentStatus: PersistedPracticeGameStatus,
  eventStatus: PracticeGameLifecycleStatus
): PersistedPracticeGameStatus {
  if (eventStatus === 'joined') {
    return currentStatus === 'creating' ? 'lobby_ready' : currentStatus
  }

  return eventStatus
}

function isOlderLifecycleStatus(
  currentStatus: PersistedPracticeGameStatus,
  nextStatus: PersistedPracticeGameStatus
): boolean {
  if (
    currentStatus !== nextStatus &&
    (currentStatus === 'complete' || currentStatus === 'failed' || currentStatus === 'voided')
  ) {
    return true
  }

  // failed/voided are terminal off-ramps (LEGAL_TRANSITIONS permits them from any
  // active status), not linear regressions. Their lifecycleRank of 0 would
  // otherwise make every active status look "newer", silently dropping a real
  // failure (e.g. Wayfinder's "lobby creation failed" on a still-creating game).
  if (nextStatus === 'failed' || nextStatus === 'voided') {
    return false
  }

  return lifecycleRank(currentStatus) > lifecycleRank(nextStatus)
}

function lifecycleRank(status: PersistedPracticeGameStatus | PracticeGameLifecycleStatus): number {
  if (status === 'complete') return 4
  if (status === 'in_progress') return 3
  if (status === 'lobby_ready') return 2
  if (status === 'creating') return 1
  return 0
}

function isDuplicateLifecyclePayload(
  game: PracticeMatchGameLike,
  params: PracticeGameLifecycleParams
): boolean {
  const idempotencyKey = nonEmptyStringOrNull(params.lifecycleIdempotencyKey)
  return Boolean(idempotencyKey && game.lifecycleIdempotencyKey === idempotencyKey)
}

function hasLifecycleMetadata(params: PracticeGameLifecycleParams): boolean {
  return Boolean(
    nonEmptyStringOrNull(params.lobbyId) ||
    nonEmptyStringOrNull(params.lobbyUrl) ||
    nonEmptyStringOrNull(params.spectateUrl) ||
    nonEmptyStringOrNull(params.wayfinderMatchId) ||
    nonEmptyStringOrNull(params.wayfinderGameId) ||
    nonEmptyStringOrNull(params.failureReason) ||
    nonEmptyStringOrNull(params.lifecycleIdempotencyKey)
  )
}

function hasLobbyIdentity(
  row: Record<string, unknown>,
  params: PracticeGameLifecycleParams
): boolean {
  return Boolean(
    nonEmptyStringOrNull(params.lobbyId) ||
    nonEmptyStringOrNull(params.lobbyUrl) ||
    stringOrNull(row.lobby_id) ||
    stringOrNull(row.lobby_url)
  )
}

async function createPracticeMatchGameAttempt(
  tx: TxClient,
  {
    matchRow,
    gameNumber,
    attemptNumber,
    userId,
    now,
  }: {
    matchRow: Record<string, unknown>
    gameNumber: GameNumber
    attemptNumber: number
    userId: string
    now: Date
  }
): Promise<PracticeMatchGameLike> {
  const row = await tx.queryRow(
    `INSERT INTO practice_match_games (
       match_id,
       round_id,
       pod_id,
       game_number,
       attempt_number,
       status,
       created_by_user_id,
       claimed_at,
       created_at,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'creating', $6, $7, $7, $7)
     RETURNING *`,
    [
      matchRow.id,
      matchRow.round_id,
      matchRow.pod_id,
      gameNumber,
      attemptNumber,
      userId,
      now,
    ]
  )

  if (!row) {
    throw new PracticeGameClaimError(500, 'claim_failed', 'Failed to reserve a practice game')
  }

  return normalizePracticeMatchGameRow(row)
}

function claimResultFromSummary({
  action,
  matchRow,
  gameNumber,
  game,
  now,
  staleAfterMs,
  isNewlyCreated,
}: {
  action: PracticeGameClaimAction
  matchRow: Record<string, unknown>
  gameNumber: GameNumber | null
  game: PracticeMatchGameLike | null
  now: Date
  staleAfterMs: number | undefined
  isNewlyCreated: boolean
}): PracticeGameClaimResult {
  const stale = isStalePracticeGame(game, { now, staleAfterMs })
  const retryable = isRetryablePracticeGame(game, { now, staleAfterMs })

  return {
    action,
    practiceMatchGameId: game?.id ?? null,
    matchId: String(matchRow.id),
    podId: String(matchRow.pod_id),
    roundId: String(matchRow.round_id),
    shareId: String(matchRow.share_id),
    gameNumber,
    attemptNumber: game?.attemptNumber ?? null,
    status: game?.status ?? (gameNumber === null ? 'complete' : 'pending'),
    createdByUserId: game?.createdByUserId ?? null,
    lobbyUrl: game?.lobbyUrl ?? null,
    spectateUrl: game?.spectateUrl ?? null,
    stale,
    retryable,
    manualFallbackAvailable: true,
    isNewlyCreated,
  }
}

function compareGamesMostOfficialFirst(a: PracticeMatchGameLike, b: PracticeMatchGameLike): number {
  const statusDiff = statusRank(b.status) - statusRank(a.status)
  if (statusDiff !== 0) return statusDiff
  return compareGamesNewestFirst(a, b)
}

function compareGamesNewestFirst(a: PracticeMatchGameLike, b: PracticeMatchGameLike): number {
  const attemptDiff = (b.attemptNumber ?? 1) - (a.attemptNumber ?? 1)
  if (attemptDiff !== 0) return attemptDiff

  const bTime = comparableTimestamp(b.updatedAt) ?? comparableTimestamp(b.createdAt) ?? 0
  const aTime = comparableTimestamp(a.updatedAt) ?? comparableTimestamp(a.createdAt) ?? 0
  return bTime - aTime
}

function statusRank(status: PersistedPracticeGameStatus): number {
  if (status === 'complete') return 4
  if (status === 'in_progress') return 3
  if (status === 'lobby_ready') return 2
  if (status === 'creating') return 1
  return 0
}

function comparableTimestamp(value: Date | string | null | undefined): number | null {
  return coerceDate(value)?.getTime() ?? null
}

function coerceDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizePracticeGameStatus(value: unknown): PersistedPracticeGameStatus {
  if (
    value === 'creating' ||
    value === 'lobby_ready' ||
    value === 'in_progress' ||
    value === 'complete' ||
    value === 'failed' ||
    value === 'voided'
  ) {
    return value
  }

  return 'failed'
}

function normalizeLifecycleStatus(value: unknown): PracticeGameLifecycleStatus {
  if (value === 'lobby_ready' || value === 'joined' || value === 'in_progress' || value === 'failed') {
    return value
  }

  throw new PracticeGameLifecycleError(400, 'invalid_status', 'status must be lobby_ready, joined, in_progress, or failed')
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nonEmptyStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asGameNumber(value: unknown): GameNumber {
  const parsed = numberOrNull(value)
  if (parsed === 1 || parsed === 2 || parsed === 3) return parsed
  throw new PracticeGameResultError(400, 'invalid_game_number', 'gameNumber must be 1, 2, or 3')
}

function dateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function parseDraftState(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string') return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}
