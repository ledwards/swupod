// @ts-nocheck
// POST /api/test/live-swiss/cleanup  (development/test only)
//
// Tear down a seeded live Swiss pod and (optionally) its test users. Accepts
// any of { podId, podShareId, testId }. Same prod-safety guard as
// /api/test/create-user.
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { cleanupLiveSwissPod, liveSwissTestEndpointsEnabled } from '@/lib/testFixtures/liveSwiss'

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!liveSwissTestEndpointsEnabled()) {
    return errorResponse('Not available in production', 403)
  }

  try {
    const body = await request.json().catch(() => ({}))
    const podShareId = typeof body.podShareId === 'string' ? body.podShareId : null
    const testId = typeof body.testId === 'string' ? body.testId : null
    let podId = typeof body.podId === 'string' ? body.podId : null

    if (!podId && !podShareId && !testId) {
      return errorResponse('podId, podShareId, or testId is required', 400)
    }

    if (!podId && podShareId) {
      const row = await query('SELECT id FROM pods WHERE share_id = $1', [podShareId])
      podId = row.rows[0]?.id || null
    }

    if (podId) {
      await cleanupLiveSwissPod((text, params) => query(text, params), { podId })
    }

    // Remove the seeded test users (and any stray pods they still host). One
    // testId maps to one pod here, so the pod cleanup above already cleared the
    // rows that reference these users.
    let deletedUsers = 0
    if (testId) {
      const pattern = `test_${testId}_%`
      await query(
        'DELETE FROM card_pools WHERE user_id IN (SELECT id FROM users WHERE discord_id LIKE $1)',
        [pattern]
      )
      await query(
        'DELETE FROM pod_players WHERE user_id IN (SELECT id FROM users WHERE discord_id LIKE $1)',
        [pattern]
      )
      await query(
        'DELETE FROM pods WHERE host_id IN (SELECT id FROM users WHERE discord_id LIKE $1)',
        [pattern]
      )
      const deleted = await query('DELETE FROM users WHERE discord_id LIKE $1 RETURNING id', [pattern])
      deletedUsers = deleted.rowCount || 0
    }

    return jsonResponse({ ok: true, podId, deletedUsers })
  } catch (error) {
    console.error('Error cleaning up live swiss pod:', error)
    return errorResponse('Failed to clean up live swiss pod', 500)
  }
}
