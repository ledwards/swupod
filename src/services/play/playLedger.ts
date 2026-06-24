import { randomUUID } from 'node:crypto'
import { queryRows, withTransaction, type TxClient } from '@/lib/db'
import {
  buildLocalReplayUrl,
  buildLocalRuntimeUrl,
  normalizeReportedResult,
  normalizeSeat,
  PtpPlayError,
  resultFromReporterPerspective,
  seatForUser,
  summarizeDeckBuilderState,
  winnerUserIdForResult,
  type PlayDeckSummary,
  type PtpPlayMatchResult,
  type PtpPlayMatchStatus,
  type PtpPlayQueueStatus,
  type PtpPlayReportedResult,
  type PtpPlayRuntimeMode,
  type PtpPlaySeat,
} from './playState'
import { getRuntimeLaunchPlan, type RuntimeLaunchPlan } from './runtimeLaunch'

interface PoolRow {
  id: string
  userId: string
  shareId: string
  setCode: string
  setName: string | null
  poolType: string
  name: string | null
  deckBuilderState: unknown
  createdAt: string | Date | null
  updatedAt: string | Date | null
}

interface QueueOpponentRow {
  id: string
  userId: string
  cardPoolId: string
  poolShareId: string
}

interface MatchCore {
  id: string
  status: PtpPlayMatchStatus
  runtimeMode: PtpPlayRuntimeMode
  player1UserId: string
  player2UserId: string
  result: PtpPlayMatchResult | null
  winnerUserId: string | null
  replayUrl: string | null
}

export interface PlayQueueEntrySummary {
  id: string
  status: PtpPlayQueueStatus
  poolShareId: string
  setCode: string
  poolType: string
  deckName: string
  requestedAt: string | null
  expiresAt: string | null
}

export interface PlayMatchPlayerSummary {
  userId: string
  username: string | null
  poolShareId: string
  deckName: string
  leaderName: string | null
  baseName: string | null
  mainDeckCount: number
}

export interface PlayMatchSummary {
  id: string
  status: PtpPlayMatchStatus
  runtimeMode: PtpPlayRuntimeMode
  setCode: string
  poolType: string
  result: PtpPlayMatchResult | null
  winnerUserId: string | null
  mySeat: PtpPlaySeat | null
  launchUrl: string | null
  replayUrl: string | null
  player1: PlayMatchPlayerSummary
  player2: PlayMatchPlayerSummary
  matchedAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string | null
}

export interface PlayLobby {
  runtime: RuntimeLaunchPlan
  decks: PlayDeckSummary[]
  queueEntries: PlayQueueEntrySummary[]
  matches: PlayMatchSummary[]
}

export interface EnterQueueResult {
  action: 'queued' | 'matched' | 'existing_queue' | 'active_match'
  queueEntryId: string | null
  matchId: string | null
}

export interface SeatLaunchResult {
  matchId: string
  seat: PtpPlaySeat
  launchUrl: string
}

export interface RuntimeSeatSummary {
  seat: PtpPlaySeat
  userId: string
  username: string | null
  deck: PlayDeckSummary
}

export interface RuntimeSession {
  matchId: string
  status: PtpPlayMatchStatus
  runtimeMode: PtpPlayRuntimeMode
  result: PtpPlayMatchResult | null
  winnerUserId: string | null
  replayUrl: string | null
  self: RuntimeSeatSummary
  opponent: RuntimeSeatSummary
}

export interface RecordPlayResultParams {
  matchId: string
  userId: string
  seatToken: string
  reportedResult: PtpPlayReportedResult
  idempotencyKey?: string | null
}

export interface RecordPlayResultResult {
  ok: true
  duplicate: boolean
  matchId: string
  result: PtpPlayMatchResult
  winnerUserId: string | null
  replayUrl: string
}

export interface RecordRuntimeCallbackResultParams {
  matchId?: string | null
  runtimeGameId?: string | null
  reportingSeat: PtpPlaySeat
  reportedResult: PtpPlayReportedResult
  replayUrl?: string | null
  idempotencyKey?: string | null
}

export interface ReplayEventSummary {
  id: string
  eventType: string
  payload: unknown
  createdAt: string | null
}

export interface PlayReplay {
  match: PlayMatchSummary
  events: ReplayEventSummary[]
}

