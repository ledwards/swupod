'use client'

/**
 * useVoicePackDraft — keeps a creator's in-progress voice pack on their device.
 *
 * The invite link survives being closed (viewing never spends it; only a
 * successful submit does), so the form has to survive it too. This hook restores
 * whatever was saved for THIS token on mount, then writes every later change
 * back: clips immediately, text on a short debounce.
 *
 * It owns no draft state of its own beyond the one-shot restore. The form
 * remains the source of truth for what is on screen — the hook is the tape
 * deck, not the score. All storage failures are non-events (see
 * `src/utils/voicePackDraftStorage.ts`): a browser that refuses to persist
 * simply behaves like the form did before drafts existed.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isEmptyVoicePackDraftText,
  restoredDraftNotice,
  type VoicePackDraftText,
} from '../services/voicePackDraft'
import type { VoicePackClipType } from '../services/voicePacks'
import {
  clearVoicePackDraft,
  deleteVoicePackDraftClip,
  loadVoicePackDraft,
  saveVoicePackDraftClip,
  saveVoicePackDraftText,
  type VoicePackDraftSnapshot,
} from '../utils/voicePackDraftStorage'

/** How long typing settles before the text fields are written. */
const TEXT_DEBOUNCE_MS = 400

export interface VoicePackDraft {
  /** What was on disk for this token, set once the restore finishes. */
  restored: VoicePackDraftSnapshot | null
  /** The sentence to show the creator, or null when nothing was recovered. */
  notice: string | null
  /** Persist the text fields (debounced). No-op until the restore has finished. */
  saveText: (text: VoicePackDraftText) => void
  /** Persist one clip's audio. */
  saveClip: (clip: VoicePackClipType, file: File) => void
  /** Forget one clip — the discard control's other half. */
  removeClip: (clip: VoicePackClipType) => void
  /** Drop the whole draft (after a successful submit). */
  clear: () => void
}

/**
 * @param token - Invite token from the URL; the namespace for everything stored
 */
export function useVoicePackDraft(token: string): VoicePackDraft {
  const [restored, setRestored] = useState<VoicePackDraftSnapshot | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Writes must never outlive the mount, and must never fire before the restore
  // (an empty form saved at t=0 would erase the very draft we are loading).
  const readyRef = useRef(false)

  useEffect(() => {
    let alive = true
    readyRef.current = false
    loadVoicePackDraft(token).then((snapshot) => {
      if (!alive) return
      readyRef.current = true
      setRestored(snapshot)
      const clipCount = Object.keys(snapshot.clips).length
      const hasText = snapshot.text !== null && !isEmptyVoicePackDraftText(snapshot.text)
      setNotice(restoredDraftNotice(clipCount, hasText))
    })
    return () => {
      alive = false
      readyRef.current = false
      if (textTimerRef.current) clearTimeout(textTimerRef.current)
    }
  }, [token])

  const saveText = useCallback(
    (text: VoicePackDraftText) => {
      if (!readyRef.current) return
      if (textTimerRef.current) clearTimeout(textTimerRef.current)
      textTimerRef.current = setTimeout(() => {
        saveVoicePackDraftText(token, text)
      }, TEXT_DEBOUNCE_MS)
    },
    [token]
  )

  const saveClip = useCallback(
    (clip: VoicePackClipType, file: File) => {
      void saveVoicePackDraftClip(token, clip, file)
    },
    [token]
  )

  const removeClip = useCallback(
    (clip: VoicePackClipType) => {
      void deleteVoicePackDraftClip(token, clip)
    },
    [token]
  )

  const clear = useCallback(() => {
    if (textTimerRef.current) clearTimeout(textTimerRef.current)
    textTimerRef.current = null
    // Nothing may write after this point, or the draft resurrects itself.
    readyRef.current = false
    setNotice(null)
    void clearVoicePackDraft(token)
  }, [token])

  return { restored, notice, saveText, saveClip, removeClip, clear }
}

export default useVoicePackDraft
