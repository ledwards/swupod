// @ts-nocheck
// GET /api/formats/history - Get user's format history
import { queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

// Format pool types
const FORMAT_POOL_TYPES = ['chaos_sealed', 'pack_wars', 'pack_blitz', 'chaos_draft', 'rotisserie']

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuth(request)
    const userId = session.id

    // Fetch recent format pools for this user
    const pools = await queryRows(
      `SELECT id, share_id, set_code, set_name, pool_type, name, created_at, deck_builder_state, hidden
       FROM card_pools
       WHERE user_id = $1 AND pool_type = ANY($2)
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId, FORMAT_POOL_TYPES]
    )

    // Format the response
    const formattedPools = pools.map(pool => {
      const deckBuilderState = pool.deck_builder_state || {}
      return {
        id: pool.id,
        shareId: pool.share_id,
        setCode: pool.set_code,
        setName: pool.set_name,
        poolType: pool.pool_type,
        name: pool.name || deckBuilderState.poolName,
        leaderName: deckBuilderState.leaderCard?.name || null,
        baseName: deckBuilderState.baseCard?.name || null,
        mainDeckCount: deckBuilderState.deck?.length || 0,
        createdAt: pool.created_at,
        hidden: pool.hidden || false
      }
    })

    return jsonResponse({ pools: formattedPools })
  } catch (error) {
    return handleApiError(error)
  }
}
