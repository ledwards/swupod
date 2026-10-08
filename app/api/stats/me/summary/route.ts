// @ts-nocheck
// GET /api/stats/me/summary - Authenticated user's activity totals for personal stats.
//
// Returns the five counters used by the Activity dashboard in the new
// "You" tab on /stats (plan U5):
//   - packsCracked: packs the user personally cracked
//                   (sealed: every pack in pools they own;
//                    draft:  packsPerPlayer per completed draft they joined)
//   - poolsOpened:  count of card_pools the user owns where pool_type
//                   IN ('sealed','draft'). Excludes imported and bot-generated.
//   - draftsJoined: count of completed pods the user joined as a human player.
//   - decksBuilt:   count of built_decks rows for pools the user owns.
//                   Filter is on built_decks.built_at (NOT created_at).
//   - decksPlayed:  count of deck_play_visits rows for the user.
//                   Filter is on first_visited_at so the date range counts
//                   "first time the deck reached play."
//
// Date filtering uses the half-open pattern from /api/stats/draft-picks:
//   col >= $since AND col < ($until::date + interval '1 day')
// so an "until" date includes events up to and including 23:59:59 on that day.
//
// Defaults: since=2020-01-01, until=2099-12-31 (lifetime). Invalid date input
// returns 400.
//
// Pattern follows app/api/me/* (NOT the public /api/stats/* pattern):
//   - applyRateLimit at entry (60 req/min/IP)
//   - requireAuth via session cookie / Bearer token
//   - Cache-Control: private, max-age=60  + Vary: Cookie
//
// The Vary: Cookie header is defense-in-depth: it prevents cross-user
// mis-caching if a future header regression accidentally drops `private`.
//
// Note on draft packs per player:
//   `pods` has no `packs_per_player` column. At draft start, the value is
//   derived from `pod.settings.chaosSets?.length || 3` (see
//   app/api/draft/[shareId]/start/route.ts). We mirror that here at query
//   time using COALESCE(jsonb_array_length(p.settings->'chaosSets'), 3).
//   Standard drafts return 3; chaos drafts return the right per-set count.

import { queryRow } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_SINCE = '2020-01-01'
const DEFAULT_UNTIL = '2099-12-31'

// YYYY-MM-DD, with light validation. We hand the value off to Postgres for
// `::date` parsing — we just want to reject obvious garbage early so the
// SQL doesn't blow up with a confusing error.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a date query parameter. Returns the trimmed string if it looks valid,
 * or null if the caller passed an empty value (use the default).
 * Throws on a non-empty value that doesn't match YYYY-MM-DD or that produces
 * NaN when parsed.
 */
export function parseDateParam(raw: string | null): string | null {
  if (raw == null || raw === '') return null
  const trimmed = raw.trim()
  if (!DATE_RE.test(trimmed)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.')
  }
  // Final guard: catches things like 2024-13-99 that match the regex.
  const ts = Date.parse(trimmed + 'T00:00:00Z')
  if (Number.isNaN(ts)) {
    throw new Error('Invalid date value.')
  }
  return trimmed
}

/**
 * Build the JSON body that the route returns. Extracted so unit tests can
 * verify the shape, integer coercion, and zero-counter behavior without
 * touching the database.
 */
