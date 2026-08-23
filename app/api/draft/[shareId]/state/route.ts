// @ts-nocheck
// GET /api/draft/:shareId/state - Poll for state updates
import { queryRow, queryRows } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { checkAndEnforceTimeout } from '@/src/utils/draftTimeout'
import { processBotTurns } from '@/src/utils/botLogic'
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

    // Get sinceVersion from query params
    const url = new URL(request.url)
    const sinceVersion = parseInt(url.searchParams.get('sinceVersion') || '0', 10)

    // Get draft pod
    let pod = await queryRow(
      `SELECT
        dp.id,
        dp.share_id,
        dp.status,
        dp.current_players,
        dp.timer_enabled,
        dp.timer_seconds,
        dp.pick_timeout_seconds,
        dp.timed,
        dp.state_version,
        dp.draft_state,
        dp.started_at,
        dp.completed_at,
        dp.pick_started_at,
        dp.paused,
        dp.paused_at,
        dp.paused_duration_seconds
       FROM pods dp
       WHERE dp.share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Check and enforce timeouts (server-side timeout enforcement)
    const timeoutEnforced = await checkAndEnforceTimeout(pod.id)

    // Also trigger bot processing on every poll as a safety mechanism
    // This ensures bots pick even if the select route's call to processBotTurns failed
    if (pod.status === 'active') {
      processBotTurns(pod.id).catch(err => {
        // Ignore errors - this is a best-effort safety mechanism
        console.error('[STATE] Error in bot processing during poll:', err.message)
      })
    }

    if (timeoutEnforced) {
      // Re-fetch pod since state changed
      pod = await queryRow(
        `SELECT
          dp.id,
          dp.share_id,
          dp.status,
          dp.current_players,
          dp.timer_enabled,
          dp.timer_seconds,
          dp.pick_timeout_seconds,
          dp.timed,
          dp.state_version,
          dp.draft_state,
          dp.started_at,
          dp.completed_at,
          dp.pick_started_at,
          dp.paused,
          dp.paused_at,
          dp.paused_duration_seconds
         FROM pods dp
         WHERE dp.share_id = $1`,
        [shareId]
      )
    }

    // If state hasn't changed, return minimal response
    if (pod.state_version <= sinceVersion) {
      return jsonResponse({
        changed: false,
        stateVersion: pod.state_version,
        serverNow: new Date().toISOString(),
      })
    }

    // Get all players
    const players = await queryRows(
      `SELECT
        dpp.*,
        u.username,
        u.avatar_url
       FROM pod_players dpp
       JOIN users u ON dpp.user_id = u.id
       WHERE dpp.pod_id = $1
       ORDER BY dpp.seat_number`,
      [pod.id]
    )

    // Parse draft state
    const draftState = jsonParse(pod.draft_state, {})

    // Check if we're in leader preview/draft phase (show leader packs to all)
    const isLeaderDraftPhase = draftState?.phase === 'leader_draft' || draftState?.phase === 'leader_preview'

    // Format players
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
        selectionConfirmed: p.selection_confirmed === true,
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

    // Get current user's data if logged in
    let myPlayer = null
    if (session) {
      const player = players.find(p => p.user_id === session.id)
      if (player) {
        myPlayer = {
          id: player.id,
          seatNumber: player.seat_number,
          pickStatus: player.pick_status,
          selectedCardId: player.selected_card_id || null,
          selectionConfirmed: player.selection_confirmed === true,
          currentPack: resolveCatalogCards(jsonParse(player.current_pack)),
          draftedCards: resolveCatalogCards(jsonParse(player.drafted_cards, [])),
          leaders: resolveCatalogCards(jsonParse(player.leaders, [])),
          draftedLeaders: resolveCatalogCards(jsonParse(player.drafted_leaders, [])),
        }
      }
    }

    const response = jsonResponse({
      changed: true,
      stateVersion: pod.state_version,
      status: pod.status,
      draftState,
      players: formattedPlayers,
      myPlayer,
      timed: pod.timed === true,
      timerEnabled: pod.timer_enabled,
      timerSeconds: pod.timer_seconds,
      pickTimeoutSeconds: pod.pick_timeout_seconds || 60,
      startedAt: pod.started_at,
      completedAt: pod.completed_at,
      pickStartedAt: pod.pick_started_at,
      paused: pod.paused === true,
      pausedAt: pod.paused_at,
      pausedDurationSeconds: pod.paused_duration_seconds || 0,
      serverNow: new Date().toISOString(),
    })

    // Add cache headers to reduce bandwidth usage
    response.headers.set('Cache-Control', 'private, max-age=3, must-revalidate')

    return response
  } catch (error) {
    return handleApiError(error)
  }
}
