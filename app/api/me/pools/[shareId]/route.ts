// @ts-nocheck
// GET /api/me/pools/:shareId - Get full pool detail for authenticated user
import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { shareId } = await params

    const pool = await queryRow(
      `SELECT share_id, set_code, set_name, pool_type, name, cards, deck_builder_state, created_at
       FROM card_pools
       WHERE share_id = $1 AND user_id = $2`,
      [shareId, session.id]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    const cards = pool.cards || []

    // Parse deck from deck_builder_state
    let deck = null
    if (pool.deck_builder_state) {
      try {
        const state = typeof pool.deck_builder_state === 'string'
          ? JSON.parse(pool.deck_builder_state)
          : pool.deck_builder_state

        let leader = null
        let base = null
        const mainDeck = []
        const sideboard = []

        if (state.cardPositions) {
          for (const [cardId, pos] of Object.entries(state.cardPositions)) {
            const card = pos.card
            if (!card) continue

            if (state.activeLeader === cardId) {
              leader = { cardId: card.cardId, name: card.name || card.title, aspects: card.aspects }
            } else if (state.activeBase === cardId) {
              base = { cardId: card.cardId, name: card.name || card.title, aspects: card.aspects }
            } else if (pos.section === 'deck' && pos.enabled !== false) {
              mainDeck.push({ cardId: card.cardId, name: card.name || card.title, rarity: card.rarity, type: card.type })
            } else {
              sideboard.push({ cardId: card.cardId, name: card.name || card.title, rarity: card.rarity, type: card.type })
            }
          }
        }

        deck = { leader, base, mainDeck, sideboard }
      } catch (e) {
        // skip parse errors
      }
    }

    return jsonResponse({
      shareId: pool.share_id,
      setCode: pool.set_code,
      setName: pool.set_name || null,
      poolType: pool.pool_type || 'sealed',
      name: pool.name || null,
      cards: Array.isArray(cards) ? cards.map(c => ({
        cardId: c.cardId,
        name: c.name || c.title,
        rarity: c.rarity,
        type: c.type,
        aspects: c.aspects,
        variantType: c.variantType,
      })) : [],
      deck,
      createdAt: pool.created_at,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
