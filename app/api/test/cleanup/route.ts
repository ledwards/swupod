// @ts-nocheck
// POST /api/test/cleanup - Clean up test users and drafts (development/test only)
import { query } from '@/lib/db'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Only allow in development/test environments
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_USERS) {
    return errorResponse('Not available in production', 403)
  }

  try {
    const { testId } = await request.json()

    if (!testId) {
      return errorResponse('testId is required', 400)
    }

    const pattern = `test_${testId}_%`

    // Delete draft pod players for test users
    await query(
      `DELETE FROM pod_players
       WHERE user_id IN (SELECT id FROM users WHERE discord_id LIKE $1)`,
      [pattern]
    )

    // Delete draft pods created by test users
    await query(
      `DELETE FROM pods
       WHERE host_id IN (SELECT id FROM users WHERE discord_id LIKE $1)`,
      [pattern]
    )

    // Delete card pools for test users
    await query(
      `DELETE FROM card_pools
       WHERE user_id IN (SELECT id FROM users WHERE discord_id LIKE $1)`,
      [pattern]
    )

    // Delete test users
    const result = await query(
      'DELETE FROM users WHERE discord_id LIKE $1 RETURNING id',
      [pattern]
    )

    return jsonResponse({
      deletedUsers: result.rowCount,
    })
  } catch (error) {
    console.error('Error cleaning up test data:', error)
    return errorResponse('Failed to cleanup test data', 500)
  }
}
