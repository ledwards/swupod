// @ts-nocheck
// POST /api/test/create-user - Create a test user (development/test only)
// This endpoint creates real users in the database for E2E testing
import { query, queryRow } from '@/lib/db'
import { createToken } from '@/lib/auth'
import { jsonResponse, errorResponse } from '@/lib/utils'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Only allow in development/test environments
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_USERS) {
    return errorResponse('Not available in production', 403)
  }

  try {
    // Access flags, so a spec can sit a real alpha tester, beta tester or admin at the server's own gate.
    const { username, testId, is_alpha_tester = false, is_beta_tester = false, is_admin = false } = await request.json()

    if (!username || !testId) {
      return errorResponse('username and testId are required', 400)
    }

    // Create a unique identifier for this test user
    const uniqueId = `test_${testId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Check if user already exists (by discord_id which we use for test users)
    let user = await queryRow(
      'SELECT * FROM users WHERE discord_id = $1',
      [uniqueId]
    )

    if (!user) {
      // Create new test user
      user = await queryRow(
        `INSERT INTO users (discord_id, username, email, avatar_url, is_alpha_tester, is_beta_tester, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [uniqueId, username, `${uniqueId}@test.local`, null, is_alpha_tester === true, is_beta_tester === true, is_admin === true]
      )
    }

    // Create JWT token
    const token = createToken(user)

    return jsonResponse({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      token,
      cookieName: 'swupod_session',
    })
  } catch (error) {
    console.error('Error creating test user:', error)
    return errorResponse('Failed to create test user', 500)
  }
}
