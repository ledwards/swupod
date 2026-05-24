// @ts-nocheck
// GET /api/draft/:shareId - Get draft pod details
// DELETE /api/draft/:shareId - Delete draft pod (host only)
import { query, queryRow, queryRows } from '@/lib/db'
import { getSession, requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { getPackArtUrl } from '@/src/utils/packArt'
import { checkAndEnforceTimeout } from '@/src/utils/draftTimeout'
import { markPodCancelled, deletePodMessage } from '@/lib/discordLfg'
import { broadcastDraftState, broadcastSystemChatMessage } from '@/src/lib/socketBroadcast'
import { jsonParse } from '@/src/utils/json'
import { resolveCatalogCards } from '@/src/services/cards/cardCatalogResolver'
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
        dp.is_public, dp.competitive, dp.deck_lock_at,
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
          dp.is_public, dp.competitive, dp.deck_lock_at,
          dp.created_at, dp.updated_at,
          u.username as host_username,
          u.avatar_url as host_avatar
         FROM pods dp
         LEFT JOIN users u ON dp.host_id = u.id
         WHERE dp.share_id = $1`,
        [shareId]
      )
    }

    // Get all players
    const players = await queryRows(
      `SELECT
        dpp.*,
        u.id as user_id,
        u.username,
        u.avatar_url
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
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

    // Check if we're in leader draft phase (show leader packs to all)
    const isLeaderDraftPhase = draftState?.phase === 'leader_draft'

    // Format players for response
    const formattedPlayers = players.map(p => {
      const draftedLeaders = resolveCatalogCards(jsonParse(p.drafted_leaders, []))
      const leadersPack = resolveCatalogCards(jsonParse(p.leaders, []))

      return {
        id: p.id,
        odId: p.user_id,
        username: p.username,
        avatarUrl: p.avatar_url,
        seatNumber: p.seat_number,
        pickStatus: p.pick_status,
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
      const { queryRows } = await import('@/lib/db')
      const rounds = await queryRows(
        `SELECT id, round_number, status FROM practice_rounds WHERE pod_id = $1 ORDER BY round_number`,
        [pod.id]
      )
      roundsWithMatches = []
      for (const round of rounds as Array<{ id: string; round_number: number; status: string }>) {
        const matches = await queryRows(
          `SELECT pm.id, pm.player1_id, pm.player2_id, pm.is_bye,
                  pm.game1_result, pm.game2_result, pm.game3_result,
                  pm.player1_submitted, pm.player2_submitted,
                  pm.final_confirmed, pm.match_winner, pm.pod_owner_override,
                  pm.wayfinder_match_id,
                  u1.username as p1_username, u1.avatar_url as p1_avatar,
                  u2.username as p2_username, u2.avatar_url as p2_avatar
           FROM practice_matches pm
           LEFT JOIN users u1 ON pm.player1_id = u1.id
           LEFT JOIN users u2 ON pm.player2_id = u2.id
           WHERE pm.round_id = $1 ORDER BY pm.created_at`,
          [round.id]
        )
        roundsWithMatches.push({
          roundNumber: round.round_number,
          status: round.status,
          matches: (matches as any[]).map(m => ({
            id: m.id,
            player1: m.player1_id ? { id: m.player1_id, username: m.p1_username, avatarUrl: m.p1_avatar } : null,
            player2: m.player2_id ? { id: m.player2_id, username: m.p2_username, avatarUrl: m.p2_avatar } : null,
            isBye: m.is_bye,
            game1Result: m.game1_result,
            game2Result: m.game2_result,
            game3Result: m.game3_result,
            player1Submitted: m.player1_submitted,
            player2Submitted: m.player2_submitted,
            finalConfirmed: m.final_confirmed,
            matchWinner: m.match_winner,
            podOwnerOverride: m.pod_owner_override,
            wayfinderMatchId: m.wayfinder_match_id || null,
          })),
        })
      }
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
      isHost: session ? pod.host_id === session.id : false,
      isPlayer: !!myPlayer,
      myPlayer: myPlayer ? {
        id: myPlayer.id,
        seatNumber: myPlayer.seat_number,
        pickStatus: myPlayer.pick_status,
        selectedCardId: myPlayer.selected_card_id || null,
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
      competitive: pod.competitive === true,
      deckBuildDeadline: pod.deck_lock_at || null,
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
      `SELECT id, host_id, share_id, set_code, set_name, name, max_players, current_players, pod_type, is_public
       FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can delete the draft', 403)
    }

    // BEFORE DELETING: Fix card_generation attribution for any cards from this draft
    // This ensures showcases are attributed to the correct user even after the draft is deleted
    const players = await queryRows(
      `SELECT pp.user_id, pp.is_bot, pp.drafted_leaders, pp.drafted_cards, u.username
       FROM pod_players pp
       JOIN users u ON pp.user_id = u.id
       WHERE pp.pod_id = $1 AND pp.user_id IS NOT NULL`,
      [pod.id]
    )

    // Build a map of card_id -> user_id for all drafted cards
    for (const player of players) {
      const cardIds: string[] = []

      try {
        const leaders = typeof player.drafted_leaders === 'string'
          ? JSON.parse(player.drafted_leaders)
          : player.drafted_leaders || []
        leaders.forEach((c: { id?: string }) => c.id && cardIds.push(c.id))
      } catch (e) { /* skip invalid JSON */ }

      try {
        const cards = typeof player.drafted_cards === 'string'
          ? JSON.parse(player.drafted_cards)
          : player.drafted_cards || []
        cards.forEach((c: { id?: string }) => c.id && cardIds.push(c.id))
      } catch (e) { /* skip invalid JSON */ }

      // Update card_generations for this player's drafted cards
      if (cardIds.length > 0) {
        await query(
          `UPDATE card_generations
           SET user_id = $1
           WHERE source_type = 'draft'
             AND source_share_id = $2
             AND card_id = ANY($3)
             AND user_id IS NULL`,
          [player.user_id, pod.share_id, cardIds]
        )
      }
    }

    // Notify web chat before deleting
    broadcastSystemChatMessage(shareId, `❌ **${session.username}** cancelled the draft.`)

    // Notify all connected clients that the draft is deleted
    broadcastDraftState(shareId).catch(() => {})

    // Discord LFG: handle Discord message (must run before pod deletion)
    // Auto-decide: delete message entirely if <2 humans (not a real multiplayer pod),
    // otherwise mark as cancelled with red ❌ for history
    const humanCount = players.filter((p: { is_bot: boolean }) => !p.is_bot).length
    const podInfo = { id: pod.id, share_id: pod.share_id, set_code: pod.set_code, set_name: pod.set_name, name: pod.name, max_players: pod.max_players, current_players: pod.current_players, pod_type: pod.pod_type || 'draft', competitive: pod.competitive === true }

    if (humanCount < 2) {
      // Not a real multiplayer pod — delete the Discord message entirely
      await deletePodMessage(podInfo).catch(() => {})
      await query(
        `UPDATE pods SET discord_message_id = NULL, discord_thread_id = NULL,
         discord_webhook_id = NULL, discord_webhook_token = NULL WHERE id = $1`,
        [pod.id]
      ).catch(() => {})
    } else {
      // Real multiplayer pod — mark the embed as cancelled for history
      const playerNames = players.map((p: { username: string }) => p.username)
      await markPodCancelled(podInfo, session.username, playerNames).catch(() => {})
    }

    // Delete associated card_pools (dependent destroy)
    // The generations are kept for history, but pools from this draft are cleaned up
    await query('DELETE FROM card_pools WHERE pod_id = $1', [pod.id])

    // Delete pod (cascade will remove players)
    await query('DELETE FROM pods WHERE id = $1', [pod.id])

    return jsonResponse({ message: 'Draft deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
