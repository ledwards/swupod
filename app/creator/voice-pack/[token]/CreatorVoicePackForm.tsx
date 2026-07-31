'use client'

/**
 * CreatorVoicePackForm — the one-time upload form behind an admin-minted link.
 *
 * The creator picks a redemption code, names the pack, records the 7 cue lines and
 * uploads a logo. Every clip gets a real <audio controls> preview built from an object
 * URL so they can hear exactly what a table will hear before submitting.
 *
 * Client-side size checks are a courtesy (fail fast on a 20 MB WAV); the server
 * re-validates declared mime, magic bytes and size on every part and is the only
 * authority. Submitting consumes the link.
 */
import { useEffect, useRef, useState } from 'react'
import Button from '@/src/components/Button'
import {
  VOICE_PACK_CLIP_TYPES,
  normalizeVoicePackCode,
  isValidVoicePackCode,
  type VoicePackClipType,
} from '@/src/services/voicePacks'
import {
  AUDIO_ACCEPT,
  IMAGE_ACCEPT,
  MAX_CLIP_BYTES,
  MAX_LOGO_BYTES,
} from '@/src/services/voicePackUploads'
import './creator-voice-pack.css'

/** What each cue is for, in the creator's language, with a suggested line. */
const CLIP_GUIDE: Record<VoicePackClipType, { label: string; when: string; suggestion: string }> = {
  greeting: {
    label: 'Greeting',
    when: 'Plays when someone unlocks your pack, and any time they click your logo.',
    suggestion: '“Hey — welcome to the pod!”',
  },
  'ready-the-draft': {
    label: 'Ready the draft',
    when: 'Plays for the whole table when the host deals the packs.',
    suggestion: '“Ready the draft.”',
  },
  'start-the-draft': {
    label: 'Start the draft',
    when: 'Plays for the whole table when picking opens.',
    suggestion: '“Start the draft!”',
  },
  'count-30': {
    label: '30 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Thirty seconds.”',
  },
  'count-15': {
    label: '15 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Fifteen seconds.”',
  },
  'count-5': {
    label: '5 seconds left',
    when: 'Pick-timer warning.',
    suggestion: '“Five seconds!”',
  },
  'time-is-up': {
    label: 'Time is up',
    when: 'Plays when the pick timer runs out.',
    suggestion: '“Time is up.”',
  },
}

const KB = 1024

interface Props {
  token: string
  note: string | null
}

