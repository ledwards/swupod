// @ts-nocheck
// GET /api/me/drafts - List authenticated user's drafts
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
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let whereExtra = ''
    const params: (string | number)[] = [session.id]

    if (status) {
      params.push(status)
      whereExtra += ` AND dp.status = $${params.length}`
    }

    const pods = await queryRows(
      `SELECT
        dp.share_id,
        dp.set_code,
        dp.set_name,
        dp.status,
        dp.current_players,
        dp.max_players,
        dp.host_id,
        dp.created_at,
        dp.completed_at,
        cp.share_id as pool_share_id,
        cp.name as pool_name,
        cp.deck_builder_state
       FROM pods dp
       JOIN pod_players dpp ON dp.id = dpp.pod_id
       LEFT JOIN card_pools cp ON cp.pod_id = dp.id AND cp.user_id = $1
       WHERE dpp.user_id = $1
         AND (dpp.is_bot = false OR dpp.is_bot IS NULL)
         ${whereExtra}
       ORDER BY dp.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )

    return jsonResponse({
      drafts: pods.map(pod => {
        let poolNameFromState = null
        let leaderName = null
        let baseName = null
        let mainDeckCount = 0
        if (pod.deck_builder_state) {
          try {
            const state = typeof pod.deck_builder_state === 'string'
              ? JSON.parse(pod.deck_builder_state)
              : pod.deck_builder_state
            if (state.poolName) poolNameFromState = state.poolName
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

        return {
          shareId: pod.share_id,
          setCode: pod.set_code,
          setName: pod.set_name,
          status: pod.status,
          playerCount: pod.max_players,
          isHost: pod.host_id === session.id,
          poolShareId: pod.pool_share_id || null,
          name: poolNameFromState || pod.pool_name || null,
          leaderName,
          baseName,
          mainDeckCount,
          createdAt: pod.created_at,
          completedAt: pod.completed_at,
        }
      }),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
