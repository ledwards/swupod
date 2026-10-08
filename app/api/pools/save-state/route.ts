// @ts-nocheck
// POST /api/pools/save-state - Save deck builder state (used by sendBeacon on page unload)
import { queryRow, query } from '@/lib/db'
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

    // Note: We don't check ownership here because:
    // 1. sendBeacon doesn't send cookies/auth headers reliably
    // 2. The shareId itself is the access token for anonymous pools
    // 3. This is a best-effort save during page unload

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
