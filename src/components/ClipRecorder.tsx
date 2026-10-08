'use client'

/**
 * ClipRecorder — the "record it right here" control beside a clip's file picker.
 *
 * Deliberately dumb: it renders the record/stop buttons and the live duration, and
 * hands the finished `File` straight up to the form, which treats it exactly like a
 * picked file. All capture logic is in `useClipRecorder`, all acceptance rules in
 * `src/services/audioRecording.ts`.
 *
 * The file picker is never replaced, only joined — a blocked mic, a browser without
 * MediaRecorder, and a creator who already has polished audio all still work. Every
 * affordance is a tap target: nothing here depends on hover.
 */
import Button from './Button'
import useClipRecorder from '../hooks/useClipRecorder'
import { MAX_RECORDING_SECONDS } from '../services/audioRecording'
import './ClipRecorder.css'

const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="22" />
  </svg>
)

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

interface Props {
  /** Clip slot id, e.g. 'count-30'. Names the recorded file. */
  clip: string
  /** Clip label, for the accessible name of the record button. */
  label: string
  /** True once this slot holds audio — the button then offers a fresh take. */
  hasClip: boolean
  /** Receives the finished recording as a File. */
  onRecorded: (file: File) => void
}

export default function ClipRecorder({ clip, label, hasClip, onRecorded }: Props) {
  const { supported, state, clock, error, start, stop } = useClipRecorder({ clip, onRecorded })

  if (!supported) return null

  const recording = state === 'recording'

  return (
    <div className="clip-recorder">
      <div className="clip-recorder-row">
        {recording ? (
          <Button variant="danger" size="sm" onClick={stop} aria-label={`Stop recording ${label}`}>
            <StopIcon />
            <span>Stop</span>
          </Button>
        ) : (
          <Button
            variant="secondary"
            glowColor="red"
            size="sm"
            disabled={state === 'requesting'}
            onClick={start}
            aria-label={`${hasClip ? 'Re-record' : 'Record'} ${label}`}
          >
            <MicIcon />
            <span>
              {state === 'requesting' ? 'Allow mic…' : hasClip ? 'Re-record' : 'Record'}
            </span>
          </Button>
        )}

        {recording && (
          <span className="clip-recorder-status" role="status">
            <span className="clip-recorder-dot" aria-hidden="true" />
            Recording {clock}
          </span>
        )}
      </div>

      <p className="clip-recorder-hint">
        {recording
          ? `Tap Stop when you are done — recording stops on its own at ${MAX_RECORDING_SECONDS} seconds.`
          : 'Record here, or choose a file below.'}
      </p>

      {error && (
        <p className="clip-recorder-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
