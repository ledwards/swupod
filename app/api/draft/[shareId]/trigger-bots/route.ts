// @ts-nocheck
// POST /api/draft/:shareId/trigger-bots - Force bots to make their picks
import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { processBotTurns } from '@/src/utils/botLogic'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Get draft pod
    const pod = await queryRow(
      'SELECT * FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Only host can trigger bots
    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can trigger bot picks', 403)
    }

    if (pod.status !== 'active') {
      return errorResponse('Draft is not active', 400)
    }

    // Trigger bot picks
    await processBotTurns(pod.id)

    return jsonResponse({ success: true, message: 'Bot picks triggered' })
  } catch (error) {
    return handleApiError(error)
  }
}
