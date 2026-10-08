// @ts-nocheck
/**
 * POST /api/draft/:shareId/build-bot-decks
 *
 * Triggers bot deck building for a completed draft.
 * Only the host can trigger this. Useful for drafts that completed
 * before the automatic bot deck building was added.
 */
import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { buildBotDecks } from '@/src/utils/botDeckBuilder'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    const pod = await queryRow(
      'SELECT * FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can trigger bot deck building', 403)
    }

    if (pod.status !== 'complete') {
      return errorResponse('Draft is not complete', 400)
    }

    const settings = typeof pod.settings === 'string' ? JSON.parse(pod.settings) : pod.settings || {}

    await buildBotDecks(pod.id, pod.set_code, settings)

    return jsonResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
