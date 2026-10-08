// @ts-nocheck
// POST /api/pools/:shareId/view — record that the current user visited this pool.
// Skips silently when:
//   - the request is unauthenticated (no row written, no error)
//   - the pool doesn't exist
//   - the current user is the pool owner (don't record self-views)
//
// On revisit, viewed_at is bumped via UPSERT.
import { queryRow, query } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params

    const session = getSession(request)
    if (!session) return jsonResponse({ recorded: false, reason: 'unauthenticated' })

    const pool = await queryRow(
      'SELECT id, user_id FROM card_pools WHERE share_id = $1',
      [shareId]
    )
    if (!pool) return jsonResponse({ recorded: false, reason: 'not_found' }, 404)

    if (pool.user_id === session.id) {
      return jsonResponse({ recorded: false, reason: 'owner' })
    }

    await query(
      `INSERT INTO pool_views (user_id, pool_id, viewed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, pool_id) DO UPDATE SET viewed_at = EXCLUDED.viewed_at`,
      [session.id, pool.id]
    )

    return jsonResponse({ recorded: true })
  } catch (error) {
    return handleApiError(error)
  }
}
