// GET /api/voice-packs/entitlements — the voice packs the caller has unlocked.
//
// Anonymous callers get an empty list, NOT a 401 (precedent:
// app/api/promo/entitlements/route.ts), so the host picker and any future surface can
// render their locked/empty state without special-casing auth.
//
// Each pack carries the URLs the cue engine needs, so a consumer never string-builds
// an asset path itself.
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryRows } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import {
  voicePackLogoUrl,
  voicePackAssetUrl,
  type VoicePackClipType,
} from '@/src/services/voicePacks'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = getSession(request)
    if (!session) return jsonResponse({ packs: [] })

    const rows = await queryRows(
      `SELECT vp.id, vp.code, vp.display_name, vp.creator_name, e.granted_at,
              ARRAY_AGG(a.clip_type ORDER BY a.clip_type) FILTER (WHERE a.clip_type IS NOT NULL) AS clips
         FROM voice_pack_entitlements e
         JOIN voice_packs vp ON vp.id = e.pack_id
         LEFT JOIN voice_pack_assets a ON a.pack_id = vp.id
        WHERE e.user_id = $1 AND vp.status = 'active'
        GROUP BY vp.id, vp.code, vp.display_name, vp.creator_name, e.granted_at
        ORDER BY e.granted_at DESC`,
      [session.id]
    )

    const packs = rows.map((row) => {
      const id = row['id'] as string
      const clips = ((row['clips'] as string[] | null) ?? []) as VoicePackClipType[]
      return {
        id,
        code: row['code'],
        displayName: row['display_name'],
        creatorName: row['creator_name'],
        grantedAt: row['granted_at'],
        logoUrl: voicePackLogoUrl(id),
        clips,
        assetUrls: Object.fromEntries(clips.map((clip) => [clip, voicePackAssetUrl(id, clip)])),
      }
    })

    return jsonResponse({ packs })
  } catch (error) {
    return handleApiError(error)
  }
}