export function buildSummaryResponse(
  sealedPacks: number,
  draftPacks: number,
  poolsOpened: number,
  draftsJoined: number,
  decksBuilt: number,
  decksPlayed: number
): {
  packsCracked: number
  poolsOpened: number
  draftsJoined: number
  decksBuilt: number
  decksPlayed: number
} {
  return {
    packsCracked: (sealedPacks | 0) + (draftPacks | 0),
    poolsOpened: poolsOpened | 0,
    draftsJoined: draftsJoined | 0,
    decksBuilt: decksBuilt | 0,
    decksPlayed: decksPlayed | 0,
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)

    let since: string
    let until: string
    try {
      since = parseDateParam(searchParams.get('since')) ?? DEFAULT_SINCE
      until = parseDateParam(searchParams.get('until')) ?? DEFAULT_UNTIL
    } catch (e) {
      return errorResponse(
        e instanceof Error ? e.message : 'Invalid date parameter',
        400
      ) as unknown as NextResponse
    }

    // All six counters are independent COUNTs on indexed columns. Fire them
    // concurrently (the pg pool allows up to 20 connections) so the route waits
    // on one round-trip instead of six in series.
    const [
      sealedRow,
      draftRow,
      poolsRow,
      draftsJoinedRow,
      decksBuiltRow,
      decksPlayedRow,
    ] = await Promise.all([
      // 1. packsCracked, sealed half.
      // Count distinct (source_id, pack_index) pairs in card_generations where
      // the source is a sealed pool the user owns. pack_index distinguishes
      // packs within a single sealed pool — this is the count of individual
      // packs the user opened across all sealed pools they created.
      queryRow(
        `SELECT COUNT(*) AS n
         FROM (
           SELECT DISTINCT cg.source_id, cg.pack_index
           FROM card_generations cg
           JOIN card_pools cp ON cp.id = cg.source_id
           WHERE cg.source_type = 'sealed'
             AND cp.user_id = $1
             AND cg.generated_at >= $2
             AND cg.generated_at < ($3::date + interval '1 day')
         ) sub`,
        [session.id, since, until]
      ),

      // 2. packsCracked, draft half.
      // For each completed draft the user joined as a human, count the
      // packsPerPlayer for that pod. See header comment for the JSONB lookup.
      // Filter on pod.created_at matches the plan's spec; alternatives like
      // started_at or completed_at would shift "joined a draft today" to
      // different timestamps and complicate the user mental model.
      queryRow(
        `SELECT COALESCE(SUM(COALESCE(jsonb_array_length(p.settings->'chaosSets'), 3)), 0) AS n
         FROM pod_players pp
         JOIN pods p ON p.id = pp.pod_id
         WHERE pp.user_id = $1
           AND pp.is_bot = false
           AND p.status = 'complete'
           AND p.created_at >= $2
           AND p.created_at < ($3::date + interval '1 day')`,
        [session.id, since, until]
      ),

      // 3. poolsOpened.
      // Pool types are constrained by migration 059 to:
      //   sealed | draft | pack_blitz | pack_wars | chaos_sealed | rotisserie | imported
      // The plan calls for sealed + draft only — imported pools are user
      // uploads of physical pulls and bot-generated pools don't count toward
      // "you opened this." A future tweak could widen this to chaos_sealed
      // and pack_blitz if user research shows they want them counted.
      queryRow(
        `SELECT COUNT(*) AS n
         FROM card_pools
         WHERE user_id = $1
           AND pool_type IN ('sealed', 'draft')
           AND created_at >= $2
           AND created_at < ($3::date + interval '1 day')`,
        [session.id, since, until]
      ),

      // 4. draftsJoined.
      // Distinct pods the user joined as a human player. Completed status
      // only — in-progress drafts don't count as "joined" for activity
      // totals. is_bot guard prevents an adversarial pod with a bot row
      // claiming the user's id from inflating the count.
      queryRow(
        `SELECT COUNT(DISTINCT pp.pod_id) AS n
         FROM pod_players pp
         JOIN pods p ON p.id = pp.pod_id
         WHERE pp.user_id = $1
           AND pp.is_bot = false
           AND p.status = 'complete'
           AND p.created_at >= $2
           AND p.created_at < ($3::date + interval '1 day')`,
        [session.id, since, until]
      ),

      // 5. decksBuilt.
      // Filter on built_decks.built_at — NOT created_at. Verified against
      // migrations/031_create_built_decks.sql, which has no created_at
      // column. Because built_decks has UNIQUE(card_pool_id), this is
      // really "pools with a built deck"; the UI label is "Decks built."
      queryRow(
        `SELECT COUNT(*) AS n
         FROM built_decks bd
         JOIN card_pools cp ON bd.card_pool_id = cp.id
         WHERE cp.user_id = $1
           AND bd.built_at >= $2
           AND bd.built_at < ($3::date + interval '1 day')`,
        [session.id, since, until]
      ),

      // 6. decksPlayed.
      // Filter on first_visited_at. last_visited_at would make the
      // counter "decks I came back to in this window" which is a different
      // (less interesting) signal for the activity dashboard. Per the
      // unique constraint, a single pool played many times counts as 1.
      queryRow(
        `SELECT COUNT(*) AS n
         FROM deck_play_visits
         WHERE user_id = $1
           AND first_visited_at >= $2
           AND first_visited_at < ($3::date + interval '1 day')`,
        [session.id, since, until]
      ),
    ])

    const sealedPacks = parseInt(sealedRow?.n || '0', 10)
    const draftPacks = parseInt(draftRow?.n || '0', 10)
    const poolsOpened = parseInt(poolsRow?.n || '0', 10)
    const draftsJoined = parseInt(draftsJoinedRow?.n || '0', 10)
    const decksBuilt = parseInt(decksBuiltRow?.n || '0', 10)
    const decksPlayed = parseInt(decksPlayedRow?.n || '0', 10)

    const response = jsonResponse(
      buildSummaryResponse(
        sealedPacks,
        draftPacks,
        poolsOpened,
        draftsJoined,
        decksBuilt,
        decksPlayed
      )
    )
    // Private-only cache. The `Vary: Cookie` is defense-in-depth against
    // an edge config regression that mishandles `private` — the cookie
    // varies per user, so two users can never share a cached entry.
    response.headers.set('Cache-Control', 'private, max-age=60')
    response.headers.set('Vary', 'Cookie')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}