export async function getPlayLobby(userId: string): Promise<PlayLobby> {
  const [deckRows, queueRowsResult, matchRows] = await Promise.all([
    queryRows(
      `SELECT share_id, set_code, set_name, pool_type, name, deck_builder_state, created_at, updated_at
       FROM card_pools
       WHERE user_id = $1
         AND deck_builder_state IS NOT NULL
         AND deck_builder_state::text != 'null'
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId]
    ),
    queryRows(
      `SELECT
         qe.id,
         qe.status,
         qe.pool_share_id,
         qe.set_code,
         qe.pool_type,
         qe.requested_at,
         qe.expires_at,
         cp.name,
         cp.set_name,
         cp.deck_builder_state
       FROM ptp_play_queue_entries qe
       JOIN card_pools cp ON cp.id = qe.card_pool_id
       WHERE qe.user_id = $1 AND qe.status = 'queued' AND qe.expires_at > NOW()
       ORDER BY qe.requested_at ASC`,
      [userId]
    ),
    queryRows(
      `SELECT
         m.id,
         m.status,
         m.runtime_mode,
         m.set_code,
         m.pool_type,
         m.result,
         m.winner_user_id,
         m.runtime_launch_url,
         m.replay_url,
         m.player1_user_id,
         m.player2_user_id,
         m.matched_at,
         m.started_at,
         m.completed_at,
         m.created_at,
         s.launch_token AS my_launch_token,
         s.seat AS my_seat,
         u1.username AS player1_username,
         u2.username AS player2_username,
         cp1.share_id AS player1_pool_share_id,
         cp1.set_name AS player1_set_name,
         cp1.name AS player1_pool_name,
         cp1.deck_builder_state AS player1_deck_builder_state,
         cp2.share_id AS player2_pool_share_id,
         cp2.set_name AS player2_set_name,
         cp2.name AS player2_pool_name,
         cp2.deck_builder_state AS player2_deck_builder_state
       FROM ptp_play_matches m
       JOIN users u1 ON u1.id = m.player1_user_id
       JOIN users u2 ON u2.id = m.player2_user_id
       JOIN card_pools cp1 ON cp1.id = m.player1_pool_id
       JOIN card_pools cp2 ON cp2.id = m.player2_pool_id
       LEFT JOIN ptp_play_seats s ON s.match_id = m.id AND s.user_id = $1
       WHERE m.player1_user_id = $1 OR m.player2_user_id = $1
       ORDER BY m.created_at DESC
       LIMIT 30`,
      [userId]
    ),
  ])

  return {
    runtime: getRuntimeLaunchPlan(),
    decks: deckRows.map(rowToDeckSummary),
    queueEntries: queueRowsResult.map(rowToQueueEntrySummary),
    matches: matchRows.map(row => rowToMatchSummary(row, userId)),
  }
}

export async function enterLimitedQueue(params: {
  userId: string
  poolShareId: string
}): Promise<EnterQueueResult> {
  return withTransaction(async (tx) => {
    const launchPlan = getRuntimeLaunchPlan()
    if (!launchPlan.launchAllowed || !launchPlan.mode) {
      throw new PtpPlayError(503, 'runtime_unavailable', launchPlan.reason ?? 'Runtime launch is unavailable')
    }

    const pool = await loadOwnedPoolForQueue(tx, params.userId, params.poolShareId)
    const deck = summarizeDeckBuilderState(pool)
    if (!deck.ready) {
      throw new PtpPlayError(400, 'deck_not_ready', deck.blocker ?? 'Deck is not ready to queue')
    }

    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [
      `ptp-play-queue:${pool.setCode}:${pool.poolType}`,
    ])
    await expireQueuedEntries(tx)

    const activeMatch = await activeMatchForPool(tx, params.userId, pool.id)
    if (activeMatch) {
      return {
        action: 'active_match',
        queueEntryId: null,
        matchId: activeMatch.id,
      }
    }

    const existingQueue = await tx.queryRow(
      `SELECT id
       FROM ptp_play_queue_entries
       WHERE user_id = $1 AND card_pool_id = $2 AND status = 'queued' AND expires_at > NOW()`,
      [params.userId, pool.id]
    )
    if (existingQueue) {
      return {
        action: 'existing_queue',
        queueEntryId: stringColumn(existingQueue, 'id'),
        matchId: null,
      }
    }

    const currentQueue = await tx.queryRow(
      `INSERT INTO ptp_play_queue_entries (
         user_id, card_pool_id, pool_share_id, set_code, pool_type
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [params.userId, pool.id, pool.shareId, pool.setCode, pool.poolType]
    )
    const currentQueueId = stringColumn(currentQueue, 'id')

    const opponent = await findQueuedOpponent(tx, pool, params.userId)
    if (!opponent) {
      await insertPlayEvent(tx, {
        matchId: null,
        eventType: 'queue.entered',
        payload: {
          queueEntryId: currentQueueId,
          poolShareId: pool.shareId,
          setCode: pool.setCode,
          poolType: pool.poolType,
        },
        idempotencyKey: `queue.entered:${currentQueueId}`,
      })

      return {
        action: 'queued',
        queueEntryId: currentQueueId,
        matchId: null,
      }
    }

    const matchId = await createMatchedGame(tx, {
      launchPlan,
      pool,
      currentQueueId,
      opponent,
    })

    return {
      action: 'matched',
      queueEntryId: currentQueueId,
      matchId,
    }
  })
}

export async function cancelQueueEntry(params: {
  userId: string
  entryId: string
}): Promise<{ cancelled: true; entryId: string }> {
  const row = await withTransaction(async (tx) => {
    const updated = await tx.queryRow(
      `UPDATE ptp_play_queue_entries
       SET status = 'cancelled',
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'queued'
       RETURNING id`,
      [params.entryId, params.userId]
    )
    if (!updated) {
      throw new PtpPlayError(404, 'queue_entry_not_found', 'Queue entry not found')
    }
    return updated
  })

  return { cancelled: true, entryId: stringColumn(row, 'id') }
}

export async function claimPlaySeat(params: {
  matchId: string
  userId: string
}): Promise<SeatLaunchResult> {
  return withTransaction(async (tx) => {
    const seat = await tx.queryRow(
      `SELECT seat, launch_token
       FROM ptp_play_seats
       WHERE match_id = $1 AND user_id = $2`,
      [params.matchId, params.userId]
    )
    if (!seat) {
      throw new PtpPlayError(404, 'seat_not_found', 'Seat not found')
    }

    await markSeatJoined(tx, {
      matchId: params.matchId,
      userId: params.userId,
      seatToken: stringColumn(seat, 'launch_token'),
    })

    return {
      matchId: params.matchId,
      seat: seatColumn(seat, 'seat'),
      launchUrl: buildLocalRuntimeUrl(params.matchId, stringColumn(seat, 'launch_token')),
    }
  })
}

export async function getPlayRuntimeSession(params: {
  matchId: string
  userId: string
  seatToken: string
}): Promise<RuntimeSession> {
  return withTransaction(async (tx) => {
    await markSeatJoined(tx, params)
    const row = await runtimeSessionRow(tx, params)
    if (!row) {
      throw new PtpPlayError(404, 'runtime_session_not_found', 'Runtime session not found')
    }
    return rowToRuntimeSession(row)
  })
}

export async function recordPlayResult(
  params: RecordPlayResultParams
): Promise<RecordPlayResultResult> {
  return withTransaction(async (tx) => {
    const row = await tx.queryRow(
      `SELECT
         m.id,
         m.status,
         m.runtime_mode,
         m.player1_user_id,
         m.player2_user_id,
         m.result,
         m.winner_user_id,
         m.replay_url,
         s.id AS seat_id,
         s.seat
       FROM ptp_play_matches m
       JOIN ptp_play_seats s ON s.match_id = m.id
       WHERE m.id = $1 AND s.user_id = $2 AND s.launch_token = $3
       FOR UPDATE OF m, s`,
      [params.matchId, params.userId, params.seatToken]
    )
    if (!row) {
      throw new PtpPlayError(404, 'runtime_session_not_found', 'Runtime session not found')
    }

    const match = rowToMatchCore(row)
    if (match.status === 'failed' || match.status === 'cancelled') {
      throw new PtpPlayError(409, 'match_not_reportable', 'This match cannot accept a result')
    }

    const reporterSeat = seatColumn(row, 'seat')
    const result = resultFromReporterPerspective(params.reportedResult, reporterSeat)
    const winnerUserId = winnerUserIdForResult(result, match)
    const replayUrl = match.replayUrl ?? buildLocalReplayUrl(params.matchId)

    if (match.status === 'complete') {
      if (match.result === result) {
        return {
          ok: true,
          duplicate: true,
          matchId: match.id,
          result,
          winnerUserId: match.winnerUserId,
          replayUrl,
        }
      }
      throw new PtpPlayError(409, 'result_conflict', 'This match already has a different result')
    }

    const idempotencyKey = params.idempotencyKey?.trim() ||
      `result:${params.matchId}:${stringColumn(row, 'seat_id')}:${params.reportedResult}`

    await tx.query(
      `UPDATE ptp_play_matches
       SET status = 'complete',
           result = $2,
           winner_user_id = $3,
           result_reported_by = $4,
           result_idempotency_key = $5,
           replay_url = $6,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [params.matchId, result, winnerUserId, params.userId, idempotencyKey, replayUrl]
    )

    await insertPlayEvent(tx, {
      matchId: params.matchId,
      userId: params.userId,
      seatId: stringColumn(row, 'seat_id'),
      eventType: 'result.reported',
      payload: {
        reportedResult: params.reportedResult,
        result,
        reporterSeat,
        winnerUserId,
      },
      idempotencyKey,
    })

    return {
      ok: true,
      duplicate: false,
      matchId: match.id,
      result,
      winnerUserId,
      replayUrl,
    }
  })
}

export async function recordRuntimeCallbackResult(
  params: RecordRuntimeCallbackResultParams
): Promise<RecordPlayResultResult> {
  return withTransaction(async (tx) => {
    const matchId = params.matchId?.trim() || null
    const runtimeGameId = params.runtimeGameId?.trim() || null
    if (!matchId && !runtimeGameId) {
      throw new PtpPlayError(400, 'match_identifier_required', 'matchId or runtimeGameId is required')
    }

    const row = await tx.queryRow(
      `SELECT
         m.id,
         m.status,
         m.runtime_mode,
         m.player1_user_id,
         m.player2_user_id,
         m.result,
         m.winner_user_id,
         m.replay_url,
         s.id AS seat_id,
         s.user_id AS reporter_user_id,
         s.seat
       FROM ptp_play_matches m
       JOIN ptp_play_seats s ON s.match_id = m.id AND s.seat = $3
       WHERE (($1::text IS NOT NULL AND m.id::text = $1)
          OR ($2::text IS NOT NULL AND m.runtime_game_id = $2))
       FOR UPDATE OF m, s`,
      [matchId, runtimeGameId, params.reportingSeat]
    )
    if (!row) {
      throw new PtpPlayError(404, 'match_not_found', 'Match not found')
    }

    const match = rowToMatchCore(row)
    if (match.status === 'failed' || match.status === 'cancelled') {
      throw new PtpPlayError(409, 'match_not_reportable', 'This match cannot accept a result')
    }

    const result = resultFromReporterPerspective(params.reportedResult, params.reportingSeat)
    const winnerUserId = winnerUserIdForResult(result, match)
    const replayUrl = params.replayUrl?.trim() || match.replayUrl || buildLocalReplayUrl(match.id)

    if (match.status === 'complete') {
      if (match.result === result) {
        return {
          ok: true,
          duplicate: true,
          matchId: match.id,
          result,
          winnerUserId: match.winnerUserId,
          replayUrl,
        }
      }
      throw new PtpPlayError(409, 'result_conflict', 'This match already has a different result')
    }

    const idempotencyKey = params.idempotencyKey?.trim() ||
      `runtime-result:${match.id}:${params.reportingSeat}:${params.reportedResult}`

    await tx.query(
      `UPDATE ptp_play_matches
       SET status = 'complete',
           result = $2,
           winner_user_id = $3,
           result_reported_by = $4,
           result_idempotency_key = $5,
           replay_url = $6,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [match.id, result, winnerUserId, stringColumn(row, 'reporter_user_id'), idempotencyKey, replayUrl]
    )

    await insertPlayEvent(tx, {
      matchId: match.id,
      userId: stringColumn(row, 'reporter_user_id'),
      seatId: stringColumn(row, 'seat_id'),
      eventType: 'runtime.result_reported',
      payload: {
        runtimeGameId,
        reportedResult: params.reportedResult,
        result,
        reporterSeat: params.reportingSeat,
        winnerUserId,
      },
      idempotencyKey,
    })

    return {
      ok: true,
      duplicate: false,
      matchId: match.id,
      result,
      winnerUserId,
      replayUrl,
    }
  })
}

export async function recordRuntimeEvent(params: {
  matchId: string
  userId: string
  seatToken: string
  eventType: string
  payload?: unknown
  idempotencyKey?: string | null
}): Promise<{ ok: true }> {
  return withTransaction(async (tx) => {
    const row = await tx.queryRow(
      `SELECT s.id AS seat_id
       FROM ptp_play_seats s
       WHERE s.match_id = $1 AND s.user_id = $2 AND s.launch_token = $3`,
      [params.matchId, params.userId, params.seatToken]
    )
    if (!row) {
      throw new PtpPlayError(404, 'runtime_session_not_found', 'Runtime session not found')
    }

    await insertPlayEvent(tx, {
      matchId: params.matchId,
      userId: params.userId,
      seatId: stringColumn(row, 'seat_id'),
      eventType: params.eventType,
      payload: params.payload ?? {},
      idempotencyKey: params.idempotencyKey?.trim() || null,
    })
    return { ok: true }
  })
}

export async function getPlayReplay(params: {
  matchId: string
  userId: string
}): Promise<PlayReplay> {
  const matchRows = await queryRows(
    `SELECT
       m.id,
       m.status,
       m.runtime_mode,
       m.set_code,
       m.pool_type,
       m.result,
       m.winner_user_id,
       m.runtime_launch_url,
       m.replay_url,
       m.player1_user_id,
       m.player2_user_id,
       m.matched_at,
       m.started_at,
       m.completed_at,
       m.created_at,
       s.launch_token AS my_launch_token,
       s.seat AS my_seat,
       u1.username AS player1_username,
       u2.username AS player2_username,
       cp1.share_id AS player1_pool_share_id,
       cp1.set_name AS player1_set_name,
       cp1.name AS player1_pool_name,
       cp1.deck_builder_state AS player1_deck_builder_state,
       cp2.share_id AS player2_pool_share_id,
       cp2.set_name AS player2_set_name,
       cp2.name AS player2_pool_name,
       cp2.deck_builder_state AS player2_deck_builder_state
     FROM ptp_play_matches m
     JOIN users u1 ON u1.id = m.player1_user_id
     JOIN users u2 ON u2.id = m.player2_user_id
     JOIN card_pools cp1 ON cp1.id = m.player1_pool_id
     JOIN card_pools cp2 ON cp2.id = m.player2_pool_id
     LEFT JOIN ptp_play_seats s ON s.match_id = m.id AND s.user_id = $2
     WHERE m.id = $1 AND (m.player1_user_id = $2 OR m.player2_user_id = $2)`,
    [params.matchId, params.userId]
  )
  const matchRow = matchRows[0]
  if (!matchRow) {
    throw new PtpPlayError(404, 'match_not_found', 'Match not found')
  }

  const eventRows = await queryRows(
    `SELECT id, event_type, payload, created_at
     FROM ptp_play_events
     WHERE match_id = $1
     ORDER BY created_at ASC`,
    [params.matchId]
  )

  return {
    match: rowToMatchSummary(matchRow, params.userId),
    events: eventRows.map(row => ({
      id: stringColumn(row, 'id'),
      eventType: stringColumn(row, 'event_type'),
      payload: row.payload ?? {},
      createdAt: dateColumn(row, 'created_at'),
    })),
  }
}

async function loadOwnedPoolForQueue(
  tx: TxClient,
  userId: string,
  poolShareId: string
): Promise<PoolRow> {
  const row = await tx.queryRow(
    `SELECT id, user_id, share_id, set_code, set_name, pool_type, name, deck_builder_state, created_at, updated_at
     FROM card_pools
     WHERE share_id = $1
     FOR UPDATE`,
    [poolShareId]
  )
  if (!row) {
    throw new PtpPlayError(404, 'pool_not_found', 'Pool not found')
  }
  if (stringColumn(row, 'user_id') !== userId) {
    throw new PtpPlayError(403, 'pool_not_owned', 'You can only queue your own decks')
  }
  return rowToPool(row)
}

async function expireQueuedEntries(tx: TxClient): Promise<void> {
  await tx.query(
    `UPDATE ptp_play_queue_entries
     SET status = 'expired',
         updated_at = NOW()
     WHERE status = 'queued' AND expires_at <= NOW()`
  )
}

async function activeMatchForPool(
  tx: TxClient,
  userId: string,
  cardPoolId: string
): Promise<{ id: string } | null> {
  const row = await tx.queryRow(
    `SELECT id
     FROM ptp_play_matches
     WHERE status IN ('matched', 'launch_ready', 'in_progress')
       AND (
         (player1_user_id = $1 AND player1_pool_id = $2)
         OR (player2_user_id = $1 AND player2_pool_id = $2)
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, cardPoolId]
  )
  return row ? { id: stringColumn(row, 'id') } : null
}

async function findQueuedOpponent(
  tx: TxClient,
  pool: PoolRow,
  userId: string
): Promise<QueueOpponentRow | null> {
  const row = await tx.queryRow(
    `SELECT id, user_id, card_pool_id, pool_share_id
     FROM ptp_play_queue_entries
     WHERE status = 'queued'
       AND set_code = $1
       AND pool_type = $2
       AND user_id <> $3
       AND expires_at > NOW()
     ORDER BY requested_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [pool.setCode, pool.poolType, userId]
  )

  if (!row) return null
  return {
    id: stringColumn(row, 'id'),
    userId: stringColumn(row, 'user_id'),
    cardPoolId: stringColumn(row, 'card_pool_id'),
    poolShareId: stringColumn(row, 'pool_share_id'),
  }
}

async function createMatchedGame(
  tx: TxClient,
  {
    launchPlan,
    pool,
    currentQueueId,
    opponent,
  }: {
    launchPlan: RuntimeLaunchPlan
    pool: PoolRow
    currentQueueId: string
    opponent: QueueOpponentRow
  }
): Promise<string> {
  if (!launchPlan.mode) {
    throw new PtpPlayError(503, 'runtime_unavailable', 'Runtime launch is unavailable')
  }

  const matchId = randomUUID()
  const runtimeGameId = `ptp-${matchId}`
  const player1Token = randomUUID()
  const player2Token = randomUUID()
  const runtimeLaunchUrl = launchPlan.mode === 'local_stub'
    ? `/play/runtime/${matchId}`
    : launchPlan.launchUrl

  await tx.query(
    `INSERT INTO ptp_play_matches (
       id,
       format,
       pool_type,
       set_code,
       status,
       runtime_mode,
       runtime_game_id,
       runtime_launch_url,
       player1_user_id,
       player2_user_id,
       player1_pool_id,
       player2_pool_id
     )
     VALUES ($1, 'limited', $2, $3, 'launch_ready', $4, $5, $6, $7, $8, $9, $10)`,
    [
      matchId,
      pool.poolType,
      pool.setCode,
      launchPlan.mode,
      runtimeGameId,
      runtimeLaunchUrl,
      opponent.userId,
      pool.userId,
      opponent.cardPoolId,
      pool.id,
    ]
  )

  await tx.query(
    `INSERT INTO ptp_play_seats (match_id, user_id, card_pool_id, seat, launch_token)
     VALUES
       ($1, $2, $3, 'player1', $4),
       ($1, $5, $6, 'player2', $7)`,
    [matchId, opponent.userId, opponent.cardPoolId, player1Token, pool.userId, pool.id, player2Token]
  )

  await tx.query(
    `UPDATE ptp_play_queue_entries
     SET status = 'matched',
         match_id = $1,
         matched_at = NOW(),
         updated_at = NOW()
     WHERE id IN ($2, $3)`,
    [matchId, opponent.id, currentQueueId]
  )

  await insertPlayEvent(tx, {
    matchId,
    eventType: 'match.created',
    payload: {
      runtimeMode: launchPlan.mode,
      runtimeGameId,
      player1PoolShareId: opponent.poolShareId,
      player2PoolShareId: pool.shareId,
      setCode: pool.setCode,
      poolType: pool.poolType,
    },
    idempotencyKey: `match.created:${matchId}`,
  })

  return matchId
}

async function markSeatJoined(
  tx: TxClient,
  params: { matchId: string; userId: string; seatToken: string }
): Promise<void> {
  const row = await tx.queryRow(
    `UPDATE ptp_play_seats
     SET joined_at = COALESCE(joined_at, NOW()),
         updated_at = NOW()
     WHERE match_id = $1 AND user_id = $2 AND launch_token = $3
     RETURNING id`,
    [params.matchId, params.userId, params.seatToken]
  )
  if (!row) {
    throw new PtpPlayError(404, 'runtime_session_not_found', 'Runtime session not found')
  }

  await tx.query(
    `UPDATE ptp_play_matches
     SET status = CASE WHEN status IN ('matched', 'launch_ready') THEN 'in_progress' ELSE status END,
         started_at = CASE WHEN status IN ('matched', 'launch_ready') THEN COALESCE(started_at, NOW()) ELSE started_at END,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('matched', 'launch_ready', 'in_progress')`,
    [params.matchId]
  )

  await insertPlayEvent(tx, {
    matchId: params.matchId,
    userId: params.userId,
    seatId: stringColumn(row, 'id'),
    eventType: 'seat.joined',
    payload: {},
    idempotencyKey: `seat.joined:${params.matchId}:${stringColumn(row, 'id')}`,
  })
}

async function runtimeSessionRow(
  tx: TxClient,
  params: { matchId: string; userId: string; seatToken: string }
): Promise<Record<string, unknown> | null> {
  return tx.queryRow(
    `SELECT
       m.id,
       m.status,
       m.runtime_mode,
       m.result,
       m.winner_user_id,
       m.replay_url,
       m.player1_user_id,
       m.player2_user_id,
       s.seat AS self_seat,
       s.user_id AS self_user_id,
       su.username AS self_username,
       scp.share_id AS self_pool_share_id,
       scp.set_code AS self_set_code,
       scp.set_name AS self_set_name,
       scp.pool_type AS self_pool_type,
       scp.name AS self_pool_name,
       scp.deck_builder_state AS self_deck_builder_state,
       os.seat AS opponent_seat,
       os.user_id AS opponent_user_id,
       ou.username AS opponent_username,
       ocp.share_id AS opponent_pool_share_id,
       ocp.set_code AS opponent_set_code,
       ocp.set_name AS opponent_set_name,
       ocp.pool_type AS opponent_pool_type,
       ocp.name AS opponent_pool_name,
       ocp.deck_builder_state AS opponent_deck_builder_state
     FROM ptp_play_matches m
     JOIN ptp_play_seats s ON s.match_id = m.id
     JOIN users su ON su.id = s.user_id
     JOIN card_pools scp ON scp.id = s.card_pool_id
     JOIN ptp_play_seats os ON os.match_id = m.id AND os.id <> s.id
     JOIN users ou ON ou.id = os.user_id
     JOIN card_pools ocp ON ocp.id = os.card_pool_id
     WHERE m.id = $1 AND s.user_id = $2 AND s.launch_token = $3`,
    [params.matchId, params.userId, params.seatToken]
  )
}

async function insertPlayEvent(
  tx: TxClient,
  params: {
    matchId: string | null
    eventType: string
    payload: unknown
    idempotencyKey: string | null
    userId?: string
    seatId?: string
  }
): Promise<void> {
  if (!params.matchId) return
  await tx.query(
    `INSERT INTO ptp_play_events (
       match_id, seat_id, user_id, event_type, payload, idempotency_key
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [
      params.matchId,
      params.seatId ?? null,
      params.userId ?? null,
      params.eventType,
      JSON.stringify(params.payload),
      params.idempotencyKey,
    ]
  )
}

function rowToDeckSummary(row: Record<string, unknown>): PlayDeckSummary {
  return summarizeDeckBuilderState({
    shareId: stringColumn(row, 'share_id'),
    setCode: stringColumn(row, 'set_code'),
    setName: nullableStringColumn(row, 'set_name'),
    poolType: nullableStringColumn(row, 'pool_type'),
    name: nullableStringColumn(row, 'name'),
    deckBuilderState: row.deck_builder_state,
    createdAt: dateColumn(row, 'created_at'),
    updatedAt: dateColumn(row, 'updated_at'),
  })
}

function rowToQueueEntrySummary(row: Record<string, unknown>): PlayQueueEntrySummary {
  const deck = summarizeDeckBuilderState({
    shareId: stringColumn(row, 'pool_share_id'),
    setCode: stringColumn(row, 'set_code'),
    setName: nullableStringColumn(row, 'set_name'),
    poolType: nullableStringColumn(row, 'pool_type'),
    name: nullableStringColumn(row, 'name'),
    deckBuilderState: row.deck_builder_state,
  })

  return {
    id: stringColumn(row, 'id'),
    status: queueStatusColumn(row, 'status'),
    poolShareId: stringColumn(row, 'pool_share_id'),
    setCode: stringColumn(row, 'set_code'),
    poolType: stringColumn(row, 'pool_type'),
    deckName: deck.name,
    requestedAt: dateColumn(row, 'requested_at'),
    expiresAt: dateColumn(row, 'expires_at'),
  }
}

function rowToMatchSummary(row: Record<string, unknown>, userId: string): PlayMatchSummary {
  const player1UserId = stringColumn(row, 'player1_user_id')
  const player2UserId = stringColumn(row, 'player2_user_id')
  const runtimeMode = runtimeModeColumn(row, 'runtime_mode')
  const mySeat = normalizeSeat(row.my_seat) ?? seatForUser({ player1UserId, player2UserId }, userId)
  const launchToken = nullableStringColumn(row, 'my_launch_token')
  const status = matchStatusColumn(row, 'status')

  return {
    id: stringColumn(row, 'id'),
    status,
    runtimeMode,
    setCode: stringColumn(row, 'set_code'),
    poolType: stringColumn(row, 'pool_type'),
    result: normalizeMatchResultColumn(row, 'result'),
    winnerUserId: nullableStringColumn(row, 'winner_user_id'),
    mySeat,
    launchUrl: launchToken && status !== 'complete' && status !== 'failed' && status !== 'cancelled'
      ? buildRuntimeLaunchUrl(runtimeMode, stringColumn(row, 'id'), launchToken, nullableStringColumn(row, 'runtime_launch_url'))
      : null,
    replayUrl: nullableStringColumn(row, 'replay_url'),
    player1: {
      ...deckToPlayerSummary(player1UserId, nullableStringColumn(row, 'player1_username'), summarizeDeckBuilderState({
        shareId: stringColumn(row, 'player1_pool_share_id'),
        setCode: stringColumn(row, 'set_code'),
        setName: nullableStringColumn(row, 'player1_set_name'),
        poolType: nullableStringColumn(row, 'pool_type'),
        name: nullableStringColumn(row, 'player1_pool_name'),
        deckBuilderState: row.player1_deck_builder_state,
      })),
    },
    player2: {
      ...deckToPlayerSummary(player2UserId, nullableStringColumn(row, 'player2_username'), summarizeDeckBuilderState({
        shareId: stringColumn(row, 'player2_pool_share_id'),
        setCode: stringColumn(row, 'set_code'),
        setName: nullableStringColumn(row, 'player2_set_name'),
        poolType: nullableStringColumn(row, 'pool_type'),
        name: nullableStringColumn(row, 'player2_pool_name'),
        deckBuilderState: row.player2_deck_builder_state,
      })),
    },
    matchedAt: dateColumn(row, 'matched_at'),
    startedAt: dateColumn(row, 'started_at'),
    completedAt: dateColumn(row, 'completed_at'),
    createdAt: dateColumn(row, 'created_at'),
  }
}

function rowToRuntimeSession(row: Record<string, unknown>): RuntimeSession {
  const selfSeat = seatColumn(row, 'self_seat')
  const opponentSeat = seatColumn(row, 'opponent_seat')
  const selfDeck = summarizeDeckBuilderState({
    shareId: stringColumn(row, 'self_pool_share_id'),
    setCode: stringColumn(row, 'self_set_code'),
    setName: nullableStringColumn(row, 'self_set_name'),
    poolType: nullableStringColumn(row, 'self_pool_type'),
    name: nullableStringColumn(row, 'self_pool_name'),
    deckBuilderState: row.self_deck_builder_state,
  })
  const opponentDeck = summarizeDeckBuilderState({
    shareId: stringColumn(row, 'opponent_pool_share_id'),
    setCode: stringColumn(row, 'opponent_set_code'),
    setName: nullableStringColumn(row, 'opponent_set_name'),
    poolType: nullableStringColumn(row, 'opponent_pool_type'),
    name: nullableStringColumn(row, 'opponent_pool_name'),
    deckBuilderState: row.opponent_deck_builder_state,
  })

  return {
    matchId: stringColumn(row, 'id'),
    status: matchStatusColumn(row, 'status'),
    runtimeMode: runtimeModeColumn(row, 'runtime_mode'),
    result: normalizeMatchResultColumn(row, 'result'),
    winnerUserId: nullableStringColumn(row, 'winner_user_id'),
    replayUrl: nullableStringColumn(row, 'replay_url'),
    self: {
      seat: selfSeat,
      userId: stringColumn(row, 'self_user_id'),
      username: nullableStringColumn(row, 'self_username'),
      deck: selfDeck,
    },
    opponent: {
      seat: opponentSeat,
      userId: stringColumn(row, 'opponent_user_id'),
      username: nullableStringColumn(row, 'opponent_username'),
      deck: opponentDeck,
    },
  }
}

function rowToPool(row: Record<string, unknown>): PoolRow {
  return {
    id: stringColumn(row, 'id'),
    userId: stringColumn(row, 'user_id'),
    shareId: stringColumn(row, 'share_id'),
    setCode: stringColumn(row, 'set_code'),
    setName: nullableStringColumn(row, 'set_name'),
    poolType: nullableStringColumn(row, 'pool_type') ?? 'sealed',
    name: nullableStringColumn(row, 'name'),
    deckBuilderState: row.deck_builder_state,
    createdAt: dateColumn(row, 'created_at'),
    updatedAt: dateColumn(row, 'updated_at'),
  }
}

function rowToMatchCore(row: Record<string, unknown>): MatchCore {
  return {
    id: stringColumn(row, 'id'),
    status: matchStatusColumn(row, 'status'),
    runtimeMode: runtimeModeColumn(row, 'runtime_mode'),
    player1UserId: stringColumn(row, 'player1_user_id'),
    player2UserId: stringColumn(row, 'player2_user_id'),
    result: normalizeMatchResultColumn(row, 'result'),
    winnerUserId: nullableStringColumn(row, 'winner_user_id'),
    replayUrl: nullableStringColumn(row, 'replay_url'),
  }
}

function deckToPlayerSummary(
  userId: string,
  username: string | null,
  deck: PlayDeckSummary
): PlayMatchPlayerSummary {
  return {
    userId,
    username,
    poolShareId: deck.poolShareId,
    deckName: deck.name,
    leaderName: deck.leaderName,
    baseName: deck.baseName,
    mainDeckCount: deck.mainDeckCount,
  }
}

function buildRuntimeLaunchUrl(
  mode: PtpPlayRuntimeMode,
  matchId: string,
  launchToken: string,
  storedLaunchUrl: string | null
): string {
  if (mode === 'local_stub') return buildLocalRuntimeUrl(matchId, launchToken)
  if (!storedLaunchUrl) return buildLocalRuntimeUrl(matchId, launchToken)
  const separator = storedLaunchUrl.includes('?') ? '&' : '?'
  return `${storedLaunchUrl}${separator}seatToken=${encodeURIComponent(launchToken)}`
}

function stringColumn(row: Record<string, unknown> | null, key: string): string {
  const value = row?.[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected ${key} to be a non-empty string`)
  }
  return value
}

