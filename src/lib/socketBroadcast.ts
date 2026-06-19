// @ts-nocheck
/**
 * Socket.io Broadcast Helper
 *
 * Broadcasts draft state updates to all connected clients via WebSocket.
 * Sends PUBLIC data only - clients fetch their user-specific data via HTTP.
 */
import { queryRow, queryRows } from '@/lib/db'
import { jsonParse } from '@/src/utils/json'
import { deckIdentityFromDeckState } from '@/src/services/matchmaking/eventAnalytics'
import { fetchRoundsWithMatches } from '@/src/utils/matchmakingRounds'
import type { Server as SocketIOServer } from 'socket.io'

// Extend global with io
declare global {
  // eslint-disable-next-line no-var
  var io: SocketIOServer | undefined
}

interface Pod {
  id: string
  share_id: string
  status: string
  state_version: number
  draft_state: string | Record<string, unknown>
  host_id: string
  timed: boolean
  timer_enabled: boolean
  timer_seconds: number
  pick_timeout_seconds: number
  started_at: string | null
  completed_at: string | null
  pick_started_at: string | null
  paused: boolean
  paused_at: string | null
  paused_duration_seconds: number
  competitive: boolean
  deck_lock_at: string | null
}

interface DraftPlayer {
  id: string
  user_id: string
  seat_number: number
  pick_status: string
  is_bot: boolean
  dropped: boolean
  leaders: string | unknown[]
  drafted_leaders: string | unknown[]
  drafted_cards: string | unknown[]
  current_pack: string | unknown[]
  username: string
  avatar_url: string
  pool_share_id: string | null
  deck_builder_state: string | Record<string, unknown> | null
  pool_cards: string | unknown[] | null
}

interface PublicLeader {
  name: string
  aspects: string[]
  imageUrl: string
  backImageUrl: string
}

interface PublicPlayer {
  id: string
  odId: string
  username: string
  avatarUrl: string
  seatNumber: number
  pickStatus: string
  isBot: boolean
  dropped: boolean
  currentPackSize: number
  leaderPack: PublicLeader[] | null
  draftedCardsCount: number
  draftedLeadersCount: number
  draftedLeaders: PublicLeader[]
  poolShareId: string | null
  activeLeaderName: string | null
  baseName: string | null
  baseAspects: string[]
  baseHp: number | null
  archetypeName: string | null
  poolCardCount: number | null
}

interface BroadcastState {
  stateVersion: number
  status: string
  draftState: Record<string, unknown>
  players: PublicPlayer[]
  timed: boolean
  timerEnabled: boolean
  timerSeconds: number
  pickTimeoutSeconds: number
  startedAt: string | null
  completedAt: string | null
  pickStartedAt: string | null
  paused: boolean
  pausedAt: string | null
  pausedDurationSeconds: number
  competitive: boolean
  matchmakingStatus?: string
  currentRound?: number
  deckBuildDeadline?: string | null
  rounds?: unknown[]
}

/**
 * Broadcast draft state to all connected clients in a draft room.
 * @param shareId - Draft share ID
 */
