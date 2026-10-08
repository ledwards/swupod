// @ts-nocheck
// GET /api/me/decks - List authenticated user's built decks
import { queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Get pools that have deck_builder_state with an activeLeader (i.e., user built a deck)
    const pools = await queryRows(
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
       ORDER BY cp.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [session.id, limit, offset]
    )

    const decks = []
    for (const pool of pools) {
      if (!pool.deck_builder_state) continue
      try {
        const state = typeof pool.deck_builder_state === 'string'
          ? JSON.parse(pool.deck_builder_state)
          : pool.deck_builder_state

        if (!state.activeLeader || !state.cardPositions) continue

        let leader = null
        let base = null
        const deck = []
        const sideboard = []

        for (const [cardId, pos] of Object.entries(state.cardPositions)) {
          const card = pos.card
          if (!card) continue

          if (state.activeLeader === cardId) {
            leader = { cardId: card.cardId, name: card.name || card.title, aspects: card.aspects }
          } else if (state.activeBase === cardId) {
            base = { cardId: card.cardId, name: card.name || card.title, aspects: card.aspects }
          } else if (pos.section === 'deck' && pos.enabled !== false) {
            deck.push({ cardId: card.cardId, name: card.name || card.title, rarity: card.rarity, type: card.type })
          } else {
            sideboard.push({ cardId: card.cardId, name: card.name || card.title, rarity: card.rarity, type: card.type })
          }
        }

        decks.push({
          poolShareId: pool.pool_share_id,
          setCode: pool.set_code,
          setName: pool.set_name || null,
          poolType: pool.pool_type || 'sealed',
          leader,
          base,
          deck,
          sideboard,
          builtAt: pool.updated_at,
        })
      } catch (e) {
        // skip unparseable entries
      }
    }

    return jsonResponse({ decks })
  } catch (error) {
    return handleApiError(error)
  }
}
