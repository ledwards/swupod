/**
 * Open Games listing service (Lobby V1, U1).
 *
 * One open_games row carries listing -> match. Karabast lobby attempts live in
 * open_game_lobby_attempts (handled by openGameLive.ts, U2).
 *
 * Invariants (R18/R19, enforced here — the conditional UPDATE alone is NOT
 * enough for the cross-row rules):
 *  - accept of a specific listing: conditional UPDATE ... WHERE status='open'
 *  - one open listing per user: posting replaces; partial unique index backstop
 *  - one pending match per user + mutual-accept kill: pg_advisory_xact_lock on
 *    both sorted user ids before the pending-match check
 *
 * Lock ordering is always advisory locks (sorted) -> row lock, in every path.
 */
import type { TxClient } from '@/lib/db'
import { archetypeShortName, poolDisplayName } from '@/src/utils/archetypeName'

export const OPEN_LISTING_EXPIRY_MS = 60 * 60 * 1000 // R9 (revised 7/10): 1h
export const ACCEPTED_NO_LOBBY_EXPIRY_MS = 20 * 60 * 1000 // R20: ~20 min
export const LOBBY_READY_STALE_MS = 60 * 60 * 1000
export const IN_PROGRESS_STALE_MS = 4 * 60 * 60 * 1000

export const PENDING_STATUSES = ['accepted', 'lobby_ready', 'in_progress'] as const

export type OpenGameErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'deck_not_ready'
  | 'self_join'
  | 'format_mismatch'
  | 'pending_match_exists'
  | 'listing_gone'

export class OpenGameError extends Error {
  code: OpenGameErrorCode
  status: number

  constructor(code: OpenGameErrorCode, message: string, status = 409) {
    super(message)
    this.name = 'OpenGameError'
    this.code = code
    this.status = status
  }
}

export interface OpenGame {
  id: string
  shareId: string
  status: string
  visibility: 'public' | 'private'
  setCode: string
  setName: string | null
  format: string
  player1Id: string
  player2Id: string | null
  createdAt: string
  acceptedAt: string | null
}

export interface OpenGameListing {
  shareId: string
  setCode: string
  setName: string | null
  format: string
  createdAt: string
  host: { username: string | null; avatarUrl: string | null }
  /** Internal — consumers strip this after presence enrichment; never emitted. */
  hostId?: string
  /** Internal — the host's own deck name; emit layers strip it and the API
   *  returns it only to the host (R29: opponents never see deck identity). */
  hostDeck?: { name: string | null }
  /** Filled in by the API/broadcast layer from the live presence map. */
  hostConnected?: boolean
}

export interface RecentResult {
  setCode: string
  format: string
  completedAt: string
  players: Array<string | null>
}

export interface PlayNowResult {
  action: 'joined' | 'posted' | 'waiting'
  game: OpenGame
}

function rowToGame(row: Record<string, unknown>): OpenGame {
  return {
    id: row.id as string,
    shareId: row.share_id as string,
    status: row.status as string,
    visibility: row.visibility as 'public' | 'private',
    setCode: row.set_code as string,
    setName: (row.set_name as string) ?? null,
    format: row.format as string,
    player1Id: row.player1_id as string,
    player2Id: (row.player2_id as string) ?? null,
    createdAt: String(row.created_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
  }
}

/** Serialize all listing/match transitions for a set of users (sorted → no deadlock). */
async function lockUsers(tx: TxClient, userIds: string[]): Promise<void> {
  for (const id of [...userIds].sort()) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`open_game_user:${id}`])
  }
}

interface EligibleDeck {
  poolId: string
  setCode: string
  setName: string | null
  format: string
}

/**
 * Deck eligibility (R23): the pool belongs to the user and its deck builder
 * has a leader AND base selected (deck_builder_state — the same definition
 * /me uses). NOT gated on built_decks: that row only exists once the player
 * has clicked Play on the play page, which silently hid fully-built decks
 * (Lee's ASH Sealed) from the picker and from post/join validation.
 */
async function requireEligibleDeck(tx: TxClient, userId: string, poolId: string): Promise<EligibleDeck> {
  const pool = await tx.queryRow(
    `SELECT cp.id, cp.user_id, cp.set_code, cp.set_name, cp.pool_type, cp.hidden,
            (cp.deck_builder_state ->> 'activeLeader' IS NOT NULL
             AND cp.deck_builder_state ->> 'activeBase' IS NOT NULL) AS deck_ready
     FROM card_pools cp
     WHERE cp.id = $1`,
    [poolId]
  )
  if (!pool) throw new OpenGameError('not_found', 'Pool not found', 404)
  if (pool.user_id !== userId) {
    throw new OpenGameError('forbidden', 'That pool belongs to another player', 403)
  }
  if (pool.hidden === true || pool.deck_ready !== true) {
    throw new OpenGameError('deck_not_ready', 'Build a deck for this pool first (pick a leader and base)', 400)
  }
  return {
    poolId: String(pool.id),
    setCode: String(pool.set_code),
    setName: pool.set_name ? String(pool.set_name) : null,
    format: pool.pool_type ? String(pool.pool_type) : 'sealed',
  }
}

