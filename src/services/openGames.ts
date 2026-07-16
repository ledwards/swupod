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
export const ACCEPTED_NO_LOBBY_EXPIRY_MS = 2 * 60 * 60 * 1000 // revised 7/15: 2h
export const LOBBY_READY_STALE_MS = 2 * 60 * 60 * 1000 // revised 7/15: 2h
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
  bestOf: number
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
  bestOf?: number
  /** The listing's live Karabast lobby id (create-at-post) — used to dedupe
   *  the same lobby out of the mixed-in Karabast rows. */
  karabastLobbyId?: string | null
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
    bestOf: Number(row.best_of) || 1,
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
 * Deck eligibility (R23, revised 7/15): the pool belongs to the user and its
 * deck builder has a leader, a base, AND at least one deck-section card —
 * leader+base alone let unbuilt decks reach lobbies (empty deck.json,
 * Karabast rejects). Still NOT gated on built_decks: that row only exists
 * once the player has clicked Play, which hid fully-built decks.
 */
async function requireEligibleDeck(tx: TxClient, userId: string, poolId: string): Promise<EligibleDeck> {
  const pool = await tx.queryRow(
    `SELECT cp.id, cp.user_id, cp.set_code, cp.set_name, cp.pool_type, cp.hidden,
            (cp.deck_builder_state ->> 'activeLeader' IS NOT NULL
             AND cp.deck_builder_state ->> 'activeBase' IS NOT NULL
             AND jsonb_path_exists(cp.deck_builder_state, '$.cardPositions.* ? (@.section == "deck" && @.visible == true)')) AS deck_ready
     FROM card_pools cp
     WHERE cp.id = $1`,
    [poolId]
  )
  if (!pool) throw new OpenGameError('not_found', 'Pool not found', 404)
  if (pool.user_id !== userId) {
    throw new OpenGameError('forbidden', 'That pool belongs to another player', 403)
  }
  if (pool.hidden === true || pool.deck_ready !== true) {
    throw new OpenGameError('deck_not_ready', 'Finish building a deck for this pool first (leader, base, and deck cards)', 400)
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
  bestOf?: number
}

async function postOpenGameInTx(tx: TxClient, params: PostParams): Promise<OpenGame> {
  const { userId, poolId, visibility = 'public' } = params
  const bestOf = params.bestOf === 3 ? 3 : 1
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
    `INSERT INTO open_games (share_id, visibility, set_code, set_name, format, player1_id, player1_pool_id, best_of)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [generateShareId(10), visibility, deck.setCode, deck.setName, deck.format, userId, deck.poolId, bestOf]
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

  // Joining EXITS whatever the joiner had going (their own open listing and
  // any stale pending match) — replace, never block, same spirit as R19.
  await tx.query(
    `UPDATE open_games SET status = 'cancelled', resolved_at = NOW(), updated_at = NOW()
     WHERE id <> $2
       AND (
         (player1_id = $1 AND status = 'open')
         OR ((player1_id = $1 OR player2_id = $1) AND status = ANY($3))
       )`,
    [userId, target.id, [...PENDING_STATUSES]]
  )

  // The HOST being mid-match is a real conflict (their listing is stale).
  if ((await pendingMatchCount(tx, [posterId])) > 0) {
    throw new OpenGameError('pending_match_exists', 'The host is already in another lobby')
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

/**
 * Seat-2 exit (pre-game): the joiner leaves and the HOST'S LOBBY SURVIVES —
 * back to 'open' on the board, seat 2 vacated. (In progress or complete
 * games can't be exited; the host path is cancelOpenGame.)
 */
export async function exitOpenGame(params: { gameId: string; userId: string }): Promise<OpenGame> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(async tx => {
    const row = await tx.queryRow('SELECT * FROM open_games WHERE id = $1', [params.gameId])
    if (!row) throw new OpenGameError('not_found', 'Game not found', 404)
    if (String(row.player2_id) !== String(params.userId)) {
      throw new OpenGameError('forbidden', 'Only the joiner can exit', 403)
    }
    if (!['accepted', 'lobby_ready'].includes(String(row.status))) {
      throw new OpenGameError('listing_gone', 'This lobby can no longer be exited')
    }
    const updated = await tx.queryRow(
      `UPDATE open_games
       SET status = 'open', player2_id = NULL, player2_pool_id = NULL,
           player2_external = FALSE, accepted_at = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [params.gameId]
    )
    return rowToGame(updated!)
  })
}

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
            og.best_of, og.player1_id, u.username, u.avatar_url,
            cp.deck_builder_state, cp.name AS pool_name, cp.pool_type,
            cp.created_at AS pool_created_at, att.lobby_id AS karabast_lobby_id
     FROM open_games og
     JOIN users u ON u.id = og.player1_id
     JOIN card_pools cp ON cp.id = og.player1_pool_id
     LEFT JOIN LATERAL (
       SELECT a.lobby_id FROM open_game_lobby_attempts a
       WHERE a.open_game_id = og.id AND a.lobby_id IS NOT NULL
         AND a.status IN ('creating', 'lobby_ready', 'joined', 'in_progress')
       ORDER BY a.attempt_number DESC LIMIT 1
     ) att ON true
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
      bestOf: Number(r.best_of) || 1,
      karabastLobbyId: r.karabast_lobby_id ? String(r.karabast_lobby_id) : null,
    })),
    recentCompleted: completed.map(r => ({
      setCode: String(r.set_code),
      format: String(r.format),
      completedAt: String(r.completed_at),
      players: [r.p1 ? String(r.p1) : null, r.p2 ? String(r.p2) : null],
    })),
  }
}

