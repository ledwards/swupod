// app/api/plugin/v1/match/result/route.ts
// @ts-nocheck
// POST /api/plugin/v1/match/result
// Server-to-server: Wayfinder calls this to record a match result on a PTP pool.
// Auth: Authorization: Bearer <PTP_SERVICE_KEY>
import { query, queryRow } from '@/lib/db'
import { requireServiceKey } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    requireServiceKey(request)

    const body = await request.json()
    const { poolShareId, result, matchId } = body

    if (!poolShareId || !result || !matchId) {
      return errorResponse('poolShareId, result, and matchId are required', 400)
    }
    if (!['win', 'loss', 'draw'].includes(result)) {
      return errorResponse('result must be win, loss, or draw', 400)
    }

    const pool = await queryRow(
      'SELECT id FROM card_pools WHERE share_id = $1',
      [poolShareId]
    )
    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    const winDelta = result === 'win' ? 1 : 0
    const lossDelta = result === 'loss' ? 1 : 0
    const drawDelta = result === 'draw' ? 1 : 0

    await query(
      `UPDATE card_pools
       SET wins = wins + $1,
           losses = losses + $2,
           draws = draws + $3,
           wayfinder_match_ids = array_append(wayfinder_match_ids, $4),
           updated_at = NOW()
       WHERE share_id = $5`,
      [winDelta, lossDelta, drawDelta, matchId, poolShareId]
    )

    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Service key not configured')) {
      return errorResponse('Unauthorized', 401)
    }
    return handleApiError(error)
  }
}
