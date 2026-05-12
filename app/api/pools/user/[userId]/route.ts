// @ts-nocheck
// GET /api/pools/user/:userId - Get all pools for a user
import { queryRows, queryRow } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, handleApiError, formatSetCodeRange } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { userId } = await params
    const session = getSession(request)

    // All pools are public - allow viewing any user's pools
    // No authorization check needed

    // Parse query parameters - use high limit to get all pools
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '1000', 10) // High limit to get all pools
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Get pools - also include set_name and pool_type if they exist
    let pools
    try {
      pools = await queryRows(
        `SELECT
          id,
          share_id,
          set_code,
          set_name,
          pool_type,
          name,
          hidden,
          created_at,
          updated_at,
          is_public,
          deck_builder_state,
          parent_pool_id,
          CASE
            WHEN jsonb_typeof(cards) = 'array' THEN jsonb_array_length(cards)
            ELSE 0
          END as card_count
         FROM card_pools
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      )
    } catch (error) {
      console.error('Error fetching pools:', error)
      // Fallback if name, set_name, pool_type, or parent_pool_id columns don't exist
      if (error.message.includes('name') || error.message.includes('set_name') || error.message.includes('pool_type') || error.message.includes('parent_pool_id')) {
        try {
          pools = await queryRows(
            `SELECT
              id,
              share_id,
              set_code,
              set_name,
              pool_type,
              created_at,
              updated_at,
              is_public,
              CASE
                WHEN jsonb_typeof(cards) = 'array' THEN jsonb_array_length(cards)
                ELSE 0
              END as card_count
             FROM card_pools
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
          )
          // Add default values
          pools = pools.map(pool => ({
            ...pool,
            name: null,
            set_name: pool.set_name || null,
            pool_type: pool.pool_type || 'sealed'
          }))
        } catch (innerError) {
          // If set_name or pool_type columns don't exist either
          if (innerError.message.includes('set_name') || innerError.message.includes('pool_type')) {
            pools = await queryRows(
              `SELECT
                id,
                share_id,
                set_code,
                created_at,
                updated_at,
                is_public,
                CASE
                  WHEN jsonb_typeof(cards) = 'array' THEN jsonb_array_length(cards)
                  ELSE 0
                END as card_count
               FROM card_pools
               WHERE user_id = $1
               ORDER BY created_at DESC
               LIMIT $2 OFFSET $3`,
              [userId, limit, offset]
            )
            // Add default values
            pools = pools.map(pool => ({
              ...pool,
              name: null,
              set_name: null,
              pool_type: 'sealed'
            }))
          } else {
            throw innerError
          }
        }
      } else {
        throw error
      }
    }

    // Get total count
    const countResult = await queryRow(
      'SELECT COUNT(*) as total FROM card_pools WHERE user_id = $1',
      [userId]
    )
    const total = parseInt(countResult.total, 10)

    return jsonResponse({
      pools: pools.map((pool) => {
        // Extract data from deck_builder_state
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
            // Pool name from state is the source of truth
            if (state.poolName) {
              poolNameFromState = state.poolName
            }
            isInfinitePool = state.isInfinitePool === true
            sessionId = state.sessionId || null
            // activeLeader/activeBase are cardId strings, actual card data is in cardPositions
            if (state.activeLeader && state.cardPositions) {
              const leaderCard = state.cardPositions[state.activeLeader]?.card
              if (leaderCard) {
                leaderName = leaderCard.name || leaderCard.title
              }
            }
            if (state.activeBase && state.cardPositions) {
              const baseCard = state.cardPositions[state.activeBase]?.card
              if (baseCard) {
                baseName = baseCard.name || baseCard.title
              }
            }
            // Count cards in main deck (section === 'deck' and enabled !== false)
            if (state.cardPositions) {
              mainDeckCount = Object.values(state.cardPositions).filter((pos: any) =>
                pos.section === 'deck' && pos.enabled !== false && !pos.card?.isLeader && !pos.card?.isBase
              ).length
            }
          } catch (e) {
            console.error('Failed to parse deck_builder_state:', e)
          }
        }

        // Generate name: prefer deckBuilderState.poolName, then pool.name column, then generate default
        let name = poolNameFromState || pool.name
        if (!name) {
          const poolType = pool.pool_type || 'sealed'
          const formatType = isInfinitePool ? 'Limited' : poolType === 'draft' ? 'Draft' :
            poolType === 'rotisserie' ? 'Rotisserie Draft' : 'Sealed'
          const setCode = pool.set_code || ''
          const setCodes = setCode.includes(',') ? setCode.split(',').map((s: string) => s.trim()) : [setCode]
          const setCodeDisplay = formatSetCodeRange(setCodes)
          const createdAt = pool.created_at ? new Date(pool.created_at) : new Date()
          const month = String(createdAt.getMonth() + 1).padStart(2, '0')
          const day = String(createdAt.getDate()).padStart(2, '0')
          const year = createdAt.getFullYear()
          name = `${setCodeDisplay} ${formatType} ${month}/${day}/${year}`
        }

        return {
          id: pool.id,
          shareId: pool.share_id,
          setCode: pool.set_code,
          setName: pool.set_name || null,
          poolType: pool.pool_type || 'sealed',
          name: name,
          hidden: pool.hidden === true,
          isInfinitePool,
          sessionId,
          createdAt: pool.created_at,
          updatedAt: pool.updated_at,
          parentPoolId: pool.parent_pool_id || null,
          isPublic: pool.is_public,
          cardCount: parseInt(pool.card_count, 10),
          leaderName,
          baseName,
          mainDeckCount,
        }
      }),
      total,
      limit,
      offset,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