export async function broadcastDraftState(shareId: string): Promise<void> {
  const io = global.io
  if (!io) {
    console.warn('[Broadcast] Socket.io not initialized - broadcast skipped')
    return
  }

  try {
    const pod = await queryRow(
      `SELECT dp.id, dp.share_id, dp.status, dp.state_version, dp.draft_state,
              dp.host_id, dp.timed, dp.timer_enabled, dp.timer_seconds, dp.pick_timeout_seconds,
              dp.started_at, dp.completed_at, dp.pick_started_at,
              dp.paused, dp.paused_at, dp.paused_duration_seconds, dp.competitive,
              dp.deck_lock_at
       FROM pods dp WHERE dp.share_id = $1`,
      [shareId]
    ) as Pod | null

    if (!pod) {
      io.to(`draft:${shareId}`).emit('deleted')
      return
    }

    // Get all players (public info only)
    const players = await queryRows(
      `SELECT dpp.id, dpp.user_id, dpp.seat_number, dpp.pick_status, dpp.is_bot,
              dpp.dropped, dpp.leaders, dpp.drafted_leaders, dpp.drafted_cards, dpp.current_pack,
              u.username, u.avatar_url,
              cp.share_id AS pool_share_id, cp.deck_builder_state, cp.cards AS pool_cards
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       LEFT JOIN card_pools cp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    ) as DraftPlayer[]

    const draftState = jsonParse<Record<string, unknown>>(pod.draft_state, {}) as Record<string, unknown>

    const isLeaderDraftPhase = draftState?.phase === 'leader_draft'

    // Build PUBLIC player data (visible to all)
    const publicPlayers: PublicPlayer[] = players.map(p => {
      const draftedLeaders = jsonParse<unknown[]>(p.drafted_leaders, []) as { name: string; aspects?: string[]; imageUrl: string; backImageUrl: string }[]
      const leadersPack = jsonParse<unknown[]>(p.leaders, []) as { name: string; aspects?: string[]; imageUrl: string; backImageUrl: string }[]
      const deckIdentity = deckIdentityFromDeckState(p.deck_builder_state, draftedLeaders)
      const poolCards = jsonParse<unknown[]>(p.pool_cards, []) as unknown[]

      return {
        id: p.id,
        odId: p.user_id,
        username: p.username,
        avatarUrl: p.avatar_url,
        seatNumber: p.seat_number,
        pickStatus: p.pick_status,
        isBot: p.is_bot === true,
        dropped: p.dropped === true,
        currentPackSize: (jsonParse<unknown[]>(p.current_pack, []) as unknown[]).length,
        // During leader draft, show each player's leader pack to all (visible at the table)
        leaderPack: isLeaderDraftPhase ? leadersPack.map(l => ({
          name: l.name,
          aspects: l.aspects || [],
          imageUrl: l.imageUrl,
          backImageUrl: l.backImageUrl,
        })) : null,
        draftedCardsCount: (jsonParse<unknown[]>(p.drafted_cards, []) as unknown[]).length,
        draftedLeadersCount: draftedLeaders.length,
        draftedLeaders: draftedLeaders.map(l => ({
          name: l.name,
          aspects: l.aspects || [],
          imageUrl: l.imageUrl,
          backImageUrl: l.backImageUrl,
        })),
        poolShareId: p.pool_share_id || null,
        activeLeaderName: deckIdentity.activeLeaderName,
        baseName: deckIdentity.baseName,
        baseAspects: deckIdentity.baseAspects,
        baseHp: deckIdentity.baseHp,
        archetypeName: deckIdentity.archetypeName,
        poolCardCount: Array.isArray(poolCards) ? poolCards.length : null,
      }
    })

    // Broadcast public state to all clients in the room
    const broadcastPayload: BroadcastState = {
      stateVersion: pod.state_version,
      status: pod.status,
      draftState,
      players: publicPlayers,
      timed: pod.timed !== false,
      timerEnabled: pod.timer_enabled,
      timerSeconds: pod.timer_seconds,
      pickTimeoutSeconds: pod.pick_timeout_seconds || 120,
      startedAt: pod.started_at,
      completedAt: pod.completed_at,
      pickStartedAt: pod.pick_started_at,
      paused: pod.paused === true,
      pausedAt: pod.paused_at,
      pausedDurationSeconds: pod.paused_duration_seconds || 0,
      competitive: pod.competitive === true,
    }

    // Add matchmaking data for competitive pods in matchmaking phase
    const podDraftState = typeof pod.draft_state === 'string' ? JSON.parse(pod.draft_state) : pod.draft_state || {}

    // Always include deck build deadline for competitive pods (covers complete and matchmaking phases)
    if (pod.competitive && pod.deck_lock_at) {
      broadcastPayload.deckBuildDeadline = pod.deck_lock_at
    }

    if (podDraftState.phase === 'matchmaking' && pod.competitive) {
      broadcastPayload.matchmakingStatus = podDraftState.matchmakingStatus || 'active'
      broadcastPayload.currentRound = podDraftState.currentRound || 1
      broadcastPayload.deckBuildDeadline = pod.deck_lock_at
      broadcastPayload.rounds = await fetchRoundsWithMatches(pod.id)
    }

    io.to(`draft:${shareId}`).emit('state', broadcastPayload)
  } catch (err) {
    console.error('Error broadcasting draft state:', err)
  }
}

/**
 * Broadcast a simple event to all clients in a draft room
 * @param shareId - Draft share ID
 * @param eventType - Event type
 * @param data - Event data
 */
export function broadcastEvent(shareId: string, eventType: string, data: Record<string, unknown> = {}): void {
  const io = global.io
  if (!io) {
    console.warn('Socket.io not initialized - event broadcast skipped')
    return
  }

  io.to(`draft:${shareId}`).emit(eventType, {
    timestamp: Date.now(),
    ...data,
  })
}

/**
 * Broadcast pod state to all connected clients on the pod page.
 * Sends player readiness updates when someone builds a deck.
 * @param draftShareId - Draft share ID
 */
export async function broadcastPodState(draftShareId: string): Promise<void> {
  const io = global.io
  if (!io) {
    console.warn('[Broadcast] Socket.io not initialized - pod broadcast skipped')
    return
  }

  try {
    const pod = await queryRow(
      `SELECT dp.id, dp.share_id, dp.status
       FROM pods dp WHERE dp.share_id = $1`,
      [draftShareId]
    )

    if (!pod) {
      io.to(`pod:${draftShareId}`).emit('deleted')
      return
    }

    // Get all players with readiness status
    const players = await queryRows(
      `SELECT
        dpp.user_id,
        dpp.seat_number,
        u.username,
        u.avatar_url,
        CASE WHEN bd.id IS NOT NULL THEN true ELSE false END as is_ready
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       LEFT JOIN card_pools cp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id
       LEFT JOIN built_decks bd ON bd.card_pool_id = cp.id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    )

    io.to(`pod:${draftShareId}`).emit('pod-state', {
      timestamp: Date.now(),
      players: players.map(p => ({
        id: p.user_id,
        username: p.username,
        avatarUrl: p.avatar_url,
        seatNumber: p.seat_number,
        isReady: p.is_ready,
      })),
    })
  } catch (err) {
    console.error('Error broadcasting pod state:', err)
  }
}

