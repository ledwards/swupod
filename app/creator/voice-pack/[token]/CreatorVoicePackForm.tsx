'use client'

/**
 * CreatorVoicePackForm — the one-time upload form behind an admin-minted link.
 *
 * The creator picks a redemption code, names the pack, records the 7 cue lines and
 * uploads a logo. Every clip gets a real <audio controls> preview built from an object
 * URL so they can hear exactly what a table will hear before submitting.
 *
 * TWO WAYS IN, ONE WAY OUT: a clip can be recorded in the browser (ClipRecorder →
 * MediaRecorder → File) or chosen with the file picker. Both land in the same `clips`
 * map as a `File`, so there is exactly one submit path and one set of validation
 * rules. The recorder is additive — it hides itself where MediaRecorder or the mic is
 * unavailable, and the picker always remains. A restored draft is a third door into
 * that same map, and is likewise just a `File`.
 *
 * THE WORK SURVIVES THE TAB. Recording seven lines takes more than one sitting, and
 * the invite link is not spent by looking at it — only a successful submit spends it.
 * `useVoicePackDraft` therefore restores this token's clips and typed fields on mount
 * and writes every change back (blobs to IndexedDB, text to localStorage), then wipes
 * the draft once the pack is published so a spent link never shows ghost data. Where
 * storage is unavailable the hook degrades to nothing and the form behaves as before.
 *
 * Client-side size checks are a courtesy (fail fast on a 20 MB WAV); the server
 * re-validates declared mime, magic bytes and size on every part and is the only
 * authority. Submitting consumes the link.
 */
