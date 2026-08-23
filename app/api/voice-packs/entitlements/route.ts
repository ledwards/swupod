// GET /api/voice-packs/entitlements — the creator voice packs this caller may use.
//
// TWO WAYS TO HOLD A PACK, one payload:
//   - a Friend of the Pod (users.is_patron, and admins) holds EVERY active pack on
//     the platform without redeeming anything;
//   - everyone else holds exactly the packs they redeemed a code for.
// `unlockedVia` says which, so the picker can label a pack the viewer never
// redeemed, and `isPatron` lets it decide whether to show the upsell at all.
//
// `is_patron` is read from the users table on every request and never from the JWT:
// the claim is not in the token, and a stale copy would either sell the upsell to a
// patron or hand the platform to a lapsed one (same rule as
// app/api/promo/claim/route.ts).
//
// Anonymous callers get an empty list, NOT a 401 (precedent:
// app/api/promo/entitlements/route.ts), so the picker can render its locked state
// without special-casing auth.
//
// The BUILT-IN packs are not in this payload at all — they ship with the app and the
// client already knows them. Which of them are patron-only is a rule, not data:
// PATRON_ONLY_BUILT_IN_VOICE_PACK_IDS in src/services/voicePacks.ts.
//
// Each pack carries the URLs the cue engine needs, so a consumer never string-builds
// an asset path itself.
import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryRow, queryRows } from '@/lib/db'
import { jsonResponse, handleApiError } from '@/lib/utils'
import {
  voicePackLogoUrl,
  voicePackAssetUrl,
  type VoicePackClipType,
} from '@/src/services/voicePacks'

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = getSession(request)
    if (!session) return jsonResponse({ packs: [], isPatron: false })

    const viewer = await queryRow('SELECT is_patron, is_admin FROM users WHERE id = $1', [
      session.id,
    ])
    const isPatron = viewer?.['is_patron'] === true || viewer?.['is_admin'] === true

    // One query for both audiences: the LEFT JOIN carries the entitlement (and so
    // `unlockedVia`) when there is one, and the $2 predicate is what widens the set
    // to every active pack for a patron.
    const rows = await queryRows(
      `SELECT vp.id, vp.code, vp.display_name, vp.creator_name, vp.created_at,
              e.granted_at,
              ARRAY_AGG(a.clip_type ORDER BY a.clip_type) FILTER (WHERE a.clip_type IS NOT NULL) AS clips
         FROM voice_packs vp
         LEFT JOIN voice_pack_entitlements e ON e.pack_id = vp.id AND e.user_id = $1
         LEFT JOIN voice_pack_assets a ON a.pack_id = vp.id
        WHERE vp.status = 'active'
          AND ($2::boolean OR e.user_id IS NOT NULL)
        GROUP BY vp.id, vp.code, vp.display_name, vp.creator_name, vp.created_at, e.granted_at
        ORDER BY e.granted_at DESC NULLS LAST, vp.created_at DESC`,
      [session.id, isPatron]
    )

    const packs = rows.map((row) => {
      const id = row['id'] as string
      const clips = ((row['clips'] as string[] | null) ?? []) as VoicePackClipType[]
      const grantedAt = row['granted_at'] ?? null
      return {
        id,
        code: row['code'],
        displayName: row['display_name'],
        creatorName: row['creator_name'],
        grantedAt,
        // A patron who ALSO redeemed the code keeps 'code' — the entitlement row is
        // permanent and survives a lapsed pledge, so it is the stronger claim.
        unlockedVia: grantedAt ? 'code' : 'friend-of-the-pod',
        logoUrl: voicePackLogoUrl(id),
        clips,
        assetUrls: Object.fromEntries(clips.map((clip) => [clip, voicePackAssetUrl(id, clip)])),
      }
    })

    return jsonResponse({ packs, isPatron })
  } catch (error) {
    return handleApiError(error)
  }
}
