// @ts-nocheck
// POST /api/test/live-swiss/seed  (development/test only)
//
// Stand up a deterministic 4-player live Swiss Practice pod and return session
// tokens + pod/pool/match ids so an EXTERNAL e2e harness (the Wayfinder plugin
// repo) can drive a running PTP instance end to end. Same prod-safety guard as
// /api/test/create-user — never enabled in real production.
//
// See docs/WAYFINDER_PLUGIN_LIVE_SWISS_E2E.md for the cross-repo contract.
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { createToken } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { seedLiveSwissPod, liveSwissTestEndpointsEnabled } from '@/lib/testFixtures/liveSwiss'

const PLAYER_USERNAMES = ['LiveA', 'LiveB', 'LiveC', 'LiveD']

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!liveSwissTestEndpointsEnabled()) {
    return errorResponse('Not available in production', 403)
  }

  try {
    const body = await request.json().catch(() => ({}))
    const testId =
      typeof body.testId === 'string' && body.testId.trim()
        ? body.testId.trim()
        : `live_swiss_${Date.now()}`
    const setCode =
      typeof body.setCode === 'string' && body.setCode.trim() ? body.setCode.trim() : 'SOR'

    // Create the four players as beta-tester users (competitive play requires it).
    const created = []
    for (const username of PLAYER_USERNAMES) {
      const discordId = `test_${testId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const result = await query(
        `INSERT INTO users (discord_id, username, email, avatar_url, is_beta_tester, is_admin)
         VALUES ($1, $2, $3, $4, true, false)
         RETURNING *`,
        [discordId, username, `${discordId}@test.local`, null]
      )
      const user = result.rows[0]
      created.push({ user, token: createToken(user) })
    }

    const seeded = await seedLiveSwissPod((text, params) => query(text, params), {
      userIds: created.map(entry => entry.user.id),
      setCode,
    })

    const players = created.map((entry, index) => ({
      userId: entry.user.id,
      username: entry.user.username,
      poolShareId: seeded.poolShareIds[index],
      token: entry.token,
      cookieName: 'swupod_session',
    }))

    return jsonResponse({
      testId,
      podId: seeded.podId,
      podShareId: seeded.podShareId,
      roundId: seeded.roundId,
      players,
      matches: seeded.matches,
    })
  } catch (error) {
    console.error('Error seeding live swiss pod:', error)
    return errorResponse('Failed to seed live swiss pod', 500)
  }
}
