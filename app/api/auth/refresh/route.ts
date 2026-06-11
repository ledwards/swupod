// @ts-nocheck
// POST /api/auth/refresh - Refresh the current session
import { NextRequest, NextResponse } from 'next/server'
import { getSession, setSession } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { handleApiError } from '@/lib/utils'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = getSession(request)

    if (!session) {
      return NextResponse.json({
        success: false,
        data: null,
        message: 'No active session',
      }, { status: 401 })
    }

    // Get fresh user data from database (auth_version included so the
    // reissued token passes the privileged gates' freshness check)
    const user = await queryRow(
      `SELECT id, email, username, avatar_url, is_admin, is_beta_tester, auth_version
       FROM users WHERE id = $1`,
      [session.id]
    )

    if (!user) {
      return NextResponse.json({
        success: false,
        data: null,
        message: 'User not found',
      }, { status: 404 })
    }

    // Return updated session with new cookie
    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          avatar_url: user.avatar_url || null,
          is_admin: user.is_admin || false,
          is_beta_tester: user.is_beta_tester || false,
        },
      },
    })

    return setSession(response, user)
  } catch (error) {
    return handleApiError(error)
  }
}