export default function CreatorVoicePackForm({ token, note }: Props) {
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState(note ?? '')
  const [creatorName, setCreatorName] = useState('')
  const [clips, setClips] = useState<Partial<Record<VoicePackClipType, File>>>({})
  const [logo, setLogo] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedCode, setSavedCode] = useState<string | null>(null)

  // Object URLs must be revoked or the tab leaks a blob per re-pick.
  const urlsRef = useRef<string[]>([])
  const [clipUrls, setClipUrls] = useState<Partial<Record<VoicePackClipType, string>>>({})
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    const urls = urlsRef.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  function trackUrl(file: File): string {
    const url = URL.createObjectURL(file)
    urlsRef.current.push(url)
    return url
  }

  function pickClip(clip: VoicePackClipType, file: File | null) {
    setErrorMessage(null)
    if (!file) return
    if (file.size > MAX_CLIP_BYTES) {
      setErrorMessage(`${CLIP_GUIDE[clip].label}: that file is over ${MAX_CLIP_BYTES / KB} KB.`)
      return
    }
    setClips((prev) => ({ ...prev, [clip]: file }))
    setClipUrls((prev) => ({ ...prev, [clip]: trackUrl(file) }))
  }

  function pickLogo(file: File | null) {
    setErrorMessage(null)
    if (!file) return
    if (file.size > MAX_LOGO_BYTES) {
      setErrorMessage(`Logo: that image is over ${MAX_LOGO_BYTES / KB / KB} MB.`)
      return
    }
    setLogo(file)
    setLogoUrl(trackUrl(file))
  }

  const normalizedCode = normalizeVoicePackCode(code)
  const codeOk = isValidVoicePackCode(normalizedCode)
  const missingClips = VOICE_PACK_CLIP_TYPES.filter((clip) => !clips[clip])
  const canSubmit =
    codeOk &&
    displayName.trim().length > 0 &&
    missingClips.length === 0 &&
    logo !== null &&
    status !== 'submitting'

  async function handleSubmit() {
    if (!canSubmit) return
    setStatus('submitting')
    setErrorMessage(null)
    try {
      const form = new FormData()
      form.set('token', token)
      form.set('code', normalizedCode)
      form.set('displayName', displayName)
      if (creatorName.trim()) form.set('creatorName', creatorName)
      for (const clip of VOICE_PACK_CLIP_TYPES) form.set(clip, clips[clip] as File)
      form.set('logo', logo as File)

      const res = await fetch('/api/voice-packs/submit', { method: 'POST', body: form })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? `Upload failed (HTTP ${res.status})`)
      }
      setSavedCode(json.data.code as string)
      setStatus('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }

  if (status === 'done' && savedCode) {
    return (
      <div className="creator-vp-page">
        <div className="creator-vp-card creator-vp-card--done">
          <h1 className="creator-vp-title">Your voice pack is live</h1>
          <p className="creator-vp-copy">
            Share this code with your audience. Anyone who enters it at{' '}
            <strong>protectthepod.com/redeem</strong> unlocks your pack on their account
            forever, and can use it for every draft they host.
          </p>
          <div className="creator-vp-code-badge">{savedCode}</div>
          <p className="creator-vp-fineprint">
            This upload link has now been used up. Ask for a new one if you need to change
            anything.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="creator-vp-page">
      <div className="creator-vp-card">
        <h1 className="creator-vp-title">Build your voice pack</h1>
        <p className="creator-vp-copy">
          Record seven short lines and pick a redemption code. Players who enter your code
          unlock your voice for their drafts — when they host, everyone at their table
          hears you.
        </p>
        <p className="creator-vp-fineprint">
          This link works once. Audio files up to {MAX_CLIP_BYTES / KB} KB each (MP3, M4A,
          OGG, WAV or WebM); logo up to {MAX_LOGO_BYTES / KB / KB} MB (PNG, JPEG, WebP or
          GIF).
        </p>

        <section className="creator-vp-section">
          <h2 className="creator-vp-section-title">Your pack</h2>

          <label className="creator-vp-field">
            <span className="creator-vp-label">Pack name</span>
            <input
              className="creator-vp-input"
              type="text"
              value={displayName}
              maxLength={60}
              placeholder="e.g. The Pod Cast Voice Pack"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

          <label className="creator-vp-field">
            <span className="creator-vp-label">Your name (optional)</span>
            <input
              className="creator-vp-input"
              type="text"
              value={creatorName}
              maxLength={60}
              placeholder="Shown under the pack name"
              onChange={(e) => setCreatorName(e.target.value)}
            />
          </label>

          <label className="creator-vp-field">
            <span className="creator-vp-label">Redemption code</span>
            <input
              className="creator-vp-input creator-vp-input--code"
              type="text"
              value={code}
              maxLength={24}
              placeholder="PODCAST26"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
            />
            <span className="creator-vp-hint">
              {code.length === 0
                ? '3–24 letters, numbers and hyphens. Not case-sensitive.'
                : codeOk
                  ? `Players will type: ${normalizedCode}`
                  : 'Use 3–24 letters, numbers and hyphens (no leading or trailing hyphen).'}
            </span>
          </label>

          <div className="creator-vp-field">
            <span className="creator-vp-label">Logo</span>
            <div className="creator-vp-logo-row">
              <input
                className="creator-vp-file"
                type="file"
                accept={IMAGE_ACCEPT}
                onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
              />
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="creator-vp-logo-preview" src={logoUrl} alt="Your pack logo" />
              )}
            </div>
          </div>
        </section>

        <section className="creator-vp-section">
          <h2 className="creator-vp-section-title">The seven lines</h2>
          {VOICE_PACK_CLIP_TYPES.map((clip) => {
            const guide = CLIP_GUIDE[clip]
            const file = clips[clip]
            return (
              <div className="creator-vp-clip" key={clip}>
                <div className="creator-vp-clip-head">
                  <span className="creator-vp-clip-label">{guide.label}</span>
                  {file && <span className="creator-vp-clip-ok">Ready</span>}
                </div>
                <p className="creator-vp-clip-when">{guide.when}</p>
                <p className="creator-vp-clip-suggestion">Suggested: {guide.suggestion}</p>
                <input
                  className="creator-vp-file"
                  type="file"
                  accept={AUDIO_ACCEPT}
                  onChange={(e) => pickClip(clip, e.target.files?.[0] ?? null)}
                />
                {clipUrls[clip] && (
                  <audio className="creator-vp-audio" controls src={clipUrls[clip]} />
                )}
              </div>
            )
          })}
        </section>

        {missingClips.length > 0 && (
          <p className="creator-vp-fineprint">
            Still needed: {missingClips.map((c) => CLIP_GUIDE[c].label).join(', ')}.
          </p>
        )}

        <div className="creator-vp-actions">
          <Button variant="primary" size="lg" disabled={!canSubmit} onClick={handleSubmit}>
            {status === 'submitting' ? 'Uploading…' : 'Publish my voice pack'}
          </Button>
        </div>

        {errorMessage && (
          <div className="creator-vp-error" role="alert">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  )
}
