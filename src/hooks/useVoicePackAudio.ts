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
 *    from the lobby Ready click: it plays every clip muted and immediately
 *    pauses it, which spends the gesture on all seven at once. Everything after
 *    that (phase transitions, countdowns, expiry) is allowed to speak.
 *    Choosing a voice pack is a gesture too, so VoicePackPicker calls
 *    `prime(packId, { announce: 'greeting' })`: it unlocks the newly chosen
 *    pack AND plays that pack's greeting, so the host hears what they picked.
 * 3. THE MUTE PREFERENCE. Persisted via useLocalStorage, and shared across
 *    every hook instance in the tab — the header toggle and the CountdownTimer
 *    are separate mounts and must not disagree.
 *
 * The pool and the mute state are module-level on purpose: a draft page mounts
 * this hook in several places and they all have to be the same speaker.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import useLocalStorage from './common/useLocalStorage'
import {
  DEFAULT_VOICE_PACK_ID,
  VOICE_PACK_CLIPS,
  isDefaultVoicePack,
  voicePackAssetUrl,
  type VoicePackClip,
} from '../utils/voicePackAssets'

/** localStorage key for the "I don't want the voice cues" preference. */
export const VOICE_CUES_MUTED_KEY = 'ptp-voice-cues-muted'

const CUE_VOLUME = 0.9

// --- module-level shared state (one speaker per tab) ---

const audioPool = new Map<string, HTMLAudioElement>()
const mutedSubscribers = new Set<(muted: boolean) => void>()
/** True once a user gesture has primed the pool; new elements prime on creation. */
let hasPrimed = false

function normalizedPackId(packId?: string | null): string {
  return isDefaultVoicePack(packId) ? DEFAULT_VOICE_PACK_ID : (packId as string).trim()
}

function poolKey(packId: string, clip: VoicePackClip): string {
  return `${packId}::${clip}`
}

/**
 * Play an element muted and immediately pause it — spends a user gesture on it.
 *
 * The pause lands one microtask later, which is a race when the same gesture also
 * wants a clip to be HEARD (the pack picker announcing a greeting): a newly created
 * element is primed on creation and then asked to speak. `muted` is the interlock —
 * an audible play clears it, so a prime whose promise resolves to an unmuted element
 * knows something else claimed it and leaves it alone.
 */
function primeElement(el: HTMLAudioElement): void {
  try {
    el.muted = true
    const result = el.play()
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          if (!el.muted) return
          el.pause()
          el.currentTime = 0
          el.muted = false
        })
        .catch(() => {
          el.muted = false
        })
    } else {
      el.pause()
      el.currentTime = 0
      el.muted = false
    }
  } catch {
    el.muted = false
  }
}

function ensureAudio(packId: string, clip: VoicePackClip): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return null
  const key = poolKey(packId, clip)
  const existing = audioPool.get(key)
  if (existing) return existing
  try {
    const el = new window.Audio(voicePackAssetUrl(clip, packId))
    el.preload = 'auto'
    el.volume = CUE_VOLUME
    audioPool.set(key, el)
    // The pack can change (host picks a creator pack) after the gesture was
    // already spent. Best effort: prime the newcomer too; a rejection is
    // swallowed exactly like every other play attempt.
    if (hasPrimed) primeElement(el)
    return el
  } catch {
    return null
  }
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

export interface VoicePackAudio {
  /** Play a clip from the active pack. No-ops when muted, unavailable, or refused. */
  play: (clip: VoicePackClip) => void
  /**
   * Play a clip from a SPECIFIC pack — for the moment a pack is being chosen, when
   * the hook's own `packId` prop is still the previous selection.
   */
  playFrom: (packId: string | null | undefined, clip: VoicePackClip) => void
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

  // Preload the active pack.
  useEffect(() => {
    for (const clip of VOICE_PACK_CLIPS) ensureAudio(activePackId, clip)
  }, [activePackId])

  const playFrom = useCallback((packId: string | null | undefined, clip: VoicePackClip) => {
    const id = normalizedPackId(packId)
    const el = ensureAudio(id, clip)
    if (!el) return
    // Muted still spends the gesture on the element: a player who unmutes later
    // should not need another click to hear anything.
    if (mutedRef.current) {
      primeElement(el)
      return
    }
    try {
      el.muted = false
      el.currentTime = 0
      const result = el.play()
      // The established idiom: a blocked or interrupted play is never an error
      // the player should see.
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch {
      /* ignore */
    }
  }, [])

  const prime = useCallback((packId?: string | null, options?: PrimeOptions) => {
    hasPrimed = true
    const id = packId === undefined ? activePackId : normalizedPackId(packId)
    for (const clip of VOICE_PACK_CLIPS) {
      if (options?.announce === clip) {
        playFrom(id, clip)
        continue
      }
      const el = ensureAudio(id, clip)
      if (el) primeElement(el)
    }
  }, [activePackId, playFrom])

  const play = useCallback((clip: VoicePackClip) => {
    playFrom(activePackId, clip)
  }, [activePackId, playFrom])

  const setMuted = useCallback((next: boolean) => {
    setPersistedMuted(next)
    setLocalMuted(next)
    mutedSubscribers.forEach(listener => listener(next))
  }, [setPersistedMuted])

  const toggleMuted = useCallback(() => {
    setMuted(!mutedRef.current)
  }, [setMuted])

  return { play, playFrom, prime, muted, setMuted, toggleMuted }
}

export default useVoicePackAudio
