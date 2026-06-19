import { deriveMatchWinner } from './results'
import type { TxClient } from '@/lib/db'

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

  if (matchRow.pod_status !== 'active') {
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

function validateLifecycleContext(
  row: Record<string, unknown>,
  params: PracticeGameLifecycleParams
): void {
  if (!row.reporting_user_id || row.reporting_pod_id !== row.pod_id) {
    throw new PracticeGameLifecycleError(403, 'pool_not_in_match_pod', 'Reporting pool is not in this match pod')
  }

  if (row.reporting_user_id !== row.player1_id && row.reporting_user_id !== row.player2_id) {
    throw new PracticeGameLifecycleError(403, 'pool_not_match_participant', 'Reporting pool is not in this match')
  }

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
