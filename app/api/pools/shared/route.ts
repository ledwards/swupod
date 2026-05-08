// @ts-nocheck
// GET /api/pools/shared — list pools the current user has visited but does not own.
//
// Joins pool_views for the current user against card_pools, excludes pools the
// user owns (own pools live in their normal recents), excludes hidden pools.
// Returns most recently viewed first.
import { queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = requireAuth(request)
    const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '50', 10), 200)

    const rows = await queryRows(
      `SELECT
         cp.share_id,
         cp.name,
         cp.set_code,
         cp.pool_type,
         cp.parent_pool_id,
         cp.created_at,
         pv.viewed_at,
         u.username AS owner_username
       FROM pool_views pv
       JOIN card_pools cp ON cp.id = pv.pool_id
       LEFT JOIN users u ON u.id = cp.user_id
       WHERE pv.user_id = $1
         AND (cp.user_id IS NULL OR cp.user_id <> $1)
         AND cp.hidden IS NOT TRUE
       ORDER BY pv.viewed_at DESC
       LIMIT $2`,
      [session.id, limit]
    )

    return jsonResponse({
      pools: rows.map(r => ({
        shareId: r.share_id,
        name: r.name,
        setCode: r.set_code,
        poolType: r.pool_type,
        parentShareId: null, // omitted: we'd need a join; not used by Shared tab list
        ownerUsername: r.owner_username,
        viewedAt: r.viewed_at,
        createdAt: r.created_at,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
