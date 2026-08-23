/**
 * Creator voice-pack draft — the pure half of "don't lose my work".
 *
 * A creator records five of seven lines, closes the tab, and comes back to the
 * same invite link (viewing never spends it — only a successful submit does).
 * They should find their work, not an empty form. This module owns the shapes
 * and the rules; `src/utils/voicePackDraftStorage.ts` owns the I/O and
 * `src/hooks/useVoicePackDraft.ts` owns the React state.
 *
 * THE TOKEN IS THE NAMESPACE. Every key here carries the invite token, because
 * one browser can legitimately hold two creator links at once and a draft that
 * leaked across them would put one creator's voice in another's pack.
 *
 * BLOBS GO TO IndexedDB, TEXT GOES TO localStorage. A recorded line is
 * hundreds of KB of binary; localStorage is a ~5 MB *string* store and would
 * blow its quota (and force a base64 round-trip) within a couple of takes.
 * IndexedDB stores the Blob itself. The three text fields are tiny and are
 * kept beside it in localStorage, where a synchronous read on mount is free.
 *
 * PARSING IS TOTAL. Whatever is sitting under our keys — an older shape, a
 * truncated string, another tab mid-write — must never throw on mount. Every
 * reader here returns a usable value or null.
 */
import { VOICE_PACK_CLIP_TYPES, isVoicePackClipType, type VoicePackClipType } from './voicePacks'

/** IndexedDB database holding recorded/selected clip blobs, one row per (token, clip). */
export const VOICE_PACK_DRAFT_DB_NAME = 'ptp-voice-pack-drafts'
/** Object store inside that database. Keyed by `voicePackDraftClipKey`. */
export const VOICE_PACK_DRAFT_STORE = 'clips'
/** Schema version. Bump only alongside an upgrade path in the storage module. */
export const VOICE_PACK_DRAFT_DB_VERSION = 1
/** localStorage key prefix for the (tiny) text fields. */
export const VOICE_PACK_DRAFT_TEXT_KEY_PREFIX = 'ptp-voice-pack-draft:'

/** Field caps, mirroring the maxLength on the form's inputs. */
const MAX_CODE_LENGTH = 24
const MAX_NAME_LENGTH = 60

/** The three typed fields of the form. Blobs are stored separately. */
export interface VoicePackDraftText {
  code: string
  displayName: string
  creatorName: string
}

/** A draft with nothing typed into it. */
export const EMPTY_VOICE_PACK_DRAFT_TEXT: VoicePackDraftText = {
  code: '',
  displayName: '',
  creatorName: '',
}

/** One clip's audio as it sits in IndexedDB. */
export interface StoredClipRecord {
  /** Primary key — `voicePackDraftClipKey(token, clip)`. */
  key: string
  token: string
  clip: VoicePackDraftSlot
  /** Original filename, so a restored clip is indistinguishable from a picked one. */
  name: string
  /** Mime type of the blob. */
  type: string
  blob: Blob
  savedAt: number
}

/**
 * localStorage key for one invite's text fields.
 *
 * @param token - Invite token from the URL
 */
export function voicePackDraftTextKey(token: string): string {
  return `${VOICE_PACK_DRAFT_TEXT_KEY_PREFIX}${token}`
}

/**
 * IndexedDB key for one clip of one invite.
 *
 * @param token - Invite token from the URL
 * @param clip - Clip slot id
 */
/** The logo is stored alongside the clips; it is a file for the same pack. */
export const VOICE_PACK_LOGO_SLOT = 'logo'

/** A slot that can hold a file in a draft: any clip, or the pack logo. */
export type VoicePackDraftSlot = VoicePackClipType | typeof VOICE_PACK_LOGO_SLOT

/** Every slot a draft can hold, in restore order. */
export const VOICE_PACK_DRAFT_SLOTS: readonly VoicePackDraftSlot[] = [
  ...VOICE_PACK_CLIP_TYPES,
  VOICE_PACK_LOGO_SLOT,
]

/** Whether a stored slot id is one we recognise. */
export function isVoicePackDraftSlot(value: unknown): value is VoicePackDraftSlot {
  return value === VOICE_PACK_LOGO_SLOT || isVoicePackClipType(value)
}