async function pendingMatchCount(tx: TxClient, userIds: string[]): Promise<number> {
  const row = await tx.queryRow(
    `SELECT COUNT(*)::int AS n FROM open_games
     WHERE status = ANY($1)
       AND (player1_id = ANY($2) OR player2_id = ANY($2))`,
    [[...PENDING_STATUSES], userIds]
  )
  return typeof row?.n === 'number' ? row.n : 0
}

// ---------------------------------------------------------------------------
// Post
// ---------------------------------------------------------------------------

export interface PostParams {
  userId: string
  poolId: string
  visibility?: 'public' | 'private'
}

async function postOpenGameInTx(tx: TxClient, params: PostParams): Promise<OpenGame> {
  const { userId, poolId, visibility = 'public' } = params
  await lockUsers(tx, [userId])
  const deck = await requireEligibleDeck(tx, userId, poolId)

  // R19: replace, never stack.
  await tx.query(
    `UPDATE open_games SET status = 'cancelled', resolved_at = NOW(), updated_at = NOW()
     WHERE player1_id = $1 AND status = 'open'`,
    [userId]
  )

  const { generateShareId } = await import('@/lib/utils')
  const row = await tx.queryRow(
    `INSERT INTO open_games (share_id, visibility, set_code, set_name, format, player1_id, player1_pool_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [generateShareId(10), visibility, deck.setCode, deck.setName, deck.format, userId, deck.poolId]
  )
  return rowToGame(row!)
}

export async function postOpenGame(params: PostParams): Promise<OpenGame> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(tx => postOpenGameInTx(tx, params))
}

// ---------------------------------------------------------------------------
// Join (accept)
// ---------------------------------------------------------------------------

export interface JoinParams {
  shareId?: string
  gameId?: string
  userId: string
  poolId: string
}

async function joinOpenGameInTx(tx: TxClient, params: JoinParams): Promise<OpenGame> {
  const { userId, poolId } = params
  const target = await tx.queryRow(
    `SELECT id, player1_id, player1_pool_id, set_code, format, status FROM open_games
     WHERE ${params.gameId ? 'id = $1' : 'share_id = $1'}`,
    [params.gameId ?? params.shareId]
  )
  if (!target) throw new OpenGameError('not_found', 'Game not found', 404)
  const posterId = String(target.player1_id)
  if (posterId === userId) {
    throw new OpenGameError('self_join', 'You cannot join your own game')
  }

  // Advisory locks BEFORE any state reads that feed invariant checks.
  await lockUsers(tx, [posterId, userId])

  const deck = await requireEligibleDeck(tx, userId, poolId)
  if (deck.setCode !== target.set_code || deck.format !== target.format) {
    throw new OpenGameError(
      'format_mismatch',
      `This game is ${target.set_code} ${target.format} — pick a matching deck`,
      400
    )
  }

  if ((await pendingMatchCount(tx, [posterId, userId])) > 0) {
    throw new OpenGameError('pending_match_exists', 'One of you already has a game in progress')
  }

  // Poster's deck must still exist and be valid (R23); if not, delist.
  try {
    await requireEligibleDeck(tx, posterId, String(target.player1_pool_id))
  } catch {
    await tx.query(
      `UPDATE open_games SET status = 'delisted', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'open'`,
      [target.id]
    )
    throw new OpenGameError('listing_gone', 'That game is no longer available')
  }

  // R18: first write wins.
  const row = await tx.queryRow(
    `UPDATE open_games
     SET status = 'accepted', player2_id = $2, player2_pool_id = $3,
         accepted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'open' AND player1_id != $2
     RETURNING *`,
    [target.id, userId, poolId]
  )
  if (!row) throw new OpenGameError('listing_gone', 'That game was just taken or cancelled')
  return rowToGame(row)
}

export async function joinOpenGame(params: JoinParams): Promise<OpenGame> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(tx => joinOpenGameInTx(tx, params))
}

// ---------------------------------------------------------------------------
// Play Now (R8/AE1/AE2): accept oldest compatible listing, else post.
// ---------------------------------------------------------------------------

export async function playNow(params: { userId: string; poolId: string }): Promise<PlayNowResult> {
  const { withTransaction, queryRows, queryRow } = await import('@/lib/db')
  const { userId, poolId } = params

  const deck = await withTransaction(tx => requireEligibleDeck(tx, userId, poolId))

  const candidates = await queryRows(
    `SELECT id FROM open_games
     WHERE status = 'open' AND visibility = 'public'
       AND set_code = $1 AND format = $2 AND player1_id != $3
     ORDER BY created_at ASC
     LIMIT 5`,
    [deck.setCode, deck.format, userId]
  )

  for (const candidate of candidates) {
    try {
      const game = await joinOpenGame({ gameId: String(candidate.id), userId, poolId })
      return { action: 'joined', game }
    } catch (error) {
      if (error instanceof OpenGameError && error.code === 'listing_gone') continue
      throw error
    }
  }

  // AE2 idempotence: an existing listing with this deck means "keep waiting".
  const existing = await queryRow(
    `SELECT * FROM open_games
     WHERE player1_id = $1 AND status = 'open' AND player1_pool_id = $2`,
    [userId, poolId]
  )
  if (existing) return { action: 'waiting', game: rowToGame(existing) }

  const game = await postOpenGame({ userId, poolId })
  return { action: 'posted', game }
}

// ---------------------------------------------------------------------------
// Cancel (R20: either player, any live status)
// ---------------------------------------------------------------------------

export async function cancelOpenGame(params: { gameId: string; userId: string }): Promise<OpenGame> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(async tx => {
    const row = await tx.queryRow('SELECT * FROM open_games WHERE id = $1', [params.gameId])
    if (!row) throw new OpenGameError('not_found', 'Game not found', 404)
    if (row.player1_id !== params.userId && row.player2_id !== params.userId) {
      throw new OpenGameError('forbidden', 'Only players in this game can cancel it', 403)
    }
    if (row.status === 'cancelled') return rowToGame(row)
    const live = (['open', ...PENDING_STATUSES] as string[]).includes(String(row.status))
    if (!live) throw new OpenGameError('listing_gone', 'This game already ended')
    const updated = await tx.queryRow(
      `UPDATE open_games SET status = 'cancelled', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [params.gameId]
    )
    return rowToGame(updated!)
  })
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Same display-name chain as the deck picker (eligible-decks) and /me:
 *  deck builder poolName -> card_pools.name -> canonical archetype+date. */
