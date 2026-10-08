// @ts-nocheck
// POST /api/draft/:shareId/randomize-packs - Shuffle the booster box packs (host only)
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { jsonParse } from '@/src/utils/json'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { NextRequest, NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    // Get draft pod
    const pod = await queryRow(
      'SELECT id, host_id, status, box_packs FROM pods WHERE share_id = $1',
      [shareId]
    )

    if (!pod) {
      return errorResponse('Draft not found', 404)
    }

    // Verify host
    if (pod.host_id !== session.id) {
      return errorResponse('Only the host can randomize packs', 403)
    }

    // Can only randomize during lobby
    if (pod.status !== 'waiting') {
      return errorResponse('Cannot randomize packs after draft has started', 400)
    }

    // Check if box_packs exists
    const boxPacks = jsonParse(pod.box_packs)
    if (!boxPacks || !Array.isArray(boxPacks) || boxPacks.length === 0) {
      return errorResponse('This draft does not have a booster box to randomize', 400)
    }

    // Shuffle the box
    const shuffledPacks = shuffleArray(boxPacks)

    // Update the database
    await query(
      `UPDATE pods
       SET box_packs = $1,
           shuffled_packs = true,
           state_version = state_version + 1
       WHERE id = $2`,
      [JSON.stringify(shuffledPacks), pod.id]
    )

    // Broadcast state update to all connected clients
    broadcastDraftState(shareId).catch(err => {
      console.error('Error broadcasting draft state:', err)
    })

    return jsonResponse({
      message: 'Packs shuffled',
      shuffledPacks: true
    })
  } catch (error) {
    return handleApiError(error)
  }
}
