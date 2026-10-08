// @ts-nocheck
// GET /api/me/pools - List authenticated user's pools
import { queryRows, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, handleApiError, formatSetCodeRange } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)
    const poolType = searchParams.get('type')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let whereClause = 'WHERE user_id = $1'
    const params: (string | number)[] = [session.id]

    if (poolType) {
      params.push(poolType)
      whereClause += ` AND pool_type = $${params.length}`
    }

    const pools = await queryRows(
      `SELECT
        share_id,
        set_code,
        set_name,
        pool_type,
        name,
        created_at,
        deck_builder_state,
        CASE
          WHEN jsonb_typeof(cards) = 'array' THEN jsonb_array_length(cards)
          ELSE 0
        END as card_count
       FROM card_pools
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    const countResult = await queryRow(
      `SELECT COUNT(*) as total FROM card_pools ${whereClause}`,
      params
    )
    const total = parseInt(countResult.total, 10)

    return jsonResponse({
      pools: pools.map(pool => {
        let poolNameFromState = null
        let leaderName = null
        let baseName = null
        let mainDeckCount = 0
        let isInfinitePool = false
        let sessionId = null
        if (pool.deck_builder_state) {
          try {
            const state = typeof pool.deck_builder_state === 'string'
              ? JSON.parse(pool.deck_builder_state)
              : pool.deck_builder_state
            if (state.poolName) poolNameFromState = state.poolName
            isInfinitePool = state.isInfinitePool === true
            sessionId = state.sessionId || null
            if (state.activeLeader && state.cardPositions) {
              const leaderCard = state.cardPositions[state.activeLeader]?.card
              if (leaderCard) leaderName = leaderCard.name || leaderCard.title
            }
            if (state.activeBase && state.cardPositions) {
              const baseCard = state.cardPositions[state.activeBase]?.card
              if (baseCard) baseName = baseCard.name || baseCard.title
            }
            if (state.cardPositions) {
              mainDeckCount = Object.values(state.cardPositions).filter((pos) =>
                pos.section === 'deck' && pos.enabled !== false && !pos.card?.isLeader && !pos.card?.isBase
              ).length
            }
          } catch (e) {
            // skip parse errors
          }
        }

        let name = poolNameFromState || pool.name
        if (!name) {
          const pType = pool.pool_type || 'sealed'
          const formatType = isInfinitePool ? 'Limited' : pType === 'draft' ? 'Draft' :
            pType === 'rotisserie' ? 'Rotisserie Draft' : 'Sealed'
          const setCode = pool.set_code || ''
          const setCodes = setCode.includes(',') ? setCode.split(',').map((s) => s.trim()) : [setCode]
          const setCodeDisplay = formatSetCodeRange(setCodes)
          const createdAt = pool.created_at ? new Date(pool.created_at) : new Date()
          const month = String(createdAt.getMonth() + 1).padStart(2, '0')
          const day = String(createdAt.getDate()).padStart(2, '0')
          const year = createdAt.getFullYear()
          name = `${setCodeDisplay} ${formatType} ${month}/${day}/${year}`
        }

        return {
          shareId: pool.share_id,
          setCode: pool.set_code,
          setName: pool.set_name || null,
          poolType: pool.pool_type || 'sealed',
          name,
          cardCount: parseInt(pool.card_count, 10),
          isInfinitePool,
          sessionId,
          leaderName,
          baseName,
          mainDeckCount,
          createdAt: pool.created_at,
        }
      }),
      total,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