/**
 * Broadcast sealed pod state to all connected clients in a sealed pod room.
 * Sends player list and pod status.
 * @param shareId - Sealed pod share ID
 */
export async function broadcastSealedPodState(shareId: string): Promise<void> {
  const io = global.io
  if (!io) {
    console.warn('[Broadcast] Socket.io not initialized - sealed pod broadcast skipped')
    return
  }

  try {
    const pod = await queryRow(
      `SELECT dp.id, dp.share_id, dp.status, dp.state_version, dp.set_code, dp.set_name,
              dp.host_id, dp.current_players, dp.max_players, dp.settings
       FROM pods dp WHERE dp.share_id = $1 AND dp.pod_type = 'sealed'`,
      [shareId]
    ) as { id: string; share_id: string; status: string; state_version: number; set_code: string; set_name: string; host_id: string; current_players: number; max_players: number; settings: string | Record<string, unknown> } | null

    if (!pod) {
      io.to(`sealed:${shareId}`).emit('deleted')
      return
    }

    const players = await queryRows(
      `SELECT dpp.id, dpp.user_id, dpp.seat_number,
              u.username, u.avatar_url
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    ) as { id: string; user_id: string; seat_number: number; username: string; avatar_url: string }[]

    const settings = jsonParse<Record<string, unknown>>(pod.settings, {}) as Record<string, unknown>

    io.to(`sealed:${shareId}`).emit('sealed-state', {
      stateVersion: pod.state_version,
      status: pod.status,
      currentPlayers: pod.current_players,
      maxPlayers: pod.max_players,
      settings,
      players: players.map(p => ({
        id: p.user_id,
        username: p.username,
        avatarUrl: p.avatar_url,
        seatNumber: p.seat_number,
      })),
      timestamp: Date.now(),
    })
  } catch (err) {
    console.error('Error broadcasting sealed pod state:', err)
  }
}

/**
 * Broadcast updated public pods list to all clients on the multiplayer page.
 * Called when a pod's is_public flag changes or a public pod is created/deleted.
 */
export async function broadcastPublicPodsUpdate(): Promise<void> {
  const io = global.io
  if (!io) return

  try {
    const pods = await queryRows(
      `SELECT dp.share_id, dp.pod_type, dp.set_code, dp.set_name, dp.name,
              dp.max_players, dp.current_players, dp.created_at,
              u.username as host_username, u.avatar_url as host_avatar
       FROM pods dp
       LEFT JOIN users u ON dp.host_id = u.id
       WHERE dp.is_public = true AND dp.status = 'waiting'
             AND dp.created_at > NOW() - INTERVAL '2 hours'
       ORDER BY dp.created_at DESC LIMIT 20`,
      []
    ) as { share_id: string; pod_type: string; set_code: string; set_name: string; name: string | null; max_players: number; current_players: number; created_at: string; host_username: string; host_avatar: string }[]

    io.to('public-pods').emit('public-pods-update', {
      pods: pods.map(p => ({
        shareId: p.share_id,
        podType: p.pod_type,
        setCode: p.set_code,
        setName: p.set_name,
        name: p.name,
        maxPlayers: p.max_players,
        currentPlayers: p.current_players,
        host: { username: p.host_username, avatarUrl: p.host_avatar },
        createdAt: p.created_at,
      })),
      timestamp: Date.now(),
    })
  } catch (err) {
    console.error('Error broadcasting public pods update:', err)
  }
}

/**
 * Broadcast a system chat message to all clients in a pod's chat room.
 * Used for event notifications (join, leave, rename, start) so they
 * appear in both Discord threads and the web chat panel.
 */
export function broadcastSystemChatMessage(shareId: string, text: string): void {
  const io = global.io
  if (!io) return

  io.to(`chat:${shareId}`).emit('chat:message', {
    username: 'System',
    avatarUrl: null,
    text,
    timestamp: new Date().toISOString(),
    isSystem: true,
  })
}

/**
 * Broadcast rotisserie draft state to all connected clients.
 * @param shareId - Rotisserie draft share ID
 */
export async function broadcastRotisserieState(shareId: string): Promise<void> {
  const io = global.io
  if (!io) {
    console.warn('[Broadcast] Socket.io not initialized - rotisserie broadcast skipped')
    return
  }

  try {
    const pool = await queryRow(
      'SELECT * FROM card_pools WHERE share_id = $1 AND pool_type = $2',
      [shareId, 'rotisserie']
    )

    if (!pool) {
      io.to(`rotisserie:${shareId}`).emit('deleted')
      return
    }

    const data = jsonParse(pool.cards, {})

    // Broadcast full state to all clients in the room
    io.to(`rotisserie:${shareId}`).emit('state', {
      shareId: pool.share_id,
      createdAt: pool.created_at,
      timestamp: Date.now(),
      ...data
    })
  } catch (err) {
    console.error('Error broadcasting rotisserie state:', err)
  }
}
