// @ts-nocheck
// POST /api/admin/grant - Admin-only grant of is_patron or is_beta_tester to
// an existing user (by discord_id) or pre-provision a new users row with the
// chosen flag already set.
//
// 404 stealth: non-admin and unauthenticated callers receive a 404 (not 403)
// so the existence of this endpoint is uniformly invisible to non-admins.
// Per the plan, we inline the admin gate using getSession rather than the
// shared admin-required helper — that helper throws Error('Admin access
// required') which handleApiError maps to 403, which would break the
// 404-stealth requirement.
//
// Flag allowlist mechanic: `flag` arrives in the POST body and gets
// interpolated into the SQL string. We (1) typeof-check, (2) re-extract the
// matched value from the const allowlist, and (3) interpolate the
// re-extracted value. This neutralizes object-with-toString, array, and
// case-twist injection vectors. NEVER interpolate the raw input.
//
// SELECT-then-UPSERT: a SELECT id FROM users WHERE discord_id = $1 runs
// before the upsert so `preProvisioned` is correct under concurrent inserts
// (the xmax = 0 RETURNING trick can lie under OAuth-callback races).
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { query, queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'

/**
 * Pinned log prefix for admin grant audit lines. The route test imports this
 * constant and asserts on its value, so renaming or drifting the prefix
 * breaks the test rather than silently changing log-grep behavior in Railway.
 */
export const LOG_PREFIX_ADMIN_GRANT = 'admin-grant'

/**
 * Allowlist of column names the route is permitted to interpolate into SQL.
 * Per R7: granting one flag never sets the other. Adding a column here means
 * "this column may be set TRUE by this endpoint" — do not add lightly.
 */
const ALLOWED_FLAGS = ['is_patron', 'is_beta_tester'] as const

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Admin gate FIRST, before any input validation. Unauth/non-admin → 404.
  const session = getSession(request)
  if (!session?.is_admin) {
    return errorResponse('Not found', 404)
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { flag, discordId, username } = body ?? {}

    // Flag allowlist mechanic — step 1: typeof guard.
    // Rejects boxed strings (String('is_patron')), arrays, objects with
    // a custom toString, null, undefined, and numbers.
    if (typeof flag !== 'string') {
      return errorResponse('Invalid flag', 400)
    }

    // Flag allowlist mechanic — step 2: re-extract the matched value from
    // ALLOWED_FLAGS. We use `safeFlag` (the constant's value) in the SQL
    // string below, NOT the raw `flag` input. This neutralizes case-twist
    // and any other value that happens to === a permitted string.
    const safeFlag = ALLOWED_FLAGS.find(f => f === flag)
    if (!safeFlag) {
      return errorResponse('Invalid flag', 400)
    }

    // discordId validation: Discord snowflakes are 17–19 digits; the regex
    // allows 17–25 to leave room for future growth and to keep junk rows
    // (giant strings, empty, non-digit) out of the users table.
    if (typeof discordId !== 'string' || !/^\d{17,25}$/.test(discordId)) {
      return errorResponse('Invalid discordId', 400)
    }

    // SELECT-then-UPSERT: precheck so `preProvisioned` reflects whether the
    // row existed before this request, even under concurrent inserts.
    const existing = await queryRow(
      'SELECT id FROM users WHERE discord_id = $1',
      [discordId]
    )
    const preProvisioned = !existing

    // Idempotent upsert. Mirrors app/api/draft/[shareId]/dev/add-bots/route.ts.
    // The ${safeFlag} interpolation is safe because safeFlag is the value
    // re-extracted from ALLOWED_FLAGS, not the raw input.
    await query(
      `INSERT INTO users (discord_id, username, ${safeFlag}) VALUES ($1, $2, TRUE)
       ON CONFLICT (discord_id) DO UPDATE SET ${safeFlag} = TRUE`,
      [discordId, username ?? discordId]
    )

    // Read back the canonical row for the response. Includes both flags so
    // the UI can show the user's complete entitlement state.
    const user = await queryRow(
      'SELECT id, discord_id, username, email, is_patron, is_beta_tester FROM users WHERE discord_id = $1',
      [discordId]
    )

    // Structured audit log. The prefix is pinned in LOG_PREFIX_ADMIN_GRANT so
    // Railway log grep on `admin-grant` stays stable across refactors.
    console.log(LOG_PREFIX_ADMIN_GRANT, {
      adminId: session.id,
      flag: safeFlag,
      targetDiscordId: discordId,
      targetUserId: user?.id,
      preProvisioned,
    })

    return jsonResponse({ user, preProvisioned })
  } catch (error) {
    return handleApiError(error)
  }
}
