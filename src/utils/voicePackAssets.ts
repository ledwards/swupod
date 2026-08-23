/**
 * Voice pack assets — the 7 clip slots a voice pack provides, and where the
 * audio for a given pack lives.
 *
 * Built-in packs ship as static files in `public/sounds/voice-packs/<pack>/`.
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
  'sound-on',
] as const

export type VoicePackClip = (typeof VOICE_PACK_CLIPS)[number]

/**
 * Packs that ship with the app. Every account has all of these — they need no
 * redemption code, unlike a creator's pack. Static files under `dir`, so they
 * cost no database round trip.
 */
export interface BuiltInVoicePack {
  id: string
  name: string
  description: string
  dir: string
  /** Avatar shown beside the pack in the picker. */
  icon: string
}

export const BUILT_IN_VOICE_PACKS: readonly BuiltInVoicePack[] = [
  {
    id: 'leebo',
    name: 'Leebo',
    description: "Protect the Pod's AI Copilot",
    dir: '/sounds/voice-packs/leebo',
    icon: '/icons/voice-packs/leebo.png',
  },
  {
    id: 'english',
    name: 'Zoe (English)',
    description: 'Voice in English',
    dir: '/sounds/voice-packs/english',
    icon: '/icons/voice-packs/english.svg',
  },
  {
    id: 'french',
    name: 'Audrey (Français)',
    description: 'Les annonces en français',
    dir: '/sounds/voice-packs/french',
    icon: '/icons/voice-packs/french.svg',
  },
  {
    id: 'german',
    name: 'Anna (Deutsch)',
    description: 'Die Ansagen auf Deutsch',
    dir: '/sounds/voice-packs/german',
    icon: '/icons/voice-packs/german.svg',
  },
  {
    id: 'spanish',
    name: 'Marisol (Español)',
    description: 'Los avisos en español',
    dir: '/sounds/voice-packs/spanish',
    icon: '/icons/voice-packs/spanish.svg',
  },
  {
    id: 'italian',
    name: 'Federica (Italiano)',
    description: 'Gli annunci in italiano',
    dir: '/sounds/voice-packs/italian',
    icon: '/icons/voice-packs/italian.svg',
  },
] as const

/** The pack used when a pod has chosen nothing. */
export const DEFAULT_VOICE_PACK_ID = 'leebo'

/** Display name for the default pack. */
export const DEFAULT_VOICE_PACK_NAME = 'Leebo'

/** One-line description of the default pack. */
export const DEFAULT_VOICE_PACK_DESCRIPTION = "Protect the Pod's AI Copilot"

/**
 * The built-in pack for an id, or null if the id is not built in (i.e. it is a
 * creator pack served from the database). Null/undefined/'' resolve to the
 * default, so a possibly-missing `draft.voicePackId` can be passed straight in.
 *
 * @param packId - Pack id from pod settings, or null/undefined
 */
export function builtInVoicePack(packId?: string | null): BuiltInVoicePack | null {
  const trimmed = (packId ?? '').trim()
  const id = trimmed === '' || trimmed === 'default' ? DEFAULT_VOICE_PACK_ID : trimmed
  return BUILT_IN_VOICE_PACKS.find(p => p.id === id) ?? null
}

/**
 * Whether a pack id refers to a pack that ships with the app (as opposed to a
 * creator pack). These need no entitlement.
 *
 * @param packId - Pack id from pod settings, or null/undefined
 */
export function isBuiltInVoicePack(packId?: string | null): boolean {
  return builtInVoicePack(packId) !== null
}

/**
 * URL for one clip of one pack.
 *
 * @param clip - Clip slot
 * @param packId - Voice pack id; null/undefined/'default' → the built-in pack
 * @returns Absolute (site-relative) URL to the audio file
 */
export function voicePackAssetUrl(clip: VoicePackClip, packId?: string | null): string {
  const builtIn = builtInVoicePack(packId)
  if (builtIn) {
    return `${builtIn.dir}/${clip}.mp3`
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
