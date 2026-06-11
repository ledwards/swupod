// GET /api/auth/session - Get current session
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

interface SessionUser {
  id: string
  email: string
  username: string
  avatar_url: string | null
  is_admin: boolean
  is_beta_tester: boolean
}

interface SessionResponse {
  success: boolean
  data: { user: SessionUser } | null
  message?: string
}

export async function GET(request: NextRequest): Promise<NextResponse<SessionResponse>> {
  try {
    const session = getSession(request)

    if (!session) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No active session',
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: session.id,
          email: session.email,
          username: session.username,
          avatar_url: session.avatar_url || null,
          is_admin: session.is_admin || false,
          is_beta_tester: session.is_beta_tester || false,
        },
      },
    })
  } catch (error) {
    console.error('Session endpoint error:', error)
    return NextResponse.json({
      success: false,
      data: null,
      message: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}
