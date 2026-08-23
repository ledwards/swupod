// POST /api/voice-packs/submit — a creator publishes their pack, or changes it.
//
// Multipart/form-data (precedent: app/api/import/upload-photo/route.ts): up to eight
// file parts (7 clips + logo) as JSON base64 would blow past Next's ~10 MB body cap
// and triple the bytes on the wire.
//
// Auth model: there is no account here. The unguessable invite token IS the
// authorization, so every failure mode around it is treated as hostile:
//   - an unknown / malformed token, and an expired token that never published
//     anything, are all a flat 404, indistinguishable from each other, so the link
//     cannot be probed;
//   - a FIRST publish claims the invite ATOMICALLY inside the transaction
//     (UPDATE ... WHERE used_at IS NULL RETURNING id), so two concurrent submits on
//     one fresh link can never both create a pack;
//   - every uploaded byte goes through validateClipUpload / validateLogoUpload
//     (declared mime + magic bytes + size cap must all agree — see
//     src/services/voicePackUploads.ts).
//
// INSERT OR UPDATE is decided by the link, never by the request: if this invite
// already has a pack, this is an edit of THAT pack id and nothing else. The id is
// what voice_pack_entitlements point at, so keeping it stable is what stops an edit
// from silently revoking the pack from everyone who redeemed the code.
//
// An edit sends only what changed. A clip part that is absent keeps its published
// audio; an absent logo keeps the published logo. All seven slots must be filled
// once the dust settles (missingVoicePackClips) — a half-filled pack plays silence
// at a real table.
//
// Code uniqueness is enforced by the UNIQUE index on voice_packs.code, not by a
// precheck: a duplicate raises 23505 and the whole transaction rolls back. On a
// first publish that leaves the invite UNUSED so the creator can retry with a
// different code; on an edit it leaves the pack exactly as it was.
import { NextRequest } from 'next/server'
import { withTransaction } from '@/lib/db'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { getSession } from '@/lib/auth'
import { loadVoicePackInviteContext } from '@/lib/voicePackInvite'
import {
  VOICE_PACK_CLIP_TYPES,
  normalizeVoicePackCode,
  isValidVoicePackCode,
  normalizeVoicePackName,
  missingVoicePackClips,
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

    // Resolve the link BEFORE buffering any file: a dead link must not cost us
    // eight uploads. The authoritative single-use claim for a first publish still
    // happens inside the transaction below.
    const { invite, pack, access } = await loadVoicePackInviteContext(form.get('token'))
    if (access === 'denied' || !invite) return errorResponse('Not found', 404)
    const editing = access === 'edit' && pack !== null

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

    // --- Files. Only what the request actually sends is read and validated; on an
    // edit, an absent part means "keep what is published". ---
    const clips: Array<{ clip: string; mime: string; bytes: Buffer }> = []
    for (const clip of VOICE_PACK_CLIP_TYPES) {
      const part = form.get(clip)
      if (!part || typeof part === 'string') continue
      const bytes = Buffer.from(await part.arrayBuffer())
      const check = validateClipUpload(part.type, bytes)
      if (!check.ok) return errorResponse(`${clip}: ${check.error}`, 400)
      clips.push({ clip, mime: check.mime, bytes })
    }

    const published = pack?.clips.map((c) => c.clip) ?? []
    const stillMissing = missingVoicePackClips(
      clips.map((c) => c.clip),
      published
    )
    if (stillMissing.length > 0) {
      return errorResponse(`Missing audio for "${stillMissing[0]}".`, 400)
    }

    const logoPart = form.get('logo')
    let logo: { bytes: Buffer; mime: string } | null = null
    if (!logoPart || typeof logoPart === 'string') {
      if (!pack?.hasLogo) return errorResponse('A logo image is required.', 400)
    } else {
      const logoBytes = Buffer.from(await logoPart.arrayBuffer())
      const logoCheck = validateLogoUpload(logoPart.type, logoBytes)
      if (!logoCheck.ok) return errorResponse(`Logo: ${logoCheck.error}`, 400)
      logo = { bytes: logoBytes, mime: logoCheck.mime }
    }

    // The creator may or may not be signed in; record them when they are.
    const session = getSession(request)

    try {
      const packId = await withTransaction(async (tx) => {
        let targetId: string

        if (editing) {
          // The pack id never changes — entitlements point at it. COALESCE keeps
          // the published logo when this submit did not send one.
          const updated = await tx.queryRow(
            `UPDATE voice_packs
                SET code = $2,
                    display_name = $3,
                    creator_name = $4,
                    logo = COALESCE($5::bytea, logo),
                    logo_mime = COALESCE($6::text, logo_mime),
                    updated_at = NOW()
              WHERE id = $1
              RETURNING id`,
            [pack!.id, code, displayName, creatorName, logo?.bytes ?? null, logo?.mime ?? null]
          )
          // Deleted between the read and here. Nothing to edit — do NOT fall back
          // to creating, which would mint a second pack behind a spent invite.
          if (!updated) throw new Error('pack-missing')
          targetId = updated['id'] as string
        } else {
          // Atomic single-use claim of the CREATE offer. Losing this race (or an
          // expiry that elapsed since the pre-flight read) yields no row.
          const claimed = await tx.queryRow(
            `UPDATE voice_pack_invites
                SET used_at = NOW(), used_by = $2
              WHERE id = $1 AND used_at IS NULL AND expires_at > NOW()
              RETURNING id`,
            [invite.id, session?.id ?? null]
          )
          if (!claimed) throw new Error('invite-consumed')

          const created = await tx.queryRow(
            `INSERT INTO voice_packs (code, display_name, creator_name, logo, logo_mime, invite_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [code, displayName, creatorName, logo!.bytes, logo!.mime, invite.id]
          )
          targetId = created!['id'] as string
        }

        // Upsert only the slots this submit sent. An untouched slot keeps its
        // audio; `updated_at` moves so the asset route's ETag stops serving the
        // copy every listener already cached.
        for (const { clip, mime, bytes } of clips) {
          await tx.query(
            `INSERT INTO voice_pack_assets (pack_id, clip_type, audio, audio_mime, byte_size)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (pack_id, clip_type) DO UPDATE
               SET audio = EXCLUDED.audio,
                   audio_mime = EXCLUDED.audio_mime,
                   byte_size = EXCLUDED.byte_size,
                   updated_at = NOW()`,
            [targetId, clip, bytes, mime, bytes.length]
          )
        }

        return targetId
      })

      return jsonResponse({ packId, code, displayName, mode: editing ? 'updated' : 'created' })
    } catch (error) {
      if ((error as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
        // Rolled back: on a first publish the invite is still unused, and on an
        // edit the pack is untouched. Either way, retrying is safe.
        return errorResponse(`The code "${code}" is already taken. Pick another.`, 409)
      }
      if (error instanceof Error && error.message === 'invite-consumed') {
        return errorResponse('Not found', 404)
      }
      if (error instanceof Error && error.message === 'pack-missing') {
        return errorResponse('Not found', 404)
      }
      throw error
    }
  } catch (error) {
    return handleApiError(error)
  }
}
