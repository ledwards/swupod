// GET /api/auth/token - Get Bearer token for API usage
// Requires cookie session (must be logged in via browser)
import { getSession, createToken } from '@/lib/auth'
import { jsonResponse, handleApiError } from '@/lib/utils'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = getSession(request)
    if (!session) {
      return jsonResponse(null, 401, 'Authentication required. Log in at protectthepod.com first.')
    }

    const token = createToken({
      id: session.id,
      email: session.email,
      username: session.username,
      avatar_url: session.avatar_url ?? null,
      is_admin: session.is_admin,
      is_beta_tester: session.is_beta_tester,
      // Carry the privilege-freshness claim forward (U4) — never upgrade it
      ...(typeof session.auth_version === 'number' ? { auth_version: session.auth_version } : {}),
    })

    return jsonResponse({
      token,
      expiresIn: '30d',
      usage: 'Include as Authorization: Bearer <token> header in API requests',
    })
  } catch (error) {
    return handleApiError(error)
  }
}
