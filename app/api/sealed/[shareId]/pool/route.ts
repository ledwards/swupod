// @ts-nocheck
// GET /api/sealed/:shareId/pool - Get user's pool for this sealed pod
import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    const pod = await queryRow(
      `SELECT id FROM pods WHERE share_id = $1 AND pod_type = 'sealed'`,
      [shareId]
    )

    if (!pod) {
      return errorResponse('Sealed pod not found', 404)
    }

    const pool = await queryRow(
      `SELECT share_id FROM card_pools WHERE pod_id = $1 AND user_id = $2`,
      [pod.id, session.id]
    )

    if (!pool) {
      return errorResponse('No pool found for this user', 404)
    }

    return jsonResponse({ poolShareId: pool.share_id })
  } catch (error) {
    return handleApiError(error)
  }
}
