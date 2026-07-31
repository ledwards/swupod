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
// Caching: the bytes for a (pack, clip) pair are immutable — the creator form writes
// them once and there is no edit path — so responses carry a one-year immutable
// Cache-Control plus an ETag, and each client reads any given clip at most once.
import { NextRequest } from 'next/server'
import { queryRow } from '@/lib/db'
import { errorResponse, handleApiError } from '@/lib/utils'
import { isVoicePackClipType } from '@/src/services/voicePacks'

interface RouteContext {
  params: Promise<{ id: string; clip: string }>
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function GET(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { id, clip } = await params

    // Validate before touching the database: a non-UUID id or an unknown clip can
    // only be a probe, and `clip` is CHECK-constrained in the schema anyway.
    if (!UUID_RE.test(id) || !isVoicePackClipType(clip)) {
      return errorResponse('Not found', 404)
    }

    const row = await queryRow(
      `SELECT a.audio, a.audio_mime, a.byte_size
         FROM voice_pack_assets a
         JOIN voice_packs vp ON vp.id = a.pack_id
        WHERE a.pack_id = $1 AND a.clip_type = $2 AND vp.status = 'active'`,
      [id, clip]
    )
    if (!row) return errorResponse('Not found', 404)

    const bytes = row['audio'] as Buffer
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': (row['audio_mime'] as string) || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${id}-${clip}-${row['byte_size']}"`,
        // The bytes are opaque media; never let a browser sniff them into something
        // it would execute.
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
