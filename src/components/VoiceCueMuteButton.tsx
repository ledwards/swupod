'use client'

/**
 * The single site-wide mute control for draft voice cues.
 *
 * Rendered in two places because the cues span two surfaces: the lobby (where
 * `greeting` and `ready-the-draft` fire, and where TimerPanel renders nothing)
 * and the timer bar during picking. `useVoicePackAudio` keeps `muted` in
 * module-level state backed by localStorage with a subscriber set, so both
 * mounts always agree — there is no prop to thread.
 */
import Button from './Button'
import { useVoicePackAudio } from '../hooks/useVoicePackAudio'
import './VoiceCueMuteButton.css'

const SpeakerOnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
  </svg>
)

const SpeakerOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <line x1="23" y1="9" x2="17" y2="15"></line>
    <line x1="17" y1="9" x2="23" y2="15"></line>
  </svg>
)

export interface VoiceCueMuteButtonProps {
  /** Pack whose clips get primed; null/undefined uses the default pack. */
  packId?: string | null
  className?: string
}

export default function VoiceCueMuteButton({ packId, className }: VoiceCueMuteButtonProps) {
  const { muted, toggleMuted, prime } = useVoicePackAudio(packId)

  return (
    <Button
      variant="icon"
      size="sm"
      className={`voice-cue-mute${className ? ` ${className}` : ''}`}
      // Priming here is deliberate: this is a user gesture, so it doubles as
      // the audio unlock for spectators and late joiners who never hit Ready.
      onClick={() => { prime(); toggleMuted() }}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute draft voice cues' : 'Mute draft voice cues'}
      title={muted ? 'Voice cues muted' : 'Voice cues on'}
    >
      {muted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
    </Button>
  )
}
