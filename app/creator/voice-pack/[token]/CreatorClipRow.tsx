'use client'

/**
 * One cue row of the creator form: what the line is for, what to say, a way to
 * HEAR the default pack say it, the recorder, the file picker, the creator's own
 * playback and the control that throws that take away.
 *
 * Presentational on purpose — every piece of state (which clip is playing, which
 * clips exist, the persisted draft) belongs to CreatorVoicePackForm, which is the
 * only place that can enforce "one example at a time" and keep page state and the
 * saved draft in step.
 *
 * Icons are the site's existing glyphs, copied verbatim rather than redrawn: the
 * play triangle (TimerButton/HostControls), the stop square (ClipRecorder) and the
 * trash can (PoolBuilds/DeleteDeckSection). Discarding a take destroys work, so it
 * gets the destructive treatment — danger variant, trash icon — never a neutral
 * secondary button.
 */
import Button from '@/src/components/Button'
import ClipRecorder from '@/src/components/ClipRecorder'
import { type VoicePackClipType } from '@/src/services/voicePacks'
import { AUDIO_ACCEPT } from '@/src/services/voicePackUploads'

/** What each cue is for, in the creator's language, with a suggested line. */
export const CLIP_GUIDE: Record<
  VoicePackClipType,
  { label: string; when: string; suggestion: string }
> = {
  greeting: {
    label: 'Greeting',
    when: 'Plays when someone unlocks your pack, and any time they click your logo.',
    suggestion: '“Hello there, this is Leebo. Welcome to the Pod!”',
  },
  'ready-the-draft': {
    label: 'Ready the draft',
    when: 'Plays for the whole table when the host deals the packs.',
    suggestion: '“Ready to draft.”',
  },
  'start-the-draft': {
    label: 'Start the draft',
    when: 'Plays for the whole table when picking opens.',
    suggestion: '“Start the draft!”',
  },
  'count-30': {
    label: '30 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Thirty seconds remaining.”',
  },
  'count-15': {
    label: '15 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Fifteen seconds remaining.”',
  },
  'count-5': {
    label: '5 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Five seconds remaining!”',
  },
  'time-is-up': {
    label: 'Time is up',
    when: 'Plays when the pick timer runs out.',
    suggestion: '“Time is up.”',
  },
}

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
)

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
)

interface Props {
  clip: VoicePackClipType
  /** This slot's audio, recorded or picked or restored — undefined while empty. */
  file: File | undefined
  /** Object URL for `file`, so the creator can hear their own take. */
  previewUrl: string | undefined
  /** Whether the DEFAULT pack's example for this clip is currently playing. */
  playingExample: boolean
  onPick: (clip: VoicePackClipType, file: File | null) => void
  onDiscard: (clip: VoicePackClipType) => void
  onToggleExample: (clip: VoicePackClipType) => void
  /** Hands the file input up, so discarding can reset it (see the form). */
  registerInput: (clip: VoicePackClipType, el: HTMLInputElement | null) => void
}

export default function CreatorClipRow({
  clip,
  file,
  previewUrl,
  playingExample,
  onPick,
  onDiscard,
  onToggleExample,
  registerInput,
}: Props) {
  const guide = CLIP_GUIDE[clip]

  return (
    <div className="creator-vp-clip">
      <div className="creator-vp-clip-head">
        <span className="creator-vp-clip-label">{guide.label}</span>
        {file && <span className="creator-vp-clip-ok">Ready</span>}
      </div>
      <p className="creator-vp-clip-when">{guide.when}</p>
      <div className="creator-vp-clip-suggestion-row">
        <p className="creator-vp-clip-suggestion">Suggested: {guide.suggestion}</p>
        <Button
          variant="interactive"
          size="xs"
          textOnly
          className="creator-vp-example"
          onClick={() => onToggleExample(clip)}
          aria-label={
            playingExample
              ? `Stop the example for ${guide.label}`
              : `Play the example for ${guide.label}`
          }
        >
          {playingExample ? <StopIcon /> : <PlayIcon />}
          <span>{playingExample ? 'Stop' : 'Example'}</span>
        </Button>
      </div>
      <ClipRecorder
        clip={clip}
        label={guide.label}
        hasClip={Boolean(file)}
        onRecorded={(recorded) => onPick(clip, recorded)}
      />
      <input
        className="creator-vp-file"
        type="file"
        accept={AUDIO_ACCEPT}
        ref={(el) => registerInput(clip, el)}
        onChange={(e) => onPick(clip, e.target.files?.[0] ?? null)}
      />
      {previewUrl && (
        <div className="creator-vp-clip-preview">
          <audio className="creator-vp-audio" controls src={previewUrl} />
          <Button
            variant="danger"
            size="sm"
            className="creator-vp-discard"
            onClick={() => onDiscard(clip)}
            aria-label={`Discard the audio for ${guide.label}`}
          >
            <TrashIcon />
            <span>Discard</span>
          </Button>
        </div>
      )}
    </div>
  )
}
