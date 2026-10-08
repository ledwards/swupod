// @ts-nocheck
// GET /api/test/live-swiss/state?podShareId=...  (development/test only)
//
// Read the live Swiss state for a seeded pod (rounds, matches, per-game live
// rows) so an external e2e harness can make deterministic assertions without
// scraping the PTP DOM. Same prod-safety guard as /api/test/create-user.
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { readLiveSwissPodState, liveSwissTestEndpointsEnabled } from '@/lib/testFixtures/liveSwiss'

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!liveSwissTestEndpointsEnabled()) {
    return errorResponse('Not available in production', 403)
  }

  try {
    const podShareId = request.nextUrl.searchParams.get('podShareId')
    if (!podShareId) {
      return errorResponse('podShareId is required', 400)
    }

    const state = await readLiveSwissPodState((text, params) => query(text, params), podShareId)
    if (!state) {
      return errorResponse('Pod not found', 404)
    }

    return jsonResponse(state)
  } catch (error) {
    console.error('Error reading live swiss state:', error)
    return errorResponse('Failed to read live swiss state', 500)
  }
}
