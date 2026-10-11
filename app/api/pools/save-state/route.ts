// @ts-nocheck
// POST /api/pools/save-state - Save deck builder state (used by sendBeacon on page unload)
import { queryRow, query } from '@/lib/db'
import { requireDraftSession } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // sendBeacon sends data as text/plain, so we need to handle that
    const text = await request.text()
    const body = JSON.parse(text)

    const { shareId, deckBuilderState } = body

    if (!shareId || !deckBuilderState) {
      return errorResponse('Missing shareId or deckBuilderState', 400)
    }

    // Check pool exists - only select needed columns
    const pool = await queryRow(
      'SELECT id, user_id FROM card_pools WHERE share_id = $1',
      [shareId]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    // Same rule as PUT /api/pools/:shareId. sendBeacon is same-origin, so it
    // carries the session (or guest) cookie.
    // - Anonymous pools (user_id is null): the shareId is the access token
    // - Owned pools: only the owner, signed in or as the guest who drafted it
    if (pool.user_id !== null) {
      const session = requireDraftSession(request)
      if (pool.user_id !== session.id) {
        return errorResponse('Unauthorized', 403)
      }
    }

    // Update the deck_builder_state
    await query(
      `UPDATE card_pools
       SET deck_builder_state = $1, updated_at = NOW()
       WHERE share_id = $2`,
      [JSON.stringify(deckBuilderState), shareId]
    )

    return jsonResponse({ success: true })
  } catch (error) {
    return handleApiError(error)
  }
}
