// @ts-nocheck
// GET /api/draft/:shareId - Get draft pod details
// DELETE /api/draft/:shareId - Delete draft pod (host only)
import { queryRow, queryRows } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { getPackArtUrl } from '@/src/utils/packArt'
import { checkAndEnforceTimeout } from '@/src/utils/draftTimeout'
import { cancelDraftPod } from '@/src/utils/podCleanup'
import { jsonParse } from '@/src/utils/json'
import { resolveCatalogCards } from '@/src/services/cards/cardCatalogResolver'
import { deckIdentityFromDeckState } from '@/src/services/matchmaking/eventAnalytics'
import { fetchRoundsWithMatches } from '@/src/utils/matchmakingRounds'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = getSession(request)

    // Get draft pod (exclude all_packs to improve performance)
    let pod = await queryRow(
      `SELECT
        dp.id, dp.share_id, dp.host_id, dp.status, dp.current_players, dp.max_players,
        dp.set_code, dp.set_name, dp.name, dp.settings,
        dp.draft_state, dp.state_version, dp.started_at, dp.completed_at,
        dp.timer_enabled, dp.timer_seconds, dp.pick_timeout_seconds, dp.timed,
        dp.pick_started_at, dp.paused, dp.paused_at, dp.paused_duration_seconds,
        dp.is_public, dp.observer_public, dp.competitive, dp.deck_lock_at, dp.decks_unlocked,
        dp.created_at, dp.updated_at,
        u.username as host_username,
        u.avatar_url as host_avatar
       FROM pods dp
       LEFT JOIN users u ON dp.host_id = u.id
       WHERE dp.share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Check and enforce timeouts (server-side timeout enforcement)
    // Only run during active drafts - skip in waiting room for performance
    const timeoutEnforced = pod.status === 'active' ? await checkAndEnforceTimeout(pod.id) : false
    if (timeoutEnforced) {
      // Re-fetch pod since state changed (exclude all_packs)
      pod = await queryRow(
        `SELECT
          dp.id, dp.share_id, dp.host_id, dp.status, dp.current_players, dp.max_players,
          dp.set_code, dp.set_name, dp.name, dp.settings,
          dp.draft_state, dp.state_version, dp.started_at, dp.completed_at,
          dp.timer_enabled, dp.timer_seconds, dp.pick_timeout_seconds, dp.timed,
          dp.pick_started_at, dp.paused, dp.paused_at, dp.paused_duration_seconds,
          dp.is_public, dp.observer_public, dp.competitive, dp.deck_lock_at, dp.decks_unlocked,
          dp.created_at, dp.updated_at,
          u.username as host_username,
          u.avatar_url as host_avatar
         FROM pods dp
         LEFT JOIN users u ON dp.host_id = u.id
         WHERE dp.share_id = $1`,
        [shareId]
      )
    }

    // Get all players. `is_ready` reflects whether the player has LOCKED a deck
    // (hit Play → a built_decks row exists), NOT merely picked a leader/base in
    // the in-progress deckbuilder. The Swiss Practice roster uses this.
    const players = await queryRows(
      `SELECT
        dpp.*,
        u.id as user_id,
        u.username,
        u.avatar_url,
        cp.share_id as pool_share_id,
        cp.deck_builder_state,
        cp.cards as pool_cards,
        CASE WHEN bd.id IS NOT NULL THEN true ELSE false END as is_ready
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       LEFT JOIN card_pools cp ON cp.pod_id = dpp.pod_id AND cp.user_id = dpp.user_id
       LEFT JOIN built_decks bd ON bd.card_pool_id = cp.id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    )

    // Find current user's player data if logged in
    let myPlayer = null
    if (session) {
      myPlayer = players.find(p => p.user_id === session.id) || null
    }

    // Parse JSON fields
    const draftState = jsonParse(pod.draft_state, {})
    const settings = jsonParse(pod.settings, {})

    // Check if we're in leader preview/draft phase (show leader packs to all)
    const isLeaderDraftPhase = draftState?.phase === 'leader_draft' || draftState?.phase === 'leader_preview'

    // Format players for response
  const formattedPlayers = players.map(p => {
    const draftedLeaders = resolveCatalogCards(jsonParse(p.drafted_leaders, []))
    const leadersPack = resolveCatalogCards(jsonParse(p.leaders, []))
    const deckIdentity = deckIdentityFromDeckState(p.deck_builder_state, draftedLeaders)
    const poolCards = jsonParse(p.pool_cards, [])

    return {
      id: p.id,
        odId: p.user_id,
        username: p.username,
        avatarUrl: p.avatar_url,
        seatNumber: p.seat_number,
        pickStatus: p.pick_status,
        selectionConfirmed: p.selection_confirmed === true,
        isBot: p.is_bot === true,
        // Only include pack info for current user
        currentPack: session && p.user_id === session.id
          ? resolveCatalogCards(jsonParse(p.current_pack))
          : null,
        currentPackSize: jsonParse(p.current_pack, []).length,
        // During leader draft, show each player's leader pack to all (visible at the table)
        leaderPack: isLeaderDraftPhase ? leadersPack.map(l => ({
          name: l.name,
          aspects: l.aspects || [],
          imageUrl: l.imageUrl,
          backImageUrl: l.backImageUrl,
        })) : null,
        draftedCardsCount: jsonParse(p.drafted_cards, []).length,
        draftedLeadersCount: draftedLeaders.length,
        // Include leader info for all players (for tooltips)
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
      leaderImageUrl: deckIdentity.leaderImageUrl,
      baseImageUrl: deckIdentity.baseImageUrl,
      poolCardCount: Array.isArray(poolCards) ? poolCards.length : null,
      isReady: p.is_ready === true,
      // Lobby handshake (migration 079) — distinct from `isReady` above, which
      // means "deck locked". Bots are ready by definition. Mirrors what
      // broadcastDraftState emits so an initial page load and a socket update
      // agree about who has readied.
      lobbyReady: p.is_bot === true || p.lobby_ready === true,
    }
  })

    // For competitive pods in matchmaking phase, include matchmaking data
    // so clients that load the page AFTER start-matches (and miss the socket
    // broadcast) still see the correct state. Mirrors what broadcastDraftState
    // emits over the socket for the same phase.
    let matchmakingStatus: string | undefined
    let currentRound: number | undefined
    let roundsWithMatches: unknown[] | undefined
    if (pod.competitive === true && draftState?.phase === 'matchmaking') {
      matchmakingStatus = draftState.matchmakingStatus || 'active'
      currentRound = draftState.currentRound || 1
      // Single query for all rounds + matches (U8) — this endpoint is polled
      // every 2 s, so the old per-round loop was an N+1 on the hot path.
      roundsWithMatches = await fetchRoundsWithMatches(pod.id)
    }

    return jsonResponse({
      id: pod.id,
      shareId: pod.share_id,
      setCode: pod.set_code,
      setName: pod.set_name,
      name: pod.name,
      setArtUrl: getPackArtUrl(pod.set_code),
      status: pod.status,
      maxPlayers: pod.max_players,
      currentPlayers: pod.current_players,
      timed: pod.timed === true,
      timerEnabled: pod.timer_enabled,
      timerSeconds: pod.timer_seconds,
      pickTimeoutSeconds: pod.pick_timeout_seconds || 60,
      stateVersion: pod.state_version,
      draftState,
      settings,
      host: {
        id: pod.host_id,
        username: pod.host_username,
        avatarUrl: pod.host_avatar,
      },
      players: formattedPlayers,
      isPublic: pod.is_public || false,
      observerPublic: pod.observer_public || false,
      isHost: session ? pod.host_id === session.id : false,
      isPlayer: !!myPlayer,
      myPlayer: myPlayer ? {
        id: myPlayer.id,
        seatNumber: myPlayer.seat_number,
        pickStatus: myPlayer.pick_status,
        selectedCardId: myPlayer.selected_card_id || null,
        selectionConfirmed: myPlayer.selection_confirmed === true,
        currentPack: resolveCatalogCards(jsonParse(myPlayer.current_pack)),
        draftedCards: resolveCatalogCards(jsonParse(myPlayer.drafted_cards, [])),
        leaders: resolveCatalogCards(jsonParse(myPlayer.leaders, [])),
        draftedLeaders: resolveCatalogCards(jsonParse(myPlayer.drafted_leaders, [])),
      } : null,
      startedAt: pod.started_at,
      completedAt: pod.completed_at,
      createdAt: pod.created_at,
      pickStartedAt: pod.pick_started_at,
      paused: pod.paused === true,
      pausedAt: pod.paused_at,
      pausedDurationSeconds: pod.paused_duration_seconds || 0,
      serverNow: new Date().toISOString(),
      competitive: pod.competitive === true,
      deckBuildDeadline: pod.deck_lock_at || null,
      decksUnlocked: pod.decks_unlocked === true,
      matchmakingStatus,
      currentRound,
      rounds: roundsWithMatches,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Get pod and verify host
    const pod = await queryRow(
      `SELECT id, host_id FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can delete the draft', 403)
    }

    // The teardown (card attribution, chat + Discord notices, deletion, the
    // 'deleted' broadcast) lives in cancelDraftPod so the stalled-preview sweep
    // cancels pods exactly the way the host does, instead of drifting into a
    // second implementation.
    await cancelDraftPod(
      pod.id,
      session.username,
      `❌ **${session.username}** cancelled the draft.`
    )

    return jsonResponse({ message: 'Draft deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
