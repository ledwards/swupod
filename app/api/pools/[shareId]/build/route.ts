// @ts-nocheck
/**
 * POST /api/pools/:shareId/build - Record a built deck
 *
 * Upserts into built_decks when a user clicks Play with a valid deck.
 * Reads deck data from deck_builder_state (server-side source of truth).
 * No auth required (anonymous pools exist), but includes user_id if available.
 */
import { queryRow, query } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { buildDeckFromState, DeckBuilderState } from '@/lib/deckBuilder'
import { jsonParse } from '@/src/utils/json'
import { getSession } from '@/lib/auth'
import { broadcastPodState, broadcastDraftState } from '@/src/lib/socketBroadcast'
import { captureLimitedServerEvent } from '@/lib/posthog'
import { hashAnalyticsId, LimitedAnalyticsEvents } from '@/src/analytics/limitedEvents'
import { NextRequest } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { shareId } = await params

    // Load pool
    const pool = await queryRow(
      `SELECT id, set_code, pool_type, user_id, deck_builder_state, pod_id
       FROM card_pools
       WHERE share_id = $1`,
      [shareId]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    const state: DeckBuilderState = jsonParse(pool.deck_builder_state, {})

    // Must have a leader and base selected
    if (!state.activeLeader && !state.activeBase) {
      return errorResponse('No deck has been built for this pool yet', 400)
    }

    const setCode = pool.set_code || ''
    const deckData = buildDeckFromState(state, setCode)

    if (!deckData.leader && !deckData.base) {
      return errorResponse('No valid deck found', 400)
    }

    // Get user_id from session if logged in, otherwise from pool owner
    const session = getSession(request)
    const userId = session?.userId || pool.user_id || null

    const pod = pool.pod_id
      ? await queryRow(
        `SELECT share_id, settings, competitive FROM pods WHERE id = $1`,
        [pool.pod_id]
      )
      : null
    const podSettings = jsonParse(pod?.settings, {})

    // Upsert into built_decks
    await query(
      `INSERT INTO built_decks (card_pool_id, user_id, set_code, pool_type, leader, base, deck, sideboard)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (card_pool_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         leader = EXCLUDED.leader,
         base = EXCLUDED.base,
         deck = EXCLUDED.deck,
         sideboard = EXCLUDED.sideboard,
         built_at = NOW()`,
      [
        pool.id,
        userId,
        setCode,
        pool.pool_type || null,
        JSON.stringify(deckData.leader),
        JSON.stringify(deckData.base),
        JSON.stringify(deckData.deck),
        JSON.stringify(deckData.sideboard),
      ]
    )

    captureLimitedServerEvent(
      LimitedAnalyticsEvents.LIMITED_DECK_BUILT,
      userId || hashAnalyticsId(shareId),
      {
        format: pool.pool_type === 'draft' ? 'draft' : 'sealed',
        mode: pool.pod_id ? (podSettings?.isSolo === true ? 'solo' : 'group') : 'solo',
        setCode,
        deck_size: deckData.deck?.reduce((sum: number, c: { count: number }) => sum + c.count, 0) || 0,
        sideboard_size: deckData.sideboard?.reduce((sum: number, c: { count: number }) => sum + c.count, 0) || 0,
        has_leader: !!deckData.leader,
        has_base: !!deckData.base,
        poolShareId: shareId,
        podShareId: pod?.share_id || null,
      }
    )

    // If this pool belongs to a draft or sealed pod, broadcast readiness update to pod page
    if (pod?.share_id) {
      broadcastPodState(pod.share_id).catch(() => {})
      // Competitive (Swiss Practice) pods render the roster from the draft `state`
      // event, not `pod-state` — so push a draft broadcast too. Otherwise a player
      // who just hit Play stays "Building…" in everyone else's roster until reload.
      if (pod.competitive === true) {
        broadcastDraftState(pod.share_id).catch(() => {})
      }
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
