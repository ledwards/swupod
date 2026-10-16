'use client'

/**
 * One cue card of the alpha creator form. Presentational: every piece of
 * state lives in useCreatorVoicePackForm.
 *
 * A card has three states that must never look alike: empty ("Needed"),
 * holding the audio this pack already publishes ("Published", with its own
 * player), or holding a new local take ("Ready", or "New take" when it will
 * replace published audio), with Discard. Discarding destroys work, so it is
 * the danger variant with the trash icon.
 */
import { useRef } from 'react'
import Button from '@/src/components/Button'
import ClipRecorder from '@/src/components/ClipRecorder'
import { PlayIcon, StopIcon, TrashIcon } from '@/src/components/ThemedPage/icons'
import { CLIP_GUIDE } from '@/src/services/voicePackClipGuide'
import { type VoicePackClipType } from '@/src/services/voicePacks'
import { AUDIO_ACCEPT } from '@/src/services/voicePackUploads'

interface Props {
  clip: VoicePackClipType
  file: File | undefined
  previewUrl: string | undefined
  publishedUrl: string | undefined
  playingExample: boolean
  usingDefault: boolean
  onPick: (clip: VoicePackClipType, file: File | null) => void
  onDiscard: (clip: VoicePackClipType) => void
  onToggleExample: (clip: VoicePackClipType) => void
  onUseDefault: (clip: VoicePackClipType) => void
  registerInput: (clip: VoicePackClipType, el: HTMLInputElement | null) => void
}

export default function CreatorClipRowAlpha({
  clip,
  file,
  previewUrl,
  publishedUrl,
  playingExample,
  usingDefault,
  onPick,
  onDiscard,
  onToggleExample,
  onUseDefault,
  registerInput,
}: Props) {
  const guide = CLIP_GUIDE[clip]
  const inputRef = useRef<HTMLInputElement | null>(null)
  const showPublished = !file && Boolean(publishedUrl)

  return (
    <div className="tpage-raised cvpa-clip">
      <div className="cvpa-clip-head">
        <b>{guide.label}</b>
        {file ? (
          <span className="tpage-tag tpage-tag--success">{publishedUrl ? 'New take' : 'Ready'}</span>
        ) : showPublished ? (
          <span className="tpage-tag tpage-tag--accent">Published</span>
        ) : (
          <span className="tpage-tag tpage-tag--muted">Needed</span>
        )}
      </div>
      <p className="tpage-meta">{guide.when}</p>
      <div className="cvpa-suggest">
        <p className="tpage-muted cvpa-suggest-line">Suggested: {guide.suggestion}</p>
        <Button
          size="xs"
          onClick={() => onToggleExample(clip)}
          aria-label={playingExample ? `Stop the example for ${guide.label}` : `Play the example for ${guide.label}`}
        >
          {playingExample ? <StopIcon /> : <PlayIcon />}
          <span>{playingExample ? 'Stop' : 'Example'}</span>
        </Button>
        <Button
          size="xs"
          disabled={usingDefault}
          onClick={() => onUseDefault(clip)}
          aria-label={`Use the default line for ${guide.label}`}
        >
          {usingDefault ? 'Adding…' : 'Use Default'}
        </Button>
      </div>

      {showPublished && (
        <div className="cvpa-audio-row">
          <audio className="cvpa-audio" controls src={publishedUrl} />
          <span className="tpage-meta">This is what plays now</span>
        </div>
      )}

      {previewUrl && (
        <div className="cvpa-audio-row">
          <audio className="cvpa-audio" controls src={previewUrl} />
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDiscard(clip)}
            aria-label={
              publishedUrl
                ? `Discard this new take for ${guide.label} and keep the published one`
                : `Discard the audio for ${guide.label}`
            }
          >
            <TrashIcon />
            <span>Discard</span>
          </Button>
        </div>
      )}

      <div className="cvpa-take">
        <ClipRecorder clip={clip} label={guide.label} hasClip={Boolean(file)} onRecorded={(recorded) => onPick(clip, recorded)} />
        <Button size="sm" onClick={() => inputRef.current?.click()} aria-label={`Upload audio for ${guide.label}`}>
          Upload
        </Button>
        <input
          className="cvpa-file"
          type="file"
          accept={AUDIO_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          ref={(el) => {
            inputRef.current = el
            registerInput(clip, el)
          }}
          onChange={(e) => onPick(clip, e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  )
}
