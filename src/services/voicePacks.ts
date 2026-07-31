/**
 * Creator voice packs — pure domain rules.
 *
 * No I/O, no React. Everything here is shared by the admin mint route, the
 * creator upload route, the /redeem claim, the asset-serving route and the
 * pod picker, so the definitions live in exactly one place.
 *
 * The clip-type list is the contract with the countdown cue engine AND with
 * migration 080's CHECK constraint. Changing it means changing all three.
 */

/**
 * The 7 cue slots a voice pack fills. These exact strings are the ids the cue
 * engine plays, the `clip_type` values migration 080 allows, and the last path
 * segment of /api/voice-packs/[id]/asset/[clip].
 */
export const VOICE_PACK_CLIP_TYPES = [
  'greeting',
  'ready-the-draft',
  'start-the-draft',
  'count-30',
  'count-15',
  'count-5',
  'time-is-up',
] as const

export type VoicePackClipType = (typeof VOICE_PACK_CLIP_TYPES)[number]

/** Narrowing guard — the only sanctioned way to accept a clip id from a request. */
export function isVoicePackClipType(value: unknown): value is VoicePackClipType {
  return typeof value === 'string' && (VOICE_PACK_CLIP_TYPES as readonly string[]).includes(value)
}

/**
 * Codes are stored normalized so "  abc-123 " and "ABC123" can never become two
 * different packs. Normalization: strip ALL whitespace, uppercase.
 *
 * The database UNIQUE index on the normalized value is what actually enforces
 * uniqueness — this function only guarantees both sides compare the same string.
 */
export function normalizeVoicePackCode(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** Minimum/maximum normalized code length. Short enough to read off a stream overlay. */
export const VOICE_PACK_CODE_MIN = 3
export const VOICE_PACK_CODE_MAX = 24

/**
 * A normalized code is valid when it is 3–24 chars of A–Z, 0–9 and internal
 * hyphens, starting and ending on an alphanumeric. Rejects codes that are all
 * punctuation, leading/trailing hyphens, and anything URL- or SQL-awkward.
 */
export function isValidVoicePackCode(normalized: string): boolean {
  if (normalized.length < VOICE_PACK_CODE_MIN || normalized.length > VOICE_PACK_CODE_MAX) {
    return false
  }
  return /^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$/.test(normalized)
}

/** Display/creator name caps. Trimmed and collapsed; empty display name is invalid. */
export const VOICE_PACK_NAME_MAX = 60

export function normalizeVoicePackName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, ' ').trim().slice(0, VOICE_PACK_NAME_MAX)
}

/**
 * Canonical asset URL. The cue engine builds this exact shape, so it is defined
 * here rather than string-built at each call site.
 */
export function voicePackAssetUrl(packId: string, clip: VoicePackClipType): string {
  return `/api/voice-packs/${packId}/asset/${clip}`
}

/** Canonical logo URL for a pack (used by /redeem and the host picker). */
export function voicePackLogoUrl(packId: string): string {
  return `/api/voice-packs/${packId}/logo`
}

/** The creator-facing path an admin-minted invite unlocks. */
export function voicePackInvitePath(token: string): string {
  return `/creator/voice-pack/${token}`
}

export interface VoicePackInviteRow {
  used_at?: Date | string | null
  expires_at?: Date | string | null
}

/**
 * An invite opens the creator form only while it is unused AND unexpired.
 * Both failures render identically to the caller (a 404) so a probing client
 * cannot tell "already used" from "never existed".
 */
export function isInviteUsable(invite: VoicePackInviteRow | null, now: Date = new Date()): boolean {
  if (!invite) return false
  if (invite.used_at) return false
  if (!invite.expires_at) return false
  const expires = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at)
  if (Number.isNaN(expires.getTime())) return false
  return expires.getTime() > now.getTime()
}

/** Invite lifetime bounds an admin may choose, in days. */
export const INVITE_EXPIRY_DAYS_MIN = 1
export const INVITE_EXPIRY_DAYS_MAX = 90
export const INVITE_EXPIRY_DAYS_DEFAULT = 14

/** Clamp an admin-supplied expiry to the permitted window (non-numbers → default). */
export function clampInviteExpiryDays(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return INVITE_EXPIRY_DAYS_DEFAULT
  return Math.min(INVITE_EXPIRY_DAYS_MAX, Math.max(INVITE_EXPIRY_DAYS_MIN, Math.trunc(n)))
}
