'use client'

/**
 * CreatorVoicePackForm — the form behind an admin-minted creator link, for both
 * the first publish and every change after it.
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
 * THE LINK IS DURABLE. Once a pack has been published from this token, `published`
 * arrives with it and the form becomes an editor: fields prefill, every filled slot
 * plays its LIVE audio from the public asset route, and only the pieces the creator
 * actually replaces are uploaded. A slot they never touch is not sent at all and
 * keeps the audio it already has.
 *
 * THREE LAYERS, IN THIS ORDER: what the creator does right now beats a draft saved
 * on this device, which beats what is published. That ordering is why a saved draft
 * can only OVERWRITE a published text field when it actually holds something (an
 * empty draft must never blank a live pack's name), and why a local file for a slot
 * hides that slot's published player — it is the take that will replace it.
 *
 * THE WORK SURVIVES THE TAB. `useVoicePackDraft` restores this token's clips, logo
 * and typed fields on mount and writes every change back (blobs to IndexedDB, text
 * to localStorage), then wipes the draft once a submit succeeds — at which point the
 * server holds the work and a stale local copy could only misrepresent it. Where
 * storage is unavailable the hook degrades to nothing.
 *
 * Client-side size checks are a courtesy (fail fast on a 20 MB WAV); the server
 * re-validates declared mime, magic bytes and size on every part and is the only
 * authority.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/src/components/Button'
import { VOICE_PACK_LOGO_SLOT } from '@/src/services/voicePackDraft'
import useVoicePackDraft from '@/src/hooks/useVoicePackDraft'
import type { PublishedVoicePack } from '@/lib/voicePackInvite'
import {
  VOICE_PACK_CLIP_TYPES,
  normalizeVoicePackCode,
  isValidVoicePackCode,
  voicePackAssetUrl as publishedClipUrl,
  voicePackLogoUrl as publishedLogoUrl,
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
  /** The pack this link has already published, or null on a first visit. */
  published: PublishedVoicePack | null
}

