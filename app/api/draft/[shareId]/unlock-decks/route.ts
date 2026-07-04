// @ts-nocheck
// POST /api/draft/:shareId/unlock-decks - Pod owner toggles the Swiss Practice
// deck lock for the whole pod. When decks_unlocked = true, every player can edit
// their primary competitive deck again; flipping it back re-locks all decks.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { query, queryRow } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
): Promise<NextResponse> {
  try {
    const session = requireAuth(request)
    const { shareId } = await params

    const pod = await queryRow(
      `SELECT id, host_id, competitive, decks_unlocked FROM pods WHERE share_id = $1`,
      [shareId]
    )

    if (!pod) {
      return jsonResponse({ error: 'Pod not found' }, 404)
    }

    if (pod.host_id !== session.id) {
      return jsonResponse({ error: 'Only the pod owner can unlock decks' }, 403)
    }

    if (!pod.competitive) {
      return jsonResponse({ error: 'Pod is not in competitive mode' }, 400)
    }

    // Accept an explicit boolean, otherwise toggle the current value.
    const body = await request.json().catch(() => ({}))
    const nextUnlocked = typeof body.unlocked === 'boolean'
      ? body.unlocked
      : !pod.decks_unlocked

    await query(
      `UPDATE pods SET decks_unlocked = $1, updated_at = NOW() WHERE id = $2`,
      [nextUnlocked, pod.id]
    )

    // Push the new lock state to every connected player in the pod.
    broadcastDraftState(shareId).catch(() => {})

    return jsonResponse({ ok: true, decksUnlocked: nextUnlocked })
  } catch (error) {
    return handleApiError(error)
  }
}
