// Voice pack selection for one pod.
//
//   GET  /api/voice-packs/pod/[shareId]  → the pod's current selection (anyone who can
//                                          see the pod; players need it to know which
//                                          pack's clips to load).
//   PUT  /api/voice-packs/pod/[shareId]  → the HOST picks a pack (or clears it).
//
// Stored as `voicePackId` inside the existing pods.settings JSONB — no new column.
// The write merges into settings (`settings || jsonb`) rather than replacing it, so a
// concurrent change to another settings key is never clobbered, and clearing uses the
// jsonb `-` operator so the key disappears instead of becoming null.
//
// Two server-side gates on the write, both required:
//   1. the caller must be pods.host_id, and
//   2. the caller must be allowed the pack — see canUseVoicePack in
//      src/services/voicePacks.ts. The three tiers: the language packs are free to
//      everyone; Leebo is a Friend of the Pod pack; a creator pack needs either a
//      redeemed entitlement or Friend of the Pod (who holds the whole platform).
// The host's unlock is what covers the table, so it must be the host's own unlock —
// a player cannot set a pack, and a host cannot set one they do not hold.
import { NextRequest } from 'next/server'
import { requireAuth, getSession } from '@/lib/auth'
import { query, queryRow } from '@/lib/db'
import { jsonResponse, errorResponse, parseBody, handleApiError } from '@/lib/utils'
import { isBuiltInVoicePack } from '@/src/utils/voicePackAssets'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import {
  voicePackLogoUrl,
  canUseVoicePack,
  isPatronOnlyBuiltInVoicePack,
} from '@/src/services/voicePacks'

interface RouteContext {
  params: Promise<{ shareId: string }>
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function GET(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const pod = await queryRow(
      'SELECT id, host_id, settings FROM pods WHERE share_id = $1',
      [shareId]
    )
    if (!pod) return errorResponse('Draft not found', 404)

    const settings = (typeof pod['settings'] === 'string'
      ? JSON.parse(pod['settings'])
      : pod['settings']) || {}
    const voicePackId: string | null = settings.voicePackId ?? null

    const session = getSession(request)
    if (!voicePackId) {
      return jsonResponse({ voicePackId: null, pack: null, isHost: session?.id === pod['host_id'] })
    }

    // Built-in packs are not database rows — their ids are slugs like 'leebo',
    // and passing one to a uuid column throws 22P02. The client already knows
    // every built-in, so hand the id straight back.
    if (isBuiltInVoicePack(voicePackId)) {
      return jsonResponse({
        voicePackId,
        pack: null,
        isHost: session?.id === pod['host_id'],
      })
    }

    const pack = await queryRow(
      `SELECT id, code, display_name, creator_name FROM voice_packs
        WHERE id = $1 AND status = 'active'`,
      [voicePackId]
    )

    return jsonResponse({
      voicePackId: pack ? voicePackId : null,
      pack: pack
        ? {
            id: pack['id'],
            code: pack['code'],
            displayName: pack['display_name'],
            creatorName: pack['creator_name'],
            logoUrl: voicePackLogoUrl(voicePackId),
          }
        : null,
      isHost: session?.id === pod['host_id'],
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext): Promise<Response> {
  try {
    const { shareId } = await params
    const session = requireAuth(request)

    let body: { voicePackId?: unknown }
    try {
      body = await parseBody(request)
    } catch {
      return errorResponse('Invalid request body', 400)
    }

    const raw = body.voicePackId
    const clearing = raw === null || raw === '' || raw === undefined
    // Two shapes are legal: a creator pack (UUID, must be unlocked) and a
    // built-in pack (a known slug like 'leebo' that ships with the app and
    // needs no entitlement).
    const builtIn = !clearing && typeof raw === 'string' && isBuiltInVoicePack(raw)
    if (!clearing && !builtIn && (typeof raw !== 'string' || !UUID_RE.test(raw))) {
      return errorResponse('Invalid voicePackId', 400)
    }

    const pod = await queryRow('SELECT id, host_id FROM pods WHERE share_id = $1', [shareId])
    if (!pod) return errorResponse('Draft not found', 404)
    if (pod['host_id'] !== session.id) {
      return errorResponse('Only the host can choose the voice pack', 403)
    }

    if (clearing) {
      await query(
        `UPDATE pods
            SET settings = COALESCE(settings, '{}'::jsonb) - 'voicePackId',
                state_version = state_version + 1
          WHERE id = $1`,
        [pod['id']]
      )
    } else {
      const patronOnlyBuiltIn = isPatronOnlyBuiltInVoicePack(raw)
      const freeBuiltIn = builtIn && !patronOnlyBuiltIn

      if (!freeBuiltIn) {
        // Everything except a language pack needs the viewer checked. `is_patron`
        // comes from the users table, never the JWT (which does not carry it).
        const viewer = await queryRow('SELECT is_patron, is_admin FROM users WHERE id = $1', [
          session.id,
        ])
        const isPatron = viewer?.['is_patron'] === true || viewer?.['is_admin'] === true

        // A built-in has no entitlement row to hold — Leebo is patron or nothing.
        const hasEntitlement = builtIn
          ? false
          : (await queryRow(
              `SELECT vp.id FROM voice_pack_entitlements e
                 JOIN voice_packs vp ON vp.id = e.pack_id
                WHERE e.user_id = $1 AND e.pack_id = $2 AND vp.status = 'active'`,
              [session.id, raw]
            )) !== null

        if (!canUseVoicePack(raw, { isBuiltIn: builtIn, isPatron, hasEntitlement })) {
          return errorResponse(
            patronOnlyBuiltIn
              ? 'That voice pack is for Friends of the Pod'
              : 'You have not unlocked that voice pack',
            403
          )
        }

        // A patron passes the tier check without an entitlement, so the pack's own
        // existence still has to be confirmed — canUseVoicePack cannot know whether
        // a UUID names a live pack.
        if (!builtIn && !hasEntitlement) {
          const active = await queryRow(
            `SELECT id FROM voice_packs WHERE id = $1 AND status = 'active'`,
            [raw]
          )
          if (!active) return errorResponse('That voice pack is not available', 404)
        }
      }

      await query(
        `UPDATE pods
            SET settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb,
                state_version = state_version + 1
          WHERE id = $1`,
        [pod['id'], JSON.stringify({ voicePackId: raw })]
      )
    }

    // Push the change to everyone at the table — the clients preload the new pack.
    broadcastDraftState(shareId).catch((err) => {
      console.error('[voice-packs] Error broadcasting draft state:', err)
    })

    return jsonResponse({ voicePackId: clearing ? null : (raw as string) })
  } catch (error) {
    return handleApiError(error)
  }
}