function hostDeckName(r: Record<string, unknown>): string | null {
  const state = ((): Record<string, any> => {
    const raw = r.deck_builder_state
    if (!raw) return {}
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) || {}
      } catch {
        return {}
      }
    }
    return typeof raw === 'object' ? (raw as Record<string, any>) : {}
  })()
  if (state.poolName) return String(state.poolName)
  if (r.pool_name) return String(r.pool_name)
  const positions = state.cardPositions || {}
  const leaderCard = state.activeLeader ? positions[state.activeLeader]?.card : null
  const baseCard = state.activeBase ? positions[state.activeBase]?.card : null
  const leaderName = leaderCard?.name || leaderCard?.title || null
  const archetype = archetypeShortName({
    leaderShortName: leaderName ? leaderName.split(/[\s,]/)[0] || null : null,
    leaderName,
    baseAspects: Array.isArray(baseCard?.aspects) ? baseCard.aspects : [],
    baseHp: typeof baseCard?.hp === 'number' ? baseCard.hp : null,
  })
  return poolDisplayName({
    archetypeShort: archetype,
    setCode: r.set_code ? String(r.set_code) : null,
    poolType: r.pool_type ? String(r.pool_type) : null,
    date: r.pool_created_at ? String(r.pool_created_at) : null,
  })
}

