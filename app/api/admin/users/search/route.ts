// @ts-nocheck
// GET /api/admin/users/search?q=<query> - Admin-only user search for the
// /admin grant page's type-ahead autocomplete.
//
// 404 stealth: non-admin and unauthenticated callers receive a 404 (not 403)
// so the existence of this endpoint is uniformly invisible to non-admins.
// Per the plan, we inline the admin gate using getSession rather than calling
// requireAdmin — requireAdmin throws Error('Admin access required') which
// handleApiError maps to 403, which would break the 404-stealth requirement.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Admin gate FIRST, before any input validation. Unauth/non-admin → 404.
  const session = getSession(request)
  if (!session?.is_admin) {
    return errorResponse('Not found', 404)
  }

  try {
    const url = new URL(request.url)
    const rawQ = url.searchParams.get('q') ?? ''
    const q = rawQ.trim()

    // Short-circuit: empty or sub-2-char query returns empty array without
    // hitting the DB. Avoids dumping the whole users table on a single keystroke.
    if (q.length < 2) {
      return jsonResponse({ users: [] })
    }

    // All-digit query (up to 25 chars) → exact discord_id lookup.
    // Discord snowflakes are 17–19 digits; 25 matches U2's discordId regex cap
    // so an admin can search for a snowflake they're about to pre-provision.
    const isAllDigit = /^\d{1,25}$/.test(q)

    let result: Record<string, unknown>[]
    if (isAllDigit) {
      result = await queryRows(
        `SELECT id, discord_id, username, is_patron, is_beta_tester
         FROM users
         WHERE discord_id = $1
         LIMIT 10`,
        [q]
      )
    } else {
      // Case-insensitive prefix match on username.
      result = await queryRows(
        `SELECT id, discord_id, username, is_patron, is_beta_tester
         FROM users
         WHERE LOWER(username) LIKE LOWER($1) || '%'
         ORDER BY username
         LIMIT 10`,
        [q]
      )
    }

    return jsonResponse({ users: result })
  } catch (error) {
    return handleApiError(error)
  }
}
