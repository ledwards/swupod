'use client'

/**
 * useVoicePackAudio — the draft's spoken cue player.
 *
 * Owns three things browsers make awkward:
 *
 * 1. PRELOAD. Every clip of the active pack gets an `Audio` element up front,
 *    so a cue that fires on a 5-second pick is not still buffering.
 * 2. THE AUTOPLAY UNLOCK. Browsers only allow programmatic `.play()` on an
 *    element that has already played during a user gesture. `prime()` is called
 *    from the lobby Ready click: it spends that gesture on every clip at once,
 *    silently, so everything after it (phase transitions, countdowns, expiry) is
 *    allowed to speak. Choosing a voice pack is a gesture too, so
 *    VoicePackPicker calls `prime(packId, { announce: 'greeting' })`: it unlocks
 *    the newly chosen pack AND plays that pack's greeting.
 * 3. THE MUTE PREFERENCE. Persisted via useLocalStorage, and shared across
 *    every hook instance in the tab — the header toggle and the CountdownTimer
 *    are separate mounts and must not disagree.
 *
 * WHAT IS NOT HERE ANY MORE: the one-clip-at-a-time rule. Overlapping cues ("it
 * played a bunch of audio at once") were re-fixed three times in this file with
 * successively cleverer prime/play interlocks, and came back each time. That
 * rule now lives in services/voiceCueSpeaker.ts, where an element can only be
 * heard if the speaker unmuted it and it silences everything else first — so no
 * ordering of `play()` promise resolutions can produce two voices. This hook
 * does pack ids, preloading and the mute preference, and nothing else may
 * unmute an element.
 *
 * Nor is "a later cue wins" here. Draft cues (`play`, `playSequence`) QUEUE
 * behind whatever is speaking, so "time is up" is not cut off by the "next pick
 * begins" that follows it a few hundred milliseconds later. The only interrupt
 * is `prime({ announce })`, the pack picker's preview, where the newest click is
 * the one the host wants to hear.
 *
 * The speaker and the mute state are module-level on purpose: a draft page
 * mounts this hook in several places and they all have to be the same speaker.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import useLocalStorage from './common/useLocalStorage'
import { createVoiceCueSpeaker } from '../services/voiceCueSpeaker'
import {
  DEFAULT_VOICE_PACK_ID,
  VOICE_PACK_CLIPS,
  builtInVoicePack,
  voicePackAssetUrl,
  type VoicePackClip,
} from '../utils/voicePackAssets'

/** localStorage key for the "I don't want the voice cues" preference. */
export const VOICE_CUES_MUTED_KEY = 'ptp-voice-cues-muted'

const CUE_VOLUME = 0.9

// --- module-level shared state (one speaker per tab) ---

/**
 * The single speaker for the tab. Every element it hands out is muted at rest,
 * and it is the only thing allowed to unmute one. See voiceCueSpeaker.ts for why
 * that is a hard rule rather than a convention.
 */
const speaker = createVoiceCueSpeaker(url => {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return null
  const el = new window.Audio(url)
  el.preload = 'auto'
  el.volume = CUE_VOLUME
  return el
})

const mutedSubscribers = new Set<(muted: boolean) => void>()
/**
 * True once a user gesture has unlocked audio. Elements created afterwards (the
 * host switches to a pack whose clips have never been loaded) are primed on
 * sight, since their own gesture has already been and gone.
 */
let hasPrimed = false

function normalizedPackId(packId?: string | null): string {
  // Built-ins normalize to their own id (so 'default'/'' land on the default
  // pack); a creator pack keeps its own id.
  const builtIn = builtInVoicePack(packId)
  if (builtIn) return builtIn.id
  const trimmed = (packId ?? '').trim()
  return trimmed === '' ? DEFAULT_VOICE_PACK_ID : trimmed
}

function poolKey(packId: string, clip: VoicePackClip): string {
  return `${packId}::${clip}`
}

function ensureAudio(packId: string, clip: VoicePackClip) {
  return speaker.ensure(poolKey(packId, clip), voicePackAssetUrl(clip, packId))
}

/** Options for `prime`. */
export interface PrimeOptions {
  /**
   * Clip to play OUT LOUD as part of the gesture instead of priming it silently.
   * Used when the host picks a pack: they hear the pack's greeting, which both
   * confirms the choice and proves audio is working on that page.
   */
  announce?: VoicePackClip
}

/** Options for `playFrom`. */
export interface PlayOptions {
  /**
   * Cut off whatever is speaking instead of waiting for it. Only for a preview
   * the user just clicked for; a draft cue never interrupts another.
   */
  interrupt?: boolean
}

