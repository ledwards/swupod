/**
 * Voice pack assets — the 7 clip slots a voice pack provides, and where the
 * audio for a given pack lives.
 *
 * The default pack ships as static files in `public/sounds/voice-packs/default/`.
 * Creator packs are stored in the database and served by an API route; this
 * module only builds the URL — it never fetches.
 */

/** Every clip slot a voice pack must provide. Order is the play order in a draft. */
export const VOICE_PACK_CLIPS = [
  'greeting',
  'ready-the-draft',
  'start-the-draft',
  'count-30',
  'count-15',
  'count-5',
  'time-is-up',
] as const

export type VoicePackClip = (typeof VOICE_PACK_CLIPS)[number]

/** The pack id that means "the built-in pack shipped with the app". */
export const DEFAULT_VOICE_PACK_ID = 'default'

/** Static directory holding the default pack's mp3s. */
export const DEFAULT_VOICE_PACK_DIR = '/sounds/voice-packs/default'

/**
 * Whether a pack id refers to the built-in default pack. Undefined, null and
 * the empty string all mean "default" so callers can pass a possibly-missing
 * `draft.voicePackId` straight through.
 *
 * @param packId - Pack id from pod settings, or null/undefined
 */
export function isDefaultVoicePack(packId?: string | null): boolean {
  if (packId === null || packId === undefined) return true
  const trimmed = packId.trim()
  return trimmed === '' || trimmed === DEFAULT_VOICE_PACK_ID
}

/**
 * URL for one clip of one pack.
 *
 * @param clip - Clip slot
 * @param packId - Voice pack id; null/undefined/'default' → the built-in pack
 * @returns Absolute (site-relative) URL to the audio file
 */
export function voicePackAssetUrl(clip: VoicePackClip, packId?: string | null): string {
  if (isDefaultVoicePack(packId)) {
    return `${DEFAULT_VOICE_PACK_DIR}/${clip}.mp3`
  }
  return `/api/voice-packs/${encodeURIComponent((packId as string).trim())}/asset/${clip}`
}

/**
 * Every clip URL for a pack, in `VOICE_PACK_CLIPS` order. Used to preload and
 * to prime the audio elements on the Ready click.
 *
 * @param packId - Voice pack id; null/undefined/'default' → the built-in pack
 */
export function voicePackAssetUrls(packId?: string | null): { clip: VoicePackClip; url: string }[] {
  return VOICE_PACK_CLIPS.map(clip => ({ clip, url: voicePackAssetUrl(clip, packId) }))
}