function nullableStringColumn(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function dateColumn(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

function matchStatusColumn(row: Record<string, unknown>, key: string): PtpPlayMatchStatus {
  const value = row[key]
  if (
    value === 'matched' ||
    value === 'launch_ready' ||
    value === 'in_progress' ||
    value === 'complete' ||
    value === 'failed' ||
    value === 'cancelled'
  ) {
    return value
  }
  throw new Error(`Unexpected PTP play match status: ${String(value)}`)
}

function queueStatusColumn(row: Record<string, unknown>, key: string): PtpPlayQueueStatus {
  const value = row[key]
  if (
    value === 'queued' ||
    value === 'matched' ||
    value === 'cancelled' ||
    value === 'expired' ||
    value === 'launch_failed'
  ) {
    return value
  }
  throw new Error(`Unexpected PTP play queue status: ${String(value)}`)
}

function runtimeModeColumn(row: Record<string, unknown>, key: string): PtpPlayRuntimeMode {
  const value = row[key]
  if (value === 'local_stub' || value === 'forceteki') return value
  throw new Error(`Unexpected PTP play runtime mode: ${String(value)}`)
}

function seatColumn(row: Record<string, unknown>, key: string): PtpPlaySeat {
  const seat = normalizeSeat(row[key])
  if (!seat) throw new Error(`Unexpected PTP play seat: ${String(row[key])}`)
  return seat
}

function normalizeMatchResultColumn(row: Record<string, unknown>, key: string): PtpPlayMatchResult | null {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (value === 'player1' || value === 'player2' || value === 'draw') return value
  throw new Error(`Unexpected PTP play result: ${String(value)}`)
}

export function parseReportedResult(value: unknown): PtpPlayReportedResult {
  const result = normalizeReportedResult(value)
  if (!result) {
    throw new PtpPlayError(400, 'invalid_result', 'result must be win, loss, or draw')
  }
  return result
}