/** Public board payload (R29: no deck identity, no internal ids). */
export async function listPublicOpenGames(): Promise<{
  listings: OpenGameListing[]
  recentCompleted: RecentResult[]
}> {
  const { queryRows } = await import('@/lib/db')
  const rows = await queryRows(
    `SELECT og.share_id, og.set_code, og.set_name, og.format, og.created_at,
            og.player1_id, u.username, u.avatar_url,
            cp.deck_builder_state, cp.name AS pool_name, cp.pool_type,
            cp.created_at AS pool_created_at
     FROM open_games og
     JOIN users u ON u.id = og.player1_id
     JOIN card_pools cp ON cp.id = og.player1_pool_id
     WHERE og.status = 'open' AND og.visibility = 'public'
     ORDER BY og.created_at DESC
     LIMIT 50`
  )
  const completed = await queryRows(
    `SELECT og.set_code, og.format, og.completed_at, u1.username AS p1, u2.username AS p2
     FROM open_games og
     JOIN users u1 ON u1.id = og.player1_id
     LEFT JOIN users u2 ON u2.id = og.player2_id
     WHERE og.status = 'complete' AND og.completed_at IS NOT NULL
     ORDER BY og.completed_at DESC
     LIMIT 5`
  )
  return {
    listings: rows.map(r => ({
      shareId: String(r.share_id),
      setCode: String(r.set_code),
      setName: r.set_name ? String(r.set_name) : null,
      format: String(r.format),
      createdAt: String(r.created_at),
      host: {
        username: r.username ? String(r.username) : null,
        avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      },
      hostId: String(r.player1_id),
      hostDeck: { name: hostDeckName(r) },
    })),
    recentCompleted: completed.map(r => ({
      setCode: String(r.set_code),
      format: String(r.format),
      completedAt: String(r.completed_at),
      players: [r.p1 ? String(r.p1) : null, r.p2 ? String(r.p2) : null],
    })),
  }
}

export async function getOpenGameByShareId(shareId: string): Promise<OpenGame | null> {
  const { queryRow } = await import('@/lib/db')
  const row = await queryRow('SELECT * FROM open_games WHERE share_id = $1', [shareId])
  return row ? rowToGame(row) : null
}

// ---------------------------------------------------------------------------
// Sweep + disconnect delist
// ---------------------------------------------------------------------------

/**
 * Terminal-escape sweep: no status can wedge a player out of the lobby.
 *  - open       > 2h                                      -> expired
 *  - accepted   > 20 min with no live lobby attempt        -> abandoned
 *  - lobby_ready with no progress for 60 min               -> abandoned
 *  - in_progress with no result for 4h                     -> abandoned
 */
export interface ResolvedListing {
  shareId: string
  format: string
  discordMessageId: string | null
}

export async function sweepOpenGames(options: { onlineUserIds?: string[] } = {}): Promise<{
  expired: number
  abandoned: number
  expiredListings: ResolvedListing[]
}> {
  const { queryRows, query } = await import('@/lib/db')
  const online = options.onlineUserIds ?? []
  // 1h expiry applies to OFFLINE posters; a poster who's still connected
  // keeps their listing alive up to a 6h hard cap.
  const expiredRows = await queryRows(
    `UPDATE open_games SET status = 'expired', resolved_at = NOW(), updated_at = NOW()
     WHERE status = 'open'
       AND (
         (created_at < NOW() - INTERVAL '1 hour' AND NOT (player1_id = ANY($1::uuid[])))
         OR created_at < NOW() - INTERVAL '6 hours'
       )
     RETURNING share_id, format, discord_message_id`,
    [online]
  )
  const abandoned = await query(
    `UPDATE open_games og SET status = 'abandoned', resolved_at = NOW(), updated_at = NOW()
     WHERE (
        (og.status = 'accepted' AND og.accepted_at < NOW() - INTERVAL '20 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM open_game_lobby_attempts a
            WHERE a.open_game_id = og.id
              AND a.status IN ('lobby_ready', 'in_progress', 'complete')
          ))
        OR (og.status = 'lobby_ready' AND og.updated_at < NOW() - INTERVAL '60 minutes')
        OR (og.status = 'in_progress' AND og.updated_at < NOW() - INTERVAL '4 hours')
     )`
  )
  return {
    expired: expiredRows.length,
    abandoned: abandoned.rowCount ?? 0,
    expiredListings: expiredRows.map(r => ({
      shareId: String(r.share_id),
      format: String(r.format),
      discordMessageId: r.discord_message_id ? String(r.discord_message_id) : null,
    })),
  }
}

/** Presence-grace delist (R9): open listings only — never touches live matches. */
export async function delistOpenGamesForUser(userId: string): Promise<ResolvedListing[]> {
  const { queryRows } = await import('@/lib/db')
  const rows = await queryRows(
    `UPDATE open_games SET status = 'delisted', resolved_at = NOW(), updated_at = NOW()
     WHERE player1_id = $1 AND status = 'open'
     RETURNING share_id, format, discord_message_id`,
    [userId]
  )
  return rows.map(r => ({
    shareId: String(r.share_id),
    format: String(r.format),
    discordMessageId: r.discord_message_id ? String(r.discord_message_id) : null,
  }))
}

/** Persist the Discord LFG message id for later resolution (U3). */
export async function setOpenGameDiscordMessage(gameId: string, messageId: string): Promise<void> {
  const { query } = await import('@/lib/db')
  await query('UPDATE open_games SET discord_message_id = $2, updated_at = NOW() WHERE id = $1', [gameId, messageId])
}