import { useEffect, useRef, useState } from 'react'
import Button from '@/src/components/Button'
import useVoicePackDraft from '@/src/hooks/useVoicePackDraft'
import {
  VOICE_PACK_CLIP_TYPES,
  normalizeVoicePackCode,
  isValidVoicePackCode,
  type VoicePackClipType,
} from '@/src/services/voicePacks'
import {
  IMAGE_ACCEPT,
  MAX_CLIP_BYTES,
  MAX_LOGO_BYTES,
} from '@/src/services/voicePackUploads'
import { voicePackAssetUrl } from '@/src/utils/voicePackAssets'
import CreatorClipRow, { CLIP_GUIDE } from './CreatorClipRow'
import '@/src/styles/backgrounds.css'
import './creator-voice-pack.css'

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

  const draft = useVoicePackDraft(token)
  const { restored, saveText, saveClip, removeClip, clear: clearDraft } = draft

  // Object URLs must be revoked or the tab leaks a blob per re-pick.
  const urlsRef = useRef<string[]>([])
  const [clipUrls, setClipUrls] = useState<Partial<Record<VoicePackClipType, string>>>({})
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Re-picking the same file only fires onChange if the input was reset, so the
  // discard control needs a handle on each picker.
  const fileInputsRef = useRef<Partial<Record<VoicePackClipType, HTMLInputElement | null>>>({})

  // Set the moment the creator edits a text field, so a restore arriving late
  // cannot overwrite what they are in the middle of typing.
  const typedRef = useRef(false)

  // ONE example plays at a time, on its own element — a creator's own preview
  // player is never hijacked or reset by hearing the default pack.
  const exampleAudioRef = useRef<HTMLAudioElement | null>(null)
  const [playingExample, setPlayingExample] = useState<VoicePackClipType | null>(null)

  useEffect(() => {
    const urls = urlsRef.current
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  useEffect(
    () => () => {
      exampleAudioRef.current?.pause()
      exampleAudioRef.current = null
    },
    []
  )

  // Restore runs once, when the hook reports what was on this device. Anything the
  // creator has already touched during the (sub-second) load wins over the draft.
  useEffect(() => {
    if (!restored) return
    // A saved draft is authoritative over the invite's suggested pack name — the
    // creator may well have renamed it — but never over live typing.
    if (restored.text && !typedRef.current) {
      setCode(restored.text.code)
      setDisplayName(restored.text.displayName)
      setCreatorName(restored.text.creatorName)
    }
    const restoredClips = restored.clips
    if (Object.keys(restoredClips).length === 0) return
    setClips((prev) => ({ ...restoredClips, ...prev }))
    setClipUrls((prev) => {
      const next = { ...prev }
      for (const clip of VOICE_PACK_CLIP_TYPES) {
        const file = restoredClips[clip]
        if (file && !next[clip]) next[clip] = trackUrl(file)
      }
      return next
    })
  }, [restored])

  /**
   * Text autosave, driven by the keystroke rather than by a state effect: a
   * creator who only LOOKS at the page must store nothing, or their next visit
   * would claim to have restored work they never did. The hook debounces.
   */
  function saveTypedText(next: Partial<Record<'code' | 'displayName' | 'creatorName', string>>) {
    typedRef.current = true
    saveText({ code, displayName, creatorName, ...next })
  }

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
    saveClip(clip, file)
  }

  function registerClipInput(clip: VoicePackClipType, el: HTMLInputElement | null) {
    fileInputsRef.current[clip] = el
  }

  /** Throw one clip away: page state, preview, file picker and stored draft alike. */
  function discardClip(clip: VoicePackClipType) {
    setErrorMessage(null)
    setClips((prev) => {
      const next = { ...prev }
      delete next[clip]
      return next
    })
    setClipUrls((prev) => {
      const url = prev[clip]
      if (url) {
        URL.revokeObjectURL(url)
        urlsRef.current = urlsRef.current.filter((u) => u !== url)
      }
      const next = { ...prev }
      delete next[clip]
      return next
    })
    const input = fileInputsRef.current[clip]
    if (input) input.value = ''
    removeClip(clip)
  }

  /** Play (or stop) the default pack's version of one line. */
  function toggleExample(clip: VoicePackClipType) {
    let audio = exampleAudioRef.current
    if (!audio) {
      audio = new Audio()
      audio.addEventListener('ended', () => setPlayingExample(null))
      audio.addEventListener('error', () => setPlayingExample(null))
      exampleAudioRef.current = audio
    }
    audio.pause()
    if (playingExample === clip) {
      setPlayingExample(null)
      return
    }
    audio.src = voicePackAssetUrl(clip)
    audio.currentTime = 0
    setPlayingExample(clip)
    audio.play().catch(() => setPlayingExample(null))
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
      // The link is spent and the pack is live — the draft would only ever come
      // back as ghost data on a dead link.
      clearDraft()
      setSavedCode(json.data.code as string)
      setStatus('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }

  if (status === 'done' && savedCode) {
    return (
      <div className="creator-vp-page page-background">
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
    <div className="creator-vp-page page-background">
      <div className="creator-vp-card">
        <h1 className="creator-vp-title">Build your voice pack</h1>
        <p className="creator-vp-copy">
          Record seven short lines and pick a redemption code. Players who enter your code
          unlock your voice for their drafts — when they host, everyone at their table
          hears you.
        </p>
        <p className="creator-vp-fineprint">
          Record each line right here with your mic, or upload audio you already have —
          either way you can play it back before you publish. This link works once. Audio
          files up to {MAX_CLIP_BYTES / KB} KB each (MP3, M4A, OGG, WAV or WebM); logo up
          to {MAX_LOGO_BYTES / KB / KB} MB (PNG, JPEG, WebP or GIF).
        </p>

        {draft.notice && (
          <p className="creator-vp-restored" role="status">
            {draft.notice}
            {logo === null && ' Your logo is not saved here — choose it again before you publish.'}
          </p>
        )}

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
              onChange={(e) => {
                setDisplayName(e.target.value)
                saveTypedText({ displayName: e.target.value })
              }}
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
              onChange={(e) => {
                setCreatorName(e.target.value)
                saveTypedText({ creatorName: e.target.value })
              }}
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
              onChange={(e) => {
                setCode(e.target.value)
                saveTypedText({ code: e.target.value })
              }}
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
          <h2 className="creator-vp-section-title">Audio Script</h2>
          {VOICE_PACK_CLIP_TYPES.map((clip) => (
            <CreatorClipRow
              key={clip}
              clip={clip}
              file={clips[clip]}
              previewUrl={clipUrls[clip]}
              playingExample={playingExample === clip}
              onPick={pickClip}
              onDiscard={discardClip}
              onToggleExample={toggleExample}
              registerInput={registerClipInput}
            />
          ))}
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
