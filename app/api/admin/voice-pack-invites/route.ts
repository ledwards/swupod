// POST /api/admin/voice-pack-invites — mint a single-use creator link.
//
// The creator page at /creator/voice-pack/<token> is not linked from anywhere and
// has no other entry point, so this endpoint is the ONLY way a voice pack gets
// authored. The token is 32 chars of base64url from crypto.randomBytes (192 bits) —
// not enumerable.
//
// 404 stealth, exactly as app/api/admin/grant/route.ts does it: unauthenticated and
// non-admin callers get 404, never 403, so the endpoint's existence is invisible.
// The admin gate reads the session claim AND re-checks users.is_admin in the
// database, so a stale token minted before a demotion cannot mint links.
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { getSession } from '@/lib/auth'
import { queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import {
  clampInviteExpiryDays,
  normalizeVoicePackName,
  voicePackInvitePath,
} from '@/src/services/voicePacks'

/** Pinned log prefix so Railway log grep on `voice-pack-invite` stays stable. */
export const LOG_PREFIX_VOICE_PACK_INVITE = 'voice-pack-invite'

export async function POST(request: NextRequest): Promise<Response> {
  // Admin gate FIRST, before any input handling. Unauth/non-admin → 404.
  const session = getSession(request)
  if (!session?.is_admin) {
    return errorResponse('Not found', 404)
  }

  try {
    // Re-check the flag in the database — the JWT claim can outlive a demotion.
    const admin = await queryRow('SELECT is_admin FROM users WHERE id = $1', [session.id])
    if (admin?.is_admin !== true) {
      return errorResponse('Not found', 404)
    }

    const body = await request.json().catch(() => ({}))
    const note = normalizeVoicePackName(body?.note) || null
    const expiresInDays = clampInviteExpiryDays(body?.expiresInDays)

    // 24 random bytes → 32 base64url chars. URL-safe, no padding.
    const token = randomBytes(24).toString('base64url')

    const invite = await queryRow(
      `INSERT INTO voice_pack_invites (token, created_by, note, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)
       RETURNING id, token, note, expires_at, created_at`,
      [token, session.id, note, String(expiresInDays)]
    )

    console.log(LOG_PREFIX_VOICE_PACK_INVITE, {
      adminId: session.id,
      inviteId: invite?.id,
      note,
      expiresInDays,
    })

    return jsonResponse({
      // Path only — the client prefixes window.location.origin so this works on
      // localhost, previews and protectthepod.com without an env var.
      path: voicePackInvitePath(token),
      note,
      expiresAt: invite?.expires_at ?? null,
      expiresInDays,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
