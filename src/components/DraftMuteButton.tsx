'use client'

import Button from './Button'
import { useVoicePackAudio } from '../hooks/useVoicePackAudio'
import './DraftMuteButton.css'

// The ONE mute for every draft sound, in the page header for every participant,
// lobby and picking alike. Shares the voice-cue mute preference (localStorage,
// per user), which the deal and shuffle effects also honour.
export default function DraftMuteButton({ packId }: { packId?: string | null }) {
  const { muted, toggleMuted, prime, play } = useVoicePackAudio(packId)
  return (
    <Button
      variant="icon"
      className={`draft-mute-button ${muted ? 'is-muted' : 'is-on'}`}
      aria-label={muted ? 'Unmute' : 'Mute'}
      title={muted ? 'Unmute' : 'Mute'}
      aria-pressed={muted}
      onClick={() => {
        const turningOn = muted
        prime()
        toggleMuted()
        if (turningOn) play('sound-on')
      }}
    >
      {muted ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4V4Z" /><path d="m22 9-6 6m0-6 6 6" /></svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4V4Z" /><path d="M15.5 9.5a4 4 0 0 1 0 5" /></svg>
      )}
    </Button>
  )
}
