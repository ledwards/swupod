'use client'

/**
 * useClipRecorder — microphone capture for one voice pack clip.
 *
 * Owns only the awkward browser bits; every rule about WHAT is acceptable lives in
 * `src/services/audioRecording.ts` (and, authoritatively, on the server). The hook
 * hands back a `File`, which is exactly what the file picker produces, so the creator
 * form has ONE submit path regardless of how a clip was captured.
 *
 * Three behaviours worth knowing:
 *
 * 1. PERMISSION IS A REAL OUTCOME. A denied mic is not an exception to swallow — it
 *    becomes `error` text, and the form keeps its file picker so the creator is never
 *    stuck.
 * 2. THE STOP IS GUARANTEED. A recording auto-stops at MAX_RECORDING_SECONDS, so a
 *    creator who walks away still gets a usable take instead of a rejected upload.
 * 3. THE TRACKS ARE ALWAYS RELEASED. Every exit path (stop, error, unmount) stops the
 *    MediaStream tracks — otherwise the browser's recording indicator stays lit.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_RECORDING_SECONDS,
  RECORDER_AUDIO_BITS_PER_SECOND,
  formatRecordingClock,
  pickRecorderMimeType,
  recordedClipFilename,
  recordedClipMime,
  recordingRejection,
} from '../services/audioRecording'

/** How often the running duration updates while recording. */
const TICK_MS = 200

export type ClipRecorderState = 'idle' | 'requesting' | 'recording'

export interface UseClipRecorderOptions {
  /** Clip slot id — used to name the recorded file. */
  clip: string
  /** Called with the finished recording, shaped exactly like a picked file. */
  onRecorded: (file: File) => void
}

export interface ClipRecorder {
  /** Whether this browser can record at all (false → file picker only). */
  supported: boolean
  state: ClipRecorderState
  /** Running duration, already formatted as m:ss. */
  clock: string
  /** Human-readable failure (permission denied, no mic, take too long…). */
  error: string | null
  start: () => void
  stop: () => void
}

/** Turn a getUserMedia rejection into something a creator can act on. */
function micErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was blocked. Allow the mic for this site in your browser settings, or upload an audio file instead.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Plug one in, or upload an audio file instead.'
  }
  if (name === 'NotReadableError') {
    return 'Your microphone is already in use by another app. Close it and try again, or upload an audio file instead.'
  }
  return 'Recording is not available in this browser. Upload an audio file instead.'
}

/**
 * @param options - Clip slot and the callback that receives the finished File
 */
export function useClipRecorder({ clip, onRecorded }: UseClipRecorderOptions): ClipRecorder {
  const [supported, setSupported] = useState(false)
  const [state, setState] = useState<ClipRecorderState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The callback changes identity on every render of the form; keep the latest.
  const onRecordedRef = useRef(onRecorded)
  onRecordedRef.current = onRecorded

  // Feature detection runs after mount: `navigator` does not exist during SSR, and
  // deciding on the server would hydrate the wrong control.
  useEffect(() => {
    setSupported(
      typeof window !== 'undefined' &&
        typeof window.MediaRecorder !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        typeof navigator.mediaDevices?.getUserMedia === 'function'
    )
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (limitRef.current) clearTimeout(limitRef.current)
    tickRef.current = null
    limitRef.current = null
  }, [])

  const stop = useCallback(() => {
    clearTimers()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        /* already stopping */
      }
    }
  }, [clearTimers])

  useEffect(
    () => () => {
      clearTimers()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
      releaseStream()
    },
    [clearTimers, releaseStream]
  )

  const start = useCallback(() => {
    if (state !== 'idle') return
    setError(null)
    setElapsedMs(0)
    setState('requesting')

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream

        const mimeType = pickRecorderMimeType(
          typeof window.MediaRecorder.isTypeSupported === 'function'
            ? (type: string) => window.MediaRecorder.isTypeSupported(type)
            : undefined
        )
        const options: MediaRecorderOptions = {
          audioBitsPerSecond: RECORDER_AUDIO_BITS_PER_SECOND,
        }
        if (mimeType) options.mimeType = mimeType

        let recorder: MediaRecorder
        try {
          recorder = new window.MediaRecorder(stream, options)
        } catch {
          // A browser that rejects our options still records with its own defaults.
          recorder = new window.MediaRecorder(stream)
        }
        recorderRef.current = recorder

        const chunks: BlobPart[] = []
        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        recorder.onerror = () => {
          clearTimers()
          releaseStream()
          recorderRef.current = null
          setState('idle')
          setError('Recording stopped unexpectedly. Try again, or upload an audio file instead.')
        }
        recorder.onstop = () => {
          clearTimers()
          releaseStream()
          recorderRef.current = null
          setState('idle')

          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || '' })
          const mime = recordedClipMime(blob.type, recorder.mimeType || mimeType)
          if (!mime) {
            setError(
              'This browser recorded a format we cannot accept. Upload an MP3, M4A, OGG, WAV or WebM file instead.'
            )
            return
          }
          const rejection = recordingRejection(blob.size)
          if (rejection) {
            setError(rejection)
            return
          }
          onRecordedRef.current(new File([blob], recordedClipFilename(clip, mime), { type: mime }))
        }

        const startedAt = Date.now()
        recorder.start()
        setState('recording')
        tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS)
        limitRef.current = setTimeout(() => stop(), MAX_RECORDING_SECONDS * 1000)
      })
      .catch((err) => {
        releaseStream()
        setState('idle')
        setError(micErrorMessage(err))
      })
  }, [state, clip, clearTimers, releaseStream, stop])

  return { supported, state, clock: formatRecordingClock(elapsedMs), error, start, stop }
}

export default useClipRecorder