export interface VoicePackAudio {
  /**
   * Play a clip from the active pack, after whatever is already speaking. No-ops
   * when muted, unavailable, or refused.
   */
  play: (clip: VoicePackClip) => void
  /**
   * Play a clip from a SPECIFIC pack — for the moment a pack is being chosen, when
   * the hook's own `packId` prop is still the previous selection.
   */
  playFrom: (packId: string | null | undefined, clip: VoicePackClip, options?: PlayOptions) => void
  /**
   * Play clips back to back, each starting when the one before it ends, after
   * whatever is already speaking. Used for the calls that are really one sentence
   * in two pieces ("next pick begins" → "thirty seconds remaining"). Still one
   * voice at a time.
   */
  playSequence: (clips: readonly VoicePackClip[]) => void
  /**
   * Unlock audio for this client. MUST be called from a user gesture handler,
   * synchronously, before any `await`.
   *
   * @param packId - Pack to unlock; omitted → the active pack
   * @param options - `announce` plays one clip aloud instead of silently
   */
  prime: (packId?: string | null, options?: PrimeOptions) => void
  /** Whether cues are muted on this client. */
  muted: boolean
  setMuted: (muted: boolean) => void
  toggleMuted: () => void
}

/**
 * @param packId - Active voice pack id (`draft.voicePackId`); null/undefined → default pack
 */
export function useVoicePackAudio(packId?: string | null): VoicePackAudio {
  const activePackId = normalizedPackId(packId)
  const [persistedMuted, setPersistedMuted] = useLocalStorage<boolean>(VOICE_CUES_MUTED_KEY, false)
  const [muted, setLocalMuted] = useState<boolean>(persistedMuted)
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  // localStorage reads as `false` during SSR/first paint; adopt the real value.
  useEffect(() => {
    setLocalMuted(persistedMuted)
  }, [persistedMuted])

  // Stay in sync with the other instances of this hook in the same tab.
  useEffect(() => {
    const listener = (next: boolean) => setLocalMuted(next)
    mutedSubscribers.add(listener)
    return () => {
      mutedSubscribers.delete(listener)
    }
  }, [])

  // Preload the active pack. Once a gesture has been spent, a pack that arrives
  // later (the host switches mid-draft) has missed it, so unlock its clips here.
  useEffect(() => {
    for (const clip of VOICE_PACK_CLIPS) {
      const el = ensureAudio(activePackId, clip)
      if (el && hasPrimed) speaker.prime(el)
    }
  }, [activePackId])

  const playFrom = useCallback((
    packId: string | null | undefined,
    clip: VoicePackClip,
    options?: PlayOptions
  ) => {
    const el = ensureAudio(normalizedPackId(packId), clip)
    if (!el) return
    // Muted still spends the gesture on the element: a player who unmutes later
    // should not need another click to hear anything.
    if (mutedRef.current) {
      speaker.prime(el)
      return
    }
    if (options?.interrupt) speaker.speak(el)
    else speaker.enqueue([el])
  }, [])

  const prime = useCallback((packId?: string | null, options?: PrimeOptions) => {
    const id = packId === undefined ? activePackId : normalizedPackId(packId)
    for (const clip of VOICE_PACK_CLIPS) {
      if (options?.announce === clip) {
        // The host just clicked this pack: they want to hear it now, not after
        // whatever the previous pack was still saying.
        playFrom(id, clip, { interrupt: true })
        continue
      }
      const el = ensureAudio(id, clip)
      // Priming an element twice is now simply silent, so this needs none of the
      // "was it already there / had we primed before" bookkeeping that used to
      // guard it — and that bookkeeping is exactly what kept getting the overlap
      // bug wrong.
      if (el) speaker.prime(el)
    }
    hasPrimed = true
  }, [activePackId, playFrom])

  const play = useCallback((clip: VoicePackClip) => {
    playFrom(activePackId, clip)
  }, [activePackId, playFrom])

  const playSequence = useCallback((clips: readonly VoicePackClip[]) => {
    const elements = clips
      .map(clip => ensureAudio(activePackId, clip))
      .filter((el): el is NonNullable<typeof el> => el !== null)
    if (elements.length === 0) return
    // Muted still spends the gesture, same as playFrom.
    if (mutedRef.current) {
      for (const el of elements) speaker.prime(el)
      return
    }
    speaker.enqueue(elements)
  }, [activePackId])

  const setMuted = useCallback((next: boolean) => {
    // Update the ref synchronously. `mutedRef` is otherwise assigned during
    // render, so a play() in the same tick as the toggle — unmuting and
    // immediately announcing "sound on" — would still read the old value and
    // silently prime instead of speaking.
    mutedRef.current = next
    setPersistedMuted(next)
    setLocalMuted(next)
    mutedSubscribers.forEach(listener => listener(next))
  }, [setPersistedMuted])

  const toggleMuted = useCallback(() => {
    setMuted(!mutedRef.current)
  }, [setMuted])

  return { play, playFrom, playSequence, prime, muted, setMuted, toggleMuted }
}

export default useVoicePackAudio
