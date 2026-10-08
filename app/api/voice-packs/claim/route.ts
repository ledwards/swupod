// POST /api/voice-packs/claim — redeem a creator code, unlocking that voice pack on
// the caller's account forever.
//
// EVERY code names a voice_packs row — Leebo's included. He is the first creator
// pack (by Protect the Pod, seeded by migration 086, code LEEBO), not a special case,
// so there is exactly one lookup and one grant path here.
//
// Shape follows app/api/promo/claim/route.ts exactly: rate limit → requireAuth →
// validate → idempotent `INSERT ... ON CONFLICT DO NOTHING RETURNING id`, so
// re-entering a code you already own is a harmless no-op and the response still
// distinguishes the two (`granted` vs `alreadyOwned`). Grants are permanent — there
// is no revoke path, only ON DELETE CASCADE on the user.
//
// Brute force: codes are short and human-typed, so the shared 60/min/IP limiter is
// too generous on its own. A second, tighter per-IP brake below caps *claim attempts*
// at 10/min. Both a malformed code and an unknown code return the same 404 with the
// same message, so the endpoint never confirms that a code exists.
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { queryRow, queryRows } from '@/lib/db'
import { jsonResponse, errorResponse, parseBody, handleApiError } from '@/lib/utils'
import { applyRateLimit, getClientIp } from '@/lib/rateLimit'
import {
  normalizeVoicePackCode,
  isValidVoicePackCode,
  voicePackLogoUrl,
  voicePackAssetUrl,
  type VoicePackClipType,
} from '@/src/services/voicePacks'

/** Claim-specific brake: 10 attempts per IP per minute (in-memory, per process). */
const CLAIM_WINDOW_MS = 60 * 1000
const CLAIM_MAX_ATTEMPTS = 10
const claimAttempts = new Map<string, { count: number; resetAt: number }>()

const claimCleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of claimAttempts) {
    if (now > entry.resetAt) claimAttempts.delete(key)
  }
}, 5 * 60 * 1000)
if (typeof claimCleanup?.unref === 'function') claimCleanup.unref()

function tooManyClaimAttempts(request: NextRequest): boolean {
  const ip = getClientIp(request)
  const now = Date.now()
  let entry = claimAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + CLAIM_WINDOW_MS }
    claimAttempts.set(ip, entry)
  }
  entry.count++
  return entry.count > CLAIM_MAX_ATTEMPTS
}

/** One message for every "that code did not work" outcome — never confirms existence. */
const UNKNOWN_CODE = 'That code is not valid.'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const session = requireAuth(request)

    if (tooManyClaimAttempts(request)) {
      return errorResponse('Too many code attempts. Try again in a minute.', 429)
    }

    let body: { code?: unknown }
    try {
      body = await parseBody(request)
    } catch {
      return errorResponse('Invalid request body', 400)
    }

    const code = normalizeVoicePackCode(body.code)
    if (!isValidVoicePackCode(code)) return errorResponse(UNKNOWN_CODE, 404)

    const pack = await queryRow(
      `SELECT id, code, display_name, creator_name
         FROM voice_packs
        WHERE code = $1 AND status = 'active'`,
      [code]
    )
    if (!pack) return errorResponse(UNKNOWN_CODE, 404)

    // Idempotent grant. RETURNING distinguishes a fresh unlock from a re-redeem.
    const inserted = await queryRow(
      `INSERT INTO voice_pack_entitlements (user_id, pack_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, pack_id) DO NOTHING
       RETURNING id`,
      [session.id, pack['id']]
    )
    const granted = inserted !== null

    const clipRows = await queryRows(
      'SELECT clip_type FROM voice_pack_assets WHERE pack_id = $1',
      [pack['id']]
    )
    const clips = clipRows.map((r) => r['clip_type'] as VoicePackClipType)
    const packId = pack['id'] as string

    return jsonResponse({
      granted,
      alreadyOwned: !granted,
      pack: {
        id: packId,
        code: pack['code'],
        displayName: pack['display_name'],
        creatorName: pack['creator_name'],
        logoUrl: voicePackLogoUrl(packId),
        clips,
        // The confirmation plays this when the logo is clicked.
        greetingUrl: clips.includes('greeting') ? voicePackAssetUrl(packId, 'greeting') : null,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
