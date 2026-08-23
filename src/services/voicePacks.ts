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
 * The cue slots a voice pack fills. These exact strings are the ids the cue
 * engine plays, the `clip_type` values the CHECK constraint allows, and the
 * last path segment of /api/voice-packs/[id]/asset/[clip].
 *
 * Adding one means a migration that replaces the constraint (see 087), an entry
 * in CLIP_GUIDE so creators know what to record, and audio in every built-in
 * pack — `npm run voice:generate` does that last part.
 */
export const VOICE_PACK_CLIP_TYPES = [
  'greeting',
  'ready-the-draft',
  'start-the-draft',
  'count-30',
  'count-15',
  'count-5',
  'time-is-up',
  'sound-on',
  'timer-paused',
  'timer-resumed',
  'next-pick',
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

/**
 * The creator name Protect the Pod publishes its own packs under (migration 086).
 *
 * It is what separates a PREMIUM pack — one we wrote and voiced — from a CREATOR
 * pack somebody else recorded, which is the only distinction the picker draws
 * between them. Stored on the row like any other creator's name rather than as a
 * flag, because that is exactly what it is: these packs go through the same
 * publishing path as everyone else's.
 */
export const PTP_CREATOR_NAME = 'Protect the Pod'

/**
 * Whether a pack is one of ours rather than an outside creator's.
 *
 * @param creatorName - The pack's `creatorName`
 */
export function isPremiumVoicePack(creatorName: string | null | undefined): boolean {
  return (creatorName ?? '').trim().toLowerCase() === PTP_CREATOR_NAME.toLowerCase()
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
 * An invite may author a NEW pack only while it is unused AND unexpired.
 * Both failures render identically to the caller (a 404) so a probing client
 * cannot tell "already used" from "never existed".
 *
 * This is the CREATE predicate only. Whether a link still opens at all is
 * `voicePackInviteAccess` — a spent invite keeps working as an edit link.
 */
export function isInviteUsable(invite: VoicePackInviteRow | null, now: Date = new Date()): boolean {
  if (!invite) return false
  if (invite.used_at) return false
  if (!invite.expires_at) return false
  const expires = invite.expires_at instanceof Date ? invite.expires_at : new Date(invite.expires_at)
  if (Number.isNaN(expires.getTime())) return false
  return expires.getTime() > now.getTime()
}

/**
 * What a creator link can do right now.
 *
 * 'create' — nothing has been published from it yet: an empty form, and
 *            submitting INSERTs a pack (and spends the invite).
 * 'edit'   — it already published a pack, so the link is that creator's durable
 *            handle on it: a populated form, and submitting UPDATES the SAME
 *            pack id, which is what keeps every redeemed entitlement working.
 * 'denied' — a flat 404, identical for "unknown", "expired unused" and
 *            "spent with nothing to show for it", so the link cannot be probed.
 */
export type VoicePackInviteAccess = 'create' | 'edit' | 'denied'

/** Just enough of the pack a link published to know that it exists. */
export interface VoicePackIdRow {
  id?: string | null
}

/**
 * Resolve what this link may do.
 *
 * EXPIRY MEANS "how long the offer to create stands", not "how long the pack may
 * be edited". An admin picks a deadline so an unclaimed link cannot sit around
 * forever as a way into the authoring surface. Once a pack exists that argument
 * is spent: this URL is the creator's ONLY handle on their own live pack, and
 * letting it rot would strand them with a published voice they cannot fix while
 * players keep hearing it. So a published pack keeps its link for good, and an
 * expired link that published nothing stays dead.
 *
 * @param invite - Invite row for the token, or null when the token is unknown
 * @param pack - The pack this invite published, or null when it published none
 * @param now - Clock, injectable for tests
 */
export function voicePackInviteAccess(
  invite: VoicePackInviteRow | null,
  pack: VoicePackIdRow | null,
  now: Date = new Date()
): VoicePackInviteAccess {
  if (!invite) return 'denied'
  if (pack?.id) return 'edit'
  return isInviteUsable(invite, now) ? 'create' : 'denied'
}

/**
 * The cue slots that would STILL be empty after a submit — counting both what
 * this request uploads and what the pack already holds.
 *
 * A new pack must arrive with all seven (a half-filled pack plays silence at a
 * real table), but an edit only has to send the lines being replaced: a slot the
 * creator does not touch keeps its published audio.
 *
 * @param supplied - Clip ids uploaded by this request
 * @param alreadyPublished - Clip ids the pack already has audio for
 */
export function missingVoicePackClips(
  supplied: Iterable<string>,
  alreadyPublished: Iterable<string> = []
): VoicePackClipType[] {
  const have = new Set<string>([...supplied, ...alreadyPublished])
  return VOICE_PACK_CLIP_TYPES.filter((clip) => !have.has(clip))
}

/**
 * WHO MAY USE WHICH PACK.
 *
 * Two tiers, and that is the whole of it:
 *
 *   - The language packs (English, Français, Deutsch, Español, Italiano) ship with
 *     the app and are free to everyone. They are how a table that has unlocked
 *     nothing still hears its cues in its own language.
 *   - Creator packs — Leebo included, who is simply the first of them, published by
 *     Protect the Pod — are unlocked one at a time with a code… unless the viewer is
 *     a Friend of the Pod, who gets every pack on the platform without redeeming
 *     anything.
 *
 * There is no third tier and no special-cased pack id. A pack either ships with the
 * app or is a row in voice_packs; nothing in between.
 *
 * `is_patron` MUST be read from the users table at the moment of the check, never
 * from the JWT — the claim is not in the token and would be stale if it were (same
 * rule as app/api/promo/claim/route.ts).
 */

export interface VoicePackAccess {
  /** Whether the id is a pack that ships with the app (see isBuiltInVoicePack). */
  isBuiltIn: boolean
  /** Friend of the Pod or admin, read from the users table — never from the JWT. */
  isPatron: boolean
  /** Whether the viewer holds a voice_pack_entitlements row for this pack. */
  hasEntitlement: boolean
}

/**
 * Whether a viewer may select or play a pack.
 *
 * Takes the facts as an argument rather than looking them up, so this stays a pure
 * rule that the pod-selection route and any future surface can share instead of each
 * re-deriving the tiers. It no longer takes the pack id: the tiers turn on what is
 * TRUE of the pack, never on which pack it is.
 *
 * A built-in is allowed outright; a creator pack is "Friend of the Pod OR redeemed".
 *
 * @param access - What is true about the pack and the viewer
 */
export function canUseVoicePack(access: VoicePackAccess): boolean {
  if (access.isBuiltIn) return true
  return access.isPatron || access.hasEntitlement
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