export function voicePackDraftClipKey(token: string, clip: VoicePackDraftSlot): string {
  return `${token}::${clip}`
}

/**
 * Every clip key belonging to one invite, in cue order. Clearing a draft deletes
 * exactly these — no index, no cursor over other creators' rows.
 *
 * @param token - Invite token from the URL
 */
export function voicePackDraftClipKeys(token: string): string[] {
  return VOICE_PACK_DRAFT_SLOTS.map((slot) => voicePackDraftClipKey(token, slot))
}

/**
 * The JSON written to localStorage for the text fields.
 *
 * @param text - Current field values
 * @param savedAt - Epoch ms of this save
 */
export function serializeVoicePackDraftText(text: VoicePackDraftText, savedAt: number): string {
  return JSON.stringify({
    code: text.code,
    displayName: text.displayName,
    creatorName: text.creatorName,
    savedAt,
  })
}

function readString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/**
 * Text fields from a stored payload, or null when there is nothing usable there.
 * Never throws: the string under our key is not ours to trust.
 *
 * @param raw - Raw localStorage value (or null when absent)
 */
export function parseVoicePackDraftText(raw: string | null | undefined): VoicePackDraftText | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  return {
    code: readString(obj['code'], MAX_CODE_LENGTH),
    displayName: readString(obj['displayName'], MAX_NAME_LENGTH),
    creatorName: readString(obj['creatorName'], MAX_NAME_LENGTH),
  }
}

/**
 * Whether a draft holds no typed work. Whitespace is not work — a draft of
 * spaces must not claim anything was restored.
 *
 * @param text - Field values to inspect
 */
export function isEmptyVoicePackDraftText(text: VoicePackDraftText): boolean {
  return (
    text.code.trim() === '' && text.displayName.trim() === '' && text.creatorName.trim() === ''
  )
}

/**
 * The row to put in IndexedDB for one clip.
 *
 * @param token - Invite token from the URL
 * @param clip - Clip slot id
 * @param file - Recorded or picked audio
 * @param savedAt - Epoch ms of this save
 */
export function storedClipRecord(
  token: string,
  clip: VoicePackDraftSlot,
  file: File,
  savedAt: number
): StoredClipRecord {
  return {
    key: voicePackDraftClipKey(token, clip),
    token,
    clip,
    name: file.name,
    type: file.type,
    blob: file,
    savedAt,
  }
}

/**
 * A stored row turned back into a `File` — exactly the shape the file picker
 * produces, so the form keeps ONE submit path.
 *
 * Returns null for anything that is not a well-formed record for `token`:
 * a foreign token, an unknown clip slot, a missing blob. A bad row is dropped,
 * never surfaced.
 *
 * @param record - Row read out of IndexedDB
 * @param token - Invite the row must belong to; omit to skip the check
 */
export function restoredClipFile(
  record: StoredClipRecord | null | undefined,
  token?: string
): File | null {
  if (!record || typeof record !== 'object') return null
  if (token !== undefined && record.token !== token) return null
  if (!isVoicePackDraftSlot(record.clip)) return null
  const blob = record.blob
  if (!(blob instanceof Blob)) return null
  const type = typeof record.type === 'string' ? record.type : blob.type
  const name = typeof record.name === 'string' && record.name ? record.name : `${record.clip}`
  try {
    return new File([blob], name, { type })
  } catch {
    return null
  }
}

/**
 * The one sentence the form shows when it recovers work — or null when nothing
 * was recovered, so a creator on a fresh link is never told otherwise.
 *
 * @param clipCount - How many of the seven clips came back
 * @param hasText - Whether any typed field came back
 */
export function restoredDraftNotice(clipCount: number, hasText: boolean): string | null {
  const total = VOICE_PACK_CLIP_TYPES.length
  const lead = 'Picked up where you left off —'
  if (clipCount <= 0) {
    return hasText ? `${lead} your pack details were restored from this browser.` : null
  }
  const recordings = `${clipCount} of ${total} recordings`
  // "details and 1 recording were", but "1 recording was" on its own.
  if (hasText) return `${lead} your pack details and ${recordings} were restored from this browser.`
  return `${lead} ${recordings} ${clipCount === 1 ? 'was' : 'were'} restored from this browser.`
}
