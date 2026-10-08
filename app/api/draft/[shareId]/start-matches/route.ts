// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { createRound1 } from '@/src/services/matchmaking/advancement'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const session = requireAuth(request)
    const { shareId } = await params

    const pod = await queryRow(
      `SELECT id, host_id, competitive FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return jsonResponse({ error: 'Pod not found' }, 404)
    }

    if (pod.host_id !== session.id) {
      return jsonResponse({ error: 'Only the pod owner can start matches' }, 403)
    }

    if (!pod.competitive) {
      return jsonResponse({ error: 'Pod is not in competitive mode' }, 400)
    }

    // Check if round 1 already exists
    const existingRound = await queryRow(
      `SELECT id FROM practice_rounds WHERE pod_id = $1 AND round_number = 1`,
      [pod.id]
    )

    if (existingRound) {
      return jsonResponse({ error: 'Round 1 already exists' }, 400)
    }

    await createRound1(pod.id, shareId)

    return jsonResponse({ ok: true })
  } catch (error) {
    return handleApiError(error)
  }
}
