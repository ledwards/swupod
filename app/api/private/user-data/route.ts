// @ts-nocheck
// GET /api/private/user-data - Fetch all data for a user by discord_id
//
// Private server-to-server endpoint for SWUTeam integration.
// Authenticated via PTP_SERVICE_KEY (not user session).
//
// Returns the user's pools, built decks, and draft picks in a single call.
// Only returns data for the specific discord_id requested — no bulk access.
//
// Query params:
//   discord_id (required) - Discord user ID to look up
//
// Auth:
//   Authorization: Bearer <PTP_SERVICE_KEY>
//
// Example:
//   curl -H "Authorization: Bearer $PTP_SERVICE_KEY" \
//     "https://www.protectthepod.com/api/private/user-data?discord_id=123456789"

import { queryRow, queryRows } from '@/lib/db'
import { requireServiceKey } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    requireServiceKey(request)

    const { searchParams } = new URL(request.url)
    const discordId = searchParams.get('discord_id')

    if (!discordId) {
      return errorResponse('discord_id query parameter is required', 400) as unknown as NextResponse
    }

    // Look up PTP user by discord_id
    const user = await queryRow(
      `SELECT id, username, discord_id, avatar_url, created_at
       FROM users
       WHERE discord_id = $1`,
      [discordId]
    )

    if (!user) {
      return jsonResponse({ user: null, pools: [], builtDecks: [], draftPicks: [] }) as unknown as NextResponse
    }

    const userId = user.id

    // Fetch all pools (sealed + draft card pools)
    const poolRows = await queryRows(
      `SELECT
        cp.id as pool_id,
        cp.share_id,
        cp.set_code,
        cp.set_name,
        cp.pool_type,
        cp.name,
        cp.cards,
        cp.created_at,
        p.share_id as pod_share_id,
        p.status as pod_status,
        p.current_players as pod_player_count,
        p.set_code as pod_set_code,
        p.name as pod_name
       FROM card_pools cp
       LEFT JOIN pods p ON p.id = cp.pod_id
       WHERE cp.user_id = $1
       ORDER BY cp.created_at DESC`,
      [userId]
    )

    const pools = poolRows.map(row => {
      let cards = []
      if (row.cards) {
        try {
          cards = typeof row.cards === 'string' ? JSON.parse(row.cards) : row.cards
          if (!Array.isArray(cards)) cards = []
        } catch { cards = [] }
      }

      return {
        poolId: row.pool_id,
        shareId: row.share_id,
        setCode: row.set_code,
        setName: row.set_name || null,
        poolType: row.pool_type || 'sealed',
        name: row.name || null,
        cards,
        cardCount: cards.length,
        createdAt: row.created_at,
        pod: row.pod_share_id ? {
          shareId: row.pod_share_id,
          status: row.pod_status,
          playerCount: row.pod_player_count,
          setCode: row.pod_set_code,
          name: row.pod_name || null,
        } : null,
      }
    })

    // Fetch built decks from deck_builder_state in card_pools
    const deckRows = await queryRows(
      `SELECT
        cp.share_id as pool_share_id,
        cp.set_code,
        cp.set_name,
        cp.pool_type,
        cp.deck_builder_state,
        cp.updated_at
       FROM card_pools cp
       WHERE cp.user_id = $1
         AND cp.deck_builder_state IS NOT NULL
         AND cp.deck_builder_state::text != 'null'
       ORDER BY cp.updated_at DESC`,
      [userId]
    )

    const builtDecks = []
    for (const row of deckRows) {
      if (!row.deck_builder_state) continue
      try {
        const state = typeof row.deck_builder_state === 'string'
          ? JSON.parse(row.deck_builder_state)
          : row.deck_builder_state

        if (!state.activeLeader || !state.cardPositions) continue

        let leader = null
        let base = null
        const deck = []
        const sideboard = []

        for (const [cardId, pos] of Object.entries(state.cardPositions)) {
          const card = pos.card
          if (!card) continue

          const cardInfo = {
            cardId: card.cardId,
            name: card.name || card.title,
            rarity: card.rarity || null,
            type: card.type || null,
            aspects: card.aspects || [],
            cost: card.cost ?? null,
          }

          if (state.activeLeader === cardId) {
            leader = cardInfo
          } else if (state.activeBase === cardId) {
            base = cardInfo
          } else if (pos.section === 'deck' && pos.enabled !== false) {
            deck.push(cardInfo)
          } else {
            sideboard.push(cardInfo)
          }
        }

        builtDecks.push({
          poolShareId: row.pool_share_id,
          setCode: row.set_code,
          setName: row.set_name || null,
          poolType: row.pool_type || 'sealed',
          leader,
          base,
          deck,
          sideboard,
          deckSize: deck.length,
          builtAt: row.updated_at,
        })
      } catch {
        // skip unparseable entries
      }
    }

    // Fetch draft picks across all drafts
    const pickRows = await queryRows(
      `SELECT
        dp.card_id,
        dp.card_name,
        dp.set_code,
        dp.rarity,
        dp.card_type,
        dp.variant_type,
        dp.is_leader,
        dp.pack_number,
        dp.pick_in_pack,
        dp.pick_number,
        dp.leader_round,
        dp.picked_at,
        p.share_id as pod_share_id,
        p.set_code as pod_set_code,
        p.completed_at as pod_completed_at
       FROM draft_picks dp
       JOIN pods p ON p.id = dp.pod_id
       WHERE dp.user_id = $1
       ORDER BY dp.picked_at DESC, dp.pick_number ASC`,
      [userId]
    )

    const draftPicks = pickRows.map(row => ({
      podShareId: row.pod_share_id,
      podSetCode: row.pod_set_code,
      podCompletedAt: row.pod_completed_at,
      cardId: row.card_id,
      cardName: row.card_name,
      setCode: row.set_code,
      rarity: row.rarity,
      cardType: row.card_type,
      variantType: row.variant_type || 'Normal',
      isLeader: row.is_leader || false,
      packNumber: row.pack_number,
      pickInPack: row.pick_in_pack,
      pickNumber: row.pick_number,
      leaderRound: row.leader_round,
      pickedAt: row.picked_at,
    }))

    return jsonResponse({
      user: {
        id: user.id,
        username: user.username,
        discordId: user.discord_id,
        avatarUrl: user.avatar_url || null,
        createdAt: user.created_at,
      },
      pools,
      builtDecks,
      draftPicks,
    }) as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
