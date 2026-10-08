// GET /api/voice-packs/[id]/asset/[clip] — the stored audio bytes for one cue slot.
//
// THIS URL SHAPE IS A CONTRACT. The countdown cue engine builds exactly this path
// (see voicePackAssetUrl in src/services/voicePacks.ts); do not change it here alone.
//
// ACCESS POLICY — deliberately unauthenticated.
// The host's unlock covers the whole table: every player in a pod using a pack must
// be able to fetch its clips, including seats that do not own it and anonymous
// spectators. Gating on entitlement would mean either (a) resolving "is this caller
// in a pod whose settings.voicePackId is this pack" on every audio request, or (b)
// silence for most of the table. Neither is worth it for a 1–3 second branded voice
// line the creator wants heard. The pack id is a UUIDv4, so the endpoint is not
// enumerable, and only `status = 'active'` packs are served — flipping a pack to
// 'disabled' takes it off the air everywhere at once.
//
// Caching: these bytes USED to be immutable, because the creator form wrote them
// once and there was no edit path. There is one now — the creator returns to their
// link to rerecord a line — so `immutable` would mean an edit that changes nothing
// anyone hears for up to a year. Instead the ETag carries the row's `updated_at`
// (migration 081) and the response revalidates after a short window: replacing a
// clip invalidates every cached copy of it, while an untouched clip still costs a
// 304 rather than a re-download.
import { NextRequest } from 'next/server'
import { queryRow } from '@/lib/db'
import { errorResponse, handleApiError } from '@/lib/utils'
import { isVoicePackClipType } from '@/src/services/voicePacks'
import {
  voicePackAssetCacheHeaders,
  voicePackAssetETag,
} from '@/src/services/voicePackAssetCache'

interface RouteContext {
  params: Promise<{ id: string; clip: string }>
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { id, clip } = await params

    // Validate before touching the database: a non-UUID id or an unknown clip can
    // only be a probe, and `clip` is CHECK-constrained in the schema anyway.
    if (!UUID_RE.test(id) || !isVoicePackClipType(clip)) {
      return errorResponse('Not found', 404)
    }

    const row = await queryRow(
      `SELECT a.audio, a.audio_mime, a.byte_size, a.updated_at
         FROM voice_pack_assets a
         JOIN voice_packs vp ON vp.id = a.pack_id
        WHERE a.pack_id = $1 AND a.clip_type = $2 AND vp.status = 'active'`,
      [id, clip]
    )
    if (!row) return errorResponse('Not found', 404)

    const bytes = row['audio'] as Buffer
    const etag = voicePackAssetETag(`${id}-${clip}`, bytes.length, row['updated_at'])
    const headers = voicePackAssetCacheHeaders(etag)

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers })
    }

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': (row['audio_mime'] as string) || 'application/octet-stream',
        'Content-Length': String(bytes.length),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