/**
 * Bo1/Bo3 toggle (host only, while the listing is still open — once an
 * opponent has joined the terms are locked).
 */
export async function setOpenGameBestOf(params: {
  shareId: string
  userId: string
  bestOf: number
}): Promise<OpenGame> {
  if (params.bestOf !== 1 && params.bestOf !== 3) {
    throw new OpenGameError('not_found', 'bestOf must be 1 or 3', 400)
  }
  const { queryRow } = await import('@/lib/db')
  const existing = await queryRow(
    'SELECT id, player1_id, status FROM open_games WHERE share_id = $1',
    [params.shareId]
  )
  if (!existing) throw new OpenGameError('not_found', 'Game not found', 404)
  if (String(existing.player1_id) !== String(params.userId)) {
    throw new OpenGameError('forbidden', 'Only the host can change the match length', 403)
  }
  const row = await queryRow(
    `UPDATE open_games SET best_of = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [existing.id, params.bestOf]
  )
  if (!row) {
    throw new OpenGameError('listing_gone', 'The lobby is no longer open — match length is locked', 409)
  }
  return rowToGame(row)
}

/** Host swaps the listing's deck while it's still open (also updates the
 *  listing's set/format — it follows the deck, R31). */
export async function setOpenGameDeck(params: {
  shareId: string
  userId: string
  poolId: string
}): Promise<OpenGame> {
  const { withTransaction } = await import('@/lib/db')
  return withTransaction(async tx => {
    await lockUsers(tx, [params.userId])
    const row = await tx.queryRow('SELECT id, player1_id, status FROM open_games WHERE share_id = $1', [params.shareId])
    if (!row) throw new OpenGameError('not_found', 'Game not found', 404)
    if (String(row.player1_id) !== String(params.userId)) {
      throw new OpenGameError('forbidden', 'Only the host can change the deck', 403)
    }
    const deck = await requireEligibleDeck(tx, params.userId, params.poolId)
    const updated = await tx.queryRow(
      `UPDATE open_games
       SET player1_pool_id = $2, set_code = $3, set_name = $4, format = $5, updated_at = NOW()
       WHERE id = $1 AND status = 'open'
       RETURNING *`,
      [row.id, deck.poolId, deck.setCode, deck.setName, deck.format]
    )
    if (!updated) {
      throw new OpenGameError('listing_gone', 'The lobby is no longer open — the deck is locked', 409)
    }
    return rowToGame(updated)
  })
}

/** The caller's own active listing (any visibility) — powers the "Your Open
 *  Lobby" entry in the user menu. One-listing invariant makes LIMIT 1 exact. */
export async function getMyOpenListing(userId: string): Promise<{
  shareId: string
  setCode: string
  format: string
  visibility: string
  createdAt: string
  deckName: string | null
} | null> {
  const { queryRow } = await import('@/lib/db')
  const r = await queryRow(
    `SELECT og.share_id, og.set_code, og.format, og.visibility, og.created_at,
            cp.deck_builder_state, cp.name AS pool_name, cp.pool_type,
            cp.created_at AS pool_created_at
     FROM open_games og
     JOIN card_pools cp ON cp.id = og.player1_pool_id
     WHERE og.player1_id = $1 AND og.status = 'open'
     ORDER BY og.created_at DESC
     LIMIT 1`,
    [userId]
  )
  if (!r) return null
  return {
    shareId: String(r.share_id),
    setCode: String(r.set_code),
    format: String(r.format),
    visibility: String(r.visibility),
    createdAt: String(r.created_at),
    deckName: hostDeckName(r),
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
 *  - accepted   > 2h with no live lobby attempt            -> abandoned
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
  closedMatches: Array<{ shareId: string; playerIds: string[] }>
}> {
  const { queryRows } = await import('@/lib/db')
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
  const abandonedRows = await queryRows(
    `UPDATE open_games og SET status = 'abandoned', resolved_at = NOW(), updated_at = NOW()
     WHERE (
        (og.status = 'accepted' AND og.accepted_at < NOW() - INTERVAL '2 hours'
          AND NOT EXISTS (
            SELECT 1 FROM open_game_lobby_attempts a
            WHERE a.open_game_id = og.id
              AND a.status IN ('lobby_ready', 'in_progress', 'complete')
          ))
        OR (og.status = 'lobby_ready' AND og.updated_at < NOW() - INTERVAL '2 hours')
        OR (og.status = 'in_progress' AND og.updated_at < NOW() - INTERVAL '4 hours')
     )
     RETURNING share_id, player1_id, player2_id`
  )
  return {
    expired: expiredRows.length,
    abandoned: abandonedRows.length,
    expiredListings: expiredRows.map(r => ({
      shareId: String(r.share_id),
      format: String(r.format),
      discordMessageId: r.discord_message_id ? String(r.discord_message_id) : null,
    })),
    // Every abandoned MATCH with its seats — the sweep job pushes 'closed'
    // to both players so nobody sits in a dead lobby until a refresh.
    closedMatches: abandonedRows.map(r => ({
      shareId: String(r.share_id),
      playerIds: [r.player1_id, r.player2_id].filter(Boolean).map(String),
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