export default function CreatorVoicePackForm({ token, note, published }: Props) {
  const [code, setCode] = useState(published?.code ?? '')
  const [displayName, setDisplayName] = useState(published?.displayName ?? note ?? '')
  const [creatorName, setCreatorName] = useState(published?.creatorName ?? '')
  const [clips, setClips] = useState<Partial<Record<VoicePackClipType, File>>>({})
  const [logo, setLogo] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedCode, setSavedCode] = useState<string | null>(null)
  // Which kind of submit succeeded. Captured at submit time because `published`
  // is server data and does not change under a client-side publish.
  const [savedMode, setSavedMode] = useState<'created' | 'updated'>('created')

  /**
   * Live audio URLs for the slots this pack has already published, versioned so a
   * replaced line is never answered out of the browser cache.
   */
  const publishedClips = useMemo(() => {
    const urls: Partial<Record<VoicePackClipType, string>> = {}
    if (!published) return urls
    for (const { clip, version } of published.clips) {
      urls[clip] = `${publishedClipUrl(published.id, clip)}?v=${version}`
    }
    return urls
  }, [published])

  const publishedLogo = published?.hasLogo
    ? `${publishedLogoUrl(published.id)}?v=${published.logoVersion}`
    : null

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
  /** The clip currently being fetched from the default pack, if any. */
  const [usingDefault, setUsingDefault] = useState<VoicePackClipType | null>(null)

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
    //
    // Against a PUBLISHED pack it is authoritative only where it actually holds
    // something: an old, half-empty draft on this device must not blank the name
    // or code of a pack players have already unlocked.
    if (restored.text && !typedRef.current) {
      const keep = (drafted: string, live: string) =>
        published && drafted.trim() === '' ? live : drafted
      setCode((live) => keep(restored.text!.code, live))
      setDisplayName((live) => keep(restored.text!.displayName, live))
      setCreatorName((live) => keep(restored.text!.creatorName, live))
    }
    // Before the clips early-return: a draft can hold a logo and no clips.
    if (restored.logo) {
      setLogo((prev) => prev ?? restored.logo)
      setLogoUrl((prev) => prev ?? trackUrl(restored.logo as File))
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
      setErrorMessage(`${CLIP_GUIDE[clip].label}: that file is over ${MAX_CLIP_BYTES / KB / KB} MB.`)
      return
    }
    setClips((prev) => ({ ...prev, [clip]: file }))
    setClipUrls((prev) => ({ ...prev, [clip]: trackUrl(file) }))
    saveClip(clip, file)
  }

  /**
   * Take our own American English line for this cue as the creator's clip.
   *
   * It is the same audio the Example button plays, fetched and handed to
   * `pickClip` as if the creator had chosen the file themselves — so it lands in
   * page state, the preview player and the saved draft by exactly one path, and
   * can be discarded like any other take.
   *
   * A pack is only publishable with every slot filled, and a creator who wants
   * their voice on the calls but not on "Sound on" had no way through that
   * without recording lines they did not care about.
   */
  async function useDefaultClip(clip: VoicePackClipType) {
    if (usingDefault) return
    setErrorMessage(null)
    setUsingDefault(clip)
    try {
      // No pack id: the same default the Example button plays, so the button and
      // the audio it hands over can never drift apart.
      const response = await fetch(voicePackAssetUrl(clip))
      if (!response.ok) throw new Error(String(response.status))
      const blob = await response.blob()
      pickClip(clip, new File([blob], `${clip}.mp3`, { type: blob.type || 'audio/mpeg' }))
    } catch {
      setErrorMessage(
        `${CLIP_GUIDE[clip].label}: the default line could not be loaded. Record or upload one instead.`
      )
    } finally {
      setUsingDefault(null)
    }
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
    saveClip(VOICE_PACK_LOGO_SLOT, file)
  }

  const normalizedCode = normalizeVoicePackCode(code)
  const codeOk = isValidVoicePackCode(normalizedCode)
  // A slot counts as filled by a new take OR by the audio already published for
  // it — an edit only has to supply what is actually changing.
  const missingClips = VOICE_PACK_CLIP_TYPES.filter(
    (clip) => !clips[clip] && !publishedClips[clip]
  )
  const hasLogo = logo !== null || publishedLogo !== null
  const canSubmit =
    codeOk &&
    displayName.trim().length > 0 &&
    missingClips.length === 0 &&
    hasLogo &&
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
      // Only what this sitting produced goes over the wire. An omitted part means
      // "keep what is published" — the creator does not re-upload six untouched
      // lines to change the seventh.
      for (const clip of VOICE_PACK_CLIP_TYPES) {
        const file = clips[clip]
        if (file) form.set(clip, file)
      }
      if (logo) form.set('logo', logo)

      const res = await fetch('/api/voice-packs/submit', { method: 'POST', body: form })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? `Upload failed (HTTP ${res.status})`)
      }
      // The server now holds this work. A local draft could only misrepresent it
      // from here — and the next visit reloads the pack itself.
      clearDraft()
      setSavedCode(json.data.code as string)
      setSavedMode(json.data.mode === 'updated' ? 'updated' : 'created')
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
          <h1 className="creator-vp-title">
            {savedMode === 'updated' ? 'Your changes are live' : 'Your voice pack is live'}
          </h1>
          <p className="creator-vp-copy">
            {savedMode === 'updated'
              ? 'Everyone who has already unlocked your pack hears the new version — they do not need to redeem anything again.'
              : 'Share this code with your audience. Anyone who enters it at protectthepod.com/redeem unlocks your pack on their account forever, and can use it for every draft they host.'}
          </p>
          <div className="creator-vp-code-badge">{savedCode}</div>
          <p className="creator-vp-fineprint">
            Keep this link — it is how you come back and change your pack. Rerecord a line,
            swap your logo, rename it: the same link opens your pack with everything already
            in it, and your code and everyone who has unlocked it stay exactly as they are.
          </p>
          <div className="creator-vp-actions">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Make more changes
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="creator-vp-page page-background">
      <div className="creator-vp-card">
        <h1 className="creator-vp-title">
          {published ? 'Update your voice pack' : 'Build your voice pack'}
        </h1>
        <p className="creator-vp-copy">
          {published
            ? 'Everything you published is here. Change what you like and publish again — anyone who has already redeemed your code hears the new version straight away.'
            : `Record ${VOICE_PACK_CLIP_TYPES.length} short lines and pick a redemption code. Players who enter your code unlock your voice for their drafts — when they host, everyone at their table hears you.`}
        </p>
        <p className="creator-vp-fineprint">
          Record each line right here with your mic, or upload audio you already have —
          either way you can play it back before you publish.{' '}
          {published
            ? 'A line you leave alone keeps the audio it already has.'
            : 'Bookmark this link: it is how you come back and change your pack later.'}{' '}
          Audio files up to {MAX_CLIP_BYTES / KB / KB} MB each (MP3, M4A, OGG, WAV or WebM); logo
          up to {MAX_LOGO_BYTES / KB / KB} MB (PNG, JPEG, WebP or GIF).
        </p>

        {draft.notice && (
          <p className="creator-vp-restored" role="status">
            {draft.notice}
            {logo === null &&
              publishedLogo === null &&
              ' Your logo is not saved here — choose it again before you publish.'}
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
              {/* The published logo stands in until a new one is chosen, so a slot
                  that is already filled never reads as empty. */}
              {(logoUrl || publishedLogo) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="creator-vp-logo-preview"
                  src={logoUrl ?? (publishedLogo as string)}
                  alt={logoUrl ? 'Your new pack logo' : 'Your published pack logo'}
                />
              )}
            </div>
            {publishedLogo && (
              <span className="creator-vp-hint">
                {logoUrl
                  ? 'This new image replaces your published logo when you publish.'
                  : 'This is your published logo. Choose a file to replace it.'}
              </span>
            )}
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
              publishedUrl={publishedClips[clip]}
              playingExample={playingExample === clip}
              onPick={pickClip}
              onDiscard={discardClip}
              onToggleExample={toggleExample}
              onUseDefault={useDefaultClip}
              usingDefault={usingDefault === clip}
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
            {status === 'submitting'
              ? 'Uploading…'
              : published
                ? 'Publish my changes'
                : 'Publish my voice pack'}
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
