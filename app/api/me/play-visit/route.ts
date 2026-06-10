// @ts-nocheck
// POST /api/me/play-visit — Record that the authenticated user reached a deck
// play page for a given pool. UPSERTs into deck_play_visits keyed on
// (user_id, pool_id) so revisits bump last_visited_at without creating
// duplicates and first_visited_at stays untouched after the first hit.
//
// IDOR guard: the shareId is resolved to a pool_id server-side, and the
// resolved pool must be owned by the authenticated user (matches the same
// gating the play page itself uses). If a logged-in user supplies someone
// else's shareId we return 403 — never 404, so a legitimate "pool not found"
// is distinguishable from "you don't have access."
//
// CSRF posture: relies on the SameSite=Lax session cookie from lib/auth.ts.
// The Authorization: Bearer fallback in lib/auth.ts is for server-to-server
// callers and isn't expected for browser-initiated POSTs to this endpoint.
//
// Callers fire-and-forget. Errors are swallowed by the client — the row
// landing is the signal that matters, not the HTTP response.
import { query, queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, parseBody, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)

    let body
    try {
      body = await parseBody(request)
    } catch {
      return errorResponse('Invalid request body', 400)
    }

    const shareId = body && typeof body.shareId === 'string' ? body.shareId.trim() : null
    if (!shareId) {
      return errorResponse('Missing or invalid shareId', 400)
    }

    // Resolve shareId → (pool_id, owner). Mirrors the gating used by
    // /app/api/pools/[shareId] write paths: look up by share_id, then check
    // ownership. Anonymous (user_id IS NULL) pools cannot be tracked — we
    // need a known owner relationship to attribute the play.
    const pool = await queryRow(
      'SELECT id, user_id FROM card_pools WHERE share_id = $1',
      [shareId]
    )

    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    if (pool.user_id !== session.id) {
      return errorResponse('Unauthorized', 403)
    }

    // UPSERT: first hit inserts (first_visited_at = last_visited_at = NOW()),
    // subsequent hits only bump last_visited_at. first_visited_at stays
    // exactly as written on the first row so the activity counter can window
    // by the first time the user reached play.
    await query(
      `INSERT INTO deck_play_visits (user_id, pool_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, pool_id)
       DO UPDATE SET last_visited_at = NOW()`,
      [session.id, pool.id]
    )

    return jsonResponse({ recorded: true }) as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
