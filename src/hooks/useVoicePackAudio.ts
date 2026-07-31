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

/** Play an element muted and immediately pause it — spends a user gesture on it. */
function primeElement(el: HTMLAudioElement): void {
  try {
    el.muted = true
    const result = el.play()
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
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

export interface VoicePackAudio {
  /** Play a clip. No-ops when muted, unavailable, or the browser refuses. */
  play: (clip: VoicePackClip) => void
  /** Unlock audio for this client. MUST be called from a user gesture handler. */
  prime: () => void
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

  const prime = useCallback(() => {
    hasPrimed = true
    for (const clip of VOICE_PACK_CLIPS) {
      const el = ensureAudio(activePackId, clip)
      if (el) primeElement(el)
    }
  }, [activePackId])

  const play = useCallback((clip: VoicePackClip) => {
    if (mutedRef.current) return
    const el = ensureAudio(activePackId, clip)
    if (!el) return
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
  }, [activePackId])

  const setMuted = useCallback((next: boolean) => {
    setPersistedMuted(next)
    setLocalMuted(next)
    mutedSubscribers.forEach(listener => listener(next))
  }, [setPersistedMuted])

  const toggleMuted = useCallback(() => {
    setMuted(!mutedRef.current)
  }, [setMuted])

  return { play, prime, muted, setMuted, toggleMuted }
}

export default useVoicePackAudio
