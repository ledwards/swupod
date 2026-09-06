// app/api/plugin/v1/match/result/retract/route.ts
// POST /api/plugin/v1/match/result/retract
// Server-to-server: Wayfinder calls this to WITHDRAW a match result it should
// never have sent.
// Auth: Authorization: Bearer <PTP_SERVICE_KEY>
//
// ## Why this exists
//
// `POST /api/plugin/v1/match/result` is one-way. Wayfinder forwards a game to a
// pool when it believes the game was Limited, and a requeue race in the
// Companion made some PREMIER games report themselves as Limited (fixed
// 2026-09-04; wayfinder docs/plans/2026-09-04-001). Those games were counted
// against sealed pools they were never played in, and fixing Wayfinder does not
// take them back out. This is the reverse gear.
//
// Note the irony worth remembering: `result` accepts a `format` precisely so
// PTP can reject a non-Limited game. The corruption is what defeated that
// guard — it arrived saying "limited".
//
// ## What it reverses, and what it refuses
//
// The non-competitive path increments `card_pools.wins/losses/draws`, appends
// the canonical id to `card_pools.wayfinder_match_ids`, and writes a
// `casual_matches` row. This reverses exactly those three, reading the recorded
// `casual_matches.result` rather than trusting the caller to say which counter
// to decrement — the caller already got this game wrong once.
//
// A COMPETITIVE pod is REFUSED, loudly, with a named reason. Reversing a Swiss
// result can move standings and a round that has already advanced; that is an
// operator decision, not something to automate from a sweep. Refusing is not
// silence: the response says which pool and why.
import { query, queryRow } from '@/lib/db'
import { requireServiceKey } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { canonicalMatchId } from '../route'

// Returns Response, not NextResponse: every exit goes through jsonResponse/
// errorResponse/handleApiError in lib/utils, which build a plain Response.
export async function POST(request: NextRequest): Promise<Response> {
  try {
    requireServiceKey(request)

    const body = (await request.json()) as {
      poolShareId?: unknown
      matchId?: unknown
      reason?: unknown
    }
    const { poolShareId, matchId, reason } = body

    if (typeof poolShareId !== 'string' || !poolShareId || typeof matchId !== 'string' || !matchId) {
      return errorResponse('poolShareId and matchId are required', 400)
    }
    if (!reason || typeof reason !== 'string') {
      // A retraction with no stated reason is an unexplained deletion. The
      // reason is stored on the row and is the whole audit trail.
      return errorResponse('reason is required', 400)
    }

    // Same normalization as the write path, or a result forwarded under
    // `ing-<id>` could never be withdrawn by a caller holding the bare id.
    const canonicalId = canonicalMatchId(matchId)

    const pool = await queryRow(
      `SELECT cp.id, cp.share_id, cp.user_id, p.competitive
       FROM card_pools cp
       LEFT JOIN pods p ON cp.pod_id = p.id
       WHERE cp.share_id = $1`,
      [poolShareId]
    )
    if (!pool) {
      return errorResponse('Pool not found', 404)
    }

    if (pool.competitive) {
      return errorResponse(
        `Refusing to retract from a competitive pod (pool ${poolShareId}): ` +
        `a Swiss result can move standings and advance a round. Handle this one manually.`,
        409
      )
    }

    const recorded = await queryRow(
      `SELECT id, result FROM casual_matches
       WHERE card_pool_id = $1 AND wayfinder_match_id = $2 AND retracted_at IS NULL`,
      [pool.id, canonicalId]
    )

    // Idempotent: retracting something already retracted, or never recorded, is
    // a success with `retracted: 0`. A sweep re-running must not error, and a
    // caller must be able to tell "nothing to do" from "done" — hence the count
    // rather than a bare ok.
    if (!recorded) {
      return jsonResponse({ ok: true, retracted: 0, reason: 'no live result recorded for this pool + match' })
    }

    // Reverse the counter the ORIGINAL write incremented, read from the stored
    // row. Guarded at zero: a pool whose counters were reset or hand-edited must
    // not be driven negative by a correction.
    const winDelta = recorded.result === 'win' ? 1 : 0
    const lossDelta = recorded.result === 'loss' ? 1 : 0
    const drawDelta = recorded.result === 'draw' ? 1 : 0

    await query(
      `UPDATE card_pools
       SET wins = GREATEST(0, wins - $1),
           losses = GREATEST(0, losses - $2),
           draws = GREATEST(0, draws - $3),
           wayfinder_match_ids = array_remove(COALESCE(wayfinder_match_ids, '{}'), $4),
           updated_at = NOW()
       WHERE share_id = $5`,
      [winDelta, lossDelta, drawDelta, canonicalId, poolShareId]
    )

    // SOFT delete. The row is the evidence that the forward happened; erasing it
    // would leave the retraction unauditable and unreversible.
    await query(
      `UPDATE casual_matches
       SET retracted_at = NOW(), retracted_reason = $1
       WHERE id = $2`,
      [reason, recorded.id]
    )

    console.log(
      `[wayfinder-retract] pool=${poolShareId} match=${canonicalId} was=${recorded.result} reason=${reason}`
    )

    return jsonResponse({ ok: true, retracted: 1, was: recorded.result })
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Service key not configured')) {
      return errorResponse('Unauthorized', 401)
    }
    return handleApiError(error)
  }
}
