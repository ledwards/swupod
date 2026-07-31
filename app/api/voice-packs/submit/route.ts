// POST /api/voice-packs/submit — a creator authors their pack.
//
// Multipart/form-data (precedent: app/api/import/upload-photo/route.ts): eight file
// parts (7 clips + logo) as JSON base64 would blow past Next's ~10 MB body cap and
// triple the bytes on the wire.
//
// Auth model: there is no account here. The unguessable single-use invite token IS
// the authorization, so every failure mode around it is treated as hostile:
//   - the token is claimed ATOMICALLY inside the transaction
//     (UPDATE ... WHERE used_at IS NULL RETURNING id), so two concurrent submits on
//     one link can never both win;
//   - an unknown / used / expired token is a flat 404, indistinguishable from each
//     other, so the link cannot be probed;
//   - every uploaded byte goes through validateClipUpload / validateLogoUpload
//     (declared mime + magic bytes + size cap must all agree — see
//     src/services/voicePackUploads.ts).
//
// Code uniqueness is enforced by the UNIQUE index on voice_packs.code, not by a
// precheck: a duplicate raises 23505 and the whole transaction rolls back, which
// leaves the invite UNUSED so the creator can retry with a different code.
import { NextRequest } from 'next/server'
import { withTransaction, queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { getSession } from '@/lib/auth'
import {
  VOICE_PACK_CLIP_TYPES,
  normalizeVoicePackCode,
  isValidVoicePackCode,
  normalizeVoicePackName,
  isInviteUsable,
} from '@/src/services/voicePacks'
import { validateClipUpload, validateLogoUpload } from '@/src/services/voicePackUploads'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = '23505'

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const form = await request.formData().catch(() => null)
    if (!form) return errorResponse('Expected a multipart form upload', 400)

    const token = form.get('token')
    if (typeof token !== 'string' || token.length === 0 || token.length > 128) {
      return errorResponse('Not found', 404)
    }

    // Pre-flight read so a dead link fails before we buffer 8 files. The
    // authoritative single-use claim still happens inside the transaction.
    const invite = await queryRow(
      'SELECT id, used_at, expires_at FROM voice_pack_invites WHERE token = $1',
      [token]
    )
    if (!isInviteUsable(invite as never)) return errorResponse('Not found', 404)

    const code = normalizeVoicePackCode(form.get('code'))
    if (!isValidVoicePackCode(code)) {
      return errorResponse(
        'Redemption codes are 3–24 characters: letters, numbers and hyphens.',
        400
      )
    }

    const displayName = normalizeVoicePackName(form.get('displayName'))
    if (displayName.length === 0) return errorResponse('A pack name is required.', 400)
    const creatorName = normalizeVoicePackName(form.get('creatorName')) || null

    // --- Files. All 7 clips and the logo are required: a partially filled pack
    // would silently play nothing for the missing cues at a real table. ---
    const clips: Array<{ clip: string; mime: string; bytes: Buffer }> = []
    for (const clip of VOICE_PACK_CLIP_TYPES) {
      const part = form.get(clip)
      if (!part || typeof part === 'string') {
        return errorResponse(`Missing audio for "${clip}".`, 400)
      }
      const bytes = Buffer.from(await part.arrayBuffer())
      const check = validateClipUpload(part.type, bytes)
      if (!check.ok) return errorResponse(`${clip}: ${check.error}`, 400)
      clips.push({ clip, mime: check.mime, bytes })
    }

    const logoPart = form.get('logo')
    if (!logoPart || typeof logoPart === 'string') {
      return errorResponse('A logo image is required.', 400)
    }
    const logoBytes = Buffer.from(await logoPart.arrayBuffer())
    const logoCheck = validateLogoUpload(logoPart.type, logoBytes)
    if (!logoCheck.ok) return errorResponse(`Logo: ${logoCheck.error}`, 400)

    // The creator may or may not be signed in; record them when they are.
    const session = getSession(request)

    try {
      const packId = await withTransaction(async (tx) => {
        // Atomic single-use claim. Losing this race (or an expiry that elapsed
        // between the pre-flight read and now) yields no row.
        const claimed = await tx.queryRow(
          `UPDATE voice_pack_invites
              SET used_at = NOW(), used_by = $2
            WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
            RETURNING id`,
          [invite!['id'], session?.id ?? null]
        )
        if (!claimed) throw new Error('invite-consumed')

        const pack = await tx.queryRow(
          `INSERT INTO voice_packs (code, display_name, creator_name, logo, logo_mime, invite_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [code, displayName, creatorName, logoBytes, logoCheck.mime, invite!['id']]
        )

        for (const { clip, mime, bytes } of clips) {
          await tx.query(
            `INSERT INTO voice_pack_assets (pack_id, clip_type, audio, audio_mime, byte_size)
             VALUES ($1, $2, $3, $4, $5)`,
            [pack!['id'], clip, bytes, mime, bytes.length]
          )
        }

        return pack!['id'] as string
      })

      return jsonResponse({ packId, code, displayName })
    } catch (error) {
      if ((error as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        // Rolled back — the invite is still unused, so retrying is safe.
        return errorResponse(`The code "${code}" is already taken. Pick another.`, 409)
      }
      if (error instanceof Error && error.message === 'invite-consumed') {
        return errorResponse('Not found', 404)
      }
      throw error
    }
  } catch (error) {
    return handleApiError(error)
  }
}
