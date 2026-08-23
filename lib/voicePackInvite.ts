/**
 * What a creator link resolves to — the one place that turns a token into
 * "empty form", "this creator's published pack", or "404".
 *
 * The rules are pure and live in `src/services/voicePacks.ts`
 * (`voicePackInviteAccess`); this module is only the I/O that feeds them. Both
 * callers go through here on purpose:
 *
 *   - /creator/voice-pack/[token] renders the form from this,
 *   - POST /api/voice-packs/submit decides INSERT vs UPDATE from this.
 *
 * If those two ever disagreed about what a link means, a creator could be shown
 * an edit form that then published a second pack — or be 404'd off their own
 * live pack. One loader, one answer.
 *
 * Bytes are deliberately NOT read here. The form needs to know WHICH slots are
 * filled and how fresh they are; it plays them from the public asset routes like
 * any other listener, so a pack with eight megabytes of audio costs this page
 * nothing.
 */
import { queryRow, queryRows } from './db'
import {
  voicePackInviteAccess,
  isVoicePackClipType,
  type VoicePackClipType,
  type VoicePackInviteAccess,
} from '@/src/services/voicePacks'

/** Longest token we will even look up. Minted tokens are 32 base64url chars. */
const MAX_TOKEN_LENGTH = 128

/** One published cue slot, as the creator form needs to describe it. */
export interface PublishedVoicePackClip {
  clip: VoicePackClipType
  /**
   * Epoch ms of the last write to this slot. Appended to the preview URL as a
   * cache-buster so a creator who just replaced a line hears the NEW take.
   */
  version: number
  byteSize: number
}

/** The pack a link has already published, in the shape the form is fed. */
export interface PublishedVoicePack {
  id: string
  code: string
  displayName: string
  creatorName: string
  status: string
  hasLogo: boolean
  /** Epoch ms of the last logo write; same cache-busting job as clip `version`. */
  logoVersion: number
  clips: PublishedVoicePackClip[]
}

export interface VoicePackInviteContext {
  /** Invite row (id + admin note), or null when the token is unknown. */
  invite: { id: string; note: string | null } | null
  /** The pack this invite published, or null when it has published none. */
  pack: PublishedVoicePack | null
  access: VoicePackInviteAccess
}

const DENIED: VoicePackInviteContext = { invite: null, pack: null, access: 'denied' }

function epochMs(value: unknown, fallback: number): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

/**
 * Resolve a creator token to its invite, its published pack (if any) and what
 * the link may do. Never throws on a bad token — an unknown or malformed one
 * simply comes back denied, which every caller renders as a flat 404.
 *
 * @param token - The token segment from the creator URL
 */
export async function loadVoicePackInviteContext(
  token: unknown
): Promise<VoicePackInviteContext> {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return DENIED
  }

  const invite = await queryRow(
    'SELECT id, note, used_at, expires_at FROM voice_pack_invites WHERE token = $1',
    [token]
  )
  if (!invite) return DENIED

  // One pack per invite is enforced by a partial unique index (migration 081);
  // the LIMIT is belt-and-braces for databases migrated before it existed.
  const packRow = await queryRow(
    `SELECT id, code, display_name, creator_name, status, updated_at,
            (logo IS NOT NULL) AS has_logo
       FROM voice_packs
      WHERE invite_id = $1
      ORDER BY created_at ASC
      LIMIT 1`,
    [invite['id']]
  )

  const access = voicePackInviteAccess(
    invite as { used_at?: Date | string | null; expires_at?: Date | string | null },
    packRow as { id?: string | null } | null
  )
  if (access === 'denied') return DENIED

  const inviteSummary = { id: invite['id'] as string, note: (invite['note'] as string) ?? null }
  if (!packRow) return { invite: inviteSummary, pack: null, access }

  const packUpdatedAt = epochMs(packRow['updated_at'], Date.now())
  const assetRows = await queryRows(
    'SELECT clip_type, byte_size, updated_at FROM voice_pack_assets WHERE pack_id = $1',
    [packRow['id']]
  )

  const clips: PublishedVoicePackClip[] = []
  for (const row of assetRows) {
    const clip = row['clip_type']
    // The column is CHECK-constrained, but the form's typing is not the database's
    // and a slot we do not recognise must never reach it.
    if (!isVoicePackClipType(clip)) continue
    clips.push({
      clip,
      version: epochMs(row['updated_at'], packUpdatedAt),
      byteSize: Number(row['byte_size']) || 0,
    })
  }

  return {
    invite: inviteSummary,
    access,
    pack: {
      id: packRow['id'] as string,
      code: (packRow['code'] as string) ?? '',
      displayName: (packRow['display_name'] as string) ?? '',
      creatorName: (packRow['creator_name'] as string) ?? '',
      status: (packRow['status'] as string) ?? 'active',
      hasLogo: packRow['has_logo'] === true,
      logoVersion: packUpdatedAt,
      clips,
    },
  }
}
