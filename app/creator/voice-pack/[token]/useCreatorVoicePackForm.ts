'use client'

/**
 * State and actions behind the alpha creator voice-pack form.
 *
 * The same rules as the legacy CreatorVoicePackForm (which keeps its own copy
 * until the alpha rollout retires it):
 *
 * - Two ways in, one way out: a recorded take, a picked file, a restored draft
 *   and "Use default" all land in `clips` as a File, so there is one submit
 *   path and one set of checks.
 * - The link is durable: with `published`, fields prefill, filled slots play
 *   their live audio, and only replaced pieces are uploaded.
 * - Layers, strongest first: live typing, then the draft saved on this
 *   device, then what is published. A draft only overwrites a published text
 *   field when it holds something.
 * - The work survives the tab (useVoicePackDraft), and the draft is wiped
 *   once a submit succeeds.
 *
 * Client size checks are a courtesy; the server re-validates everything.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { MAX_CLIP_BYTES, MAX_LOGO_BYTES } from '@/src/services/voicePackUploads'
import { CLIP_GUIDE } from '@/src/services/voicePackClipGuide'
import { voicePackAssetUrl } from '@/src/utils/voicePackAssets'

const MB = 1024 * 1024
type TextField = 'code' | 'displayName' | 'creatorName'

export default function useCreatorVoicePackForm({
  token,
  note,
  published,
}: {
  token: string
  note: string | null
  published: PublishedVoicePack | null
}) {
  const [code, setCode] = useState(published?.code ?? '')
  const [displayName, setDisplayName] = useState(published?.displayName ?? note ?? '')
  const [creatorName, setCreatorName] = useState(published?.creatorName ?? '')
  const [clips, setClips] = useState<Partial<Record<VoicePackClipType, File>>>({})
  const [logo, setLogo] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedCode, setSavedCode] = useState<string | null>(null)
  const [savedMode, setSavedMode] = useState<'created' | 'updated'>('created')

  /** Live audio for slots already published, versioned past the browser cache. */
  const publishedClips = useMemo(() => {
    const urls: Partial<Record<VoicePackClipType, string>> = {}
    if (!published) return urls
    for (const { clip, version } of published.clips) urls[clip] = `${publishedClipUrl(published.id, clip)}?v=${version}`
    return urls
  }, [published])

  const publishedLogo = published?.hasLogo ? `${publishedLogoUrl(published.id)}?v=${published.logoVersion}` : null

  const draft = useVoicePackDraft(token)
  const { restored, saveText, saveClip, removeClip, clear: clearDraft } = draft

  // Object URLs are revoked on unmount or the tab leaks a blob per re-pick.
  const urlsRef = useRef<string[]>([])
  const [clipUrls, setClipUrls] = useState<Partial<Record<VoicePackClipType, string>>>({})
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const fileInputsRef = useRef<Partial<Record<VoicePackClipType, HTMLInputElement | null>>>({})
  // Set on the first keystroke, so a late restore never overwrites live typing.
  const typedRef = useRef(false)

  // One example plays at a time, on its own element.
  const exampleAudioRef = useRef<HTMLAudioElement | null>(null)
  const [playingExample, setPlayingExample] = useState<VoicePackClipType | null>(null)
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

  function trackUrl(file: File): string {
    const url = URL.createObjectURL(file)
    urlsRef.current.push(url)
    return url
  }

  useEffect(() => {
    if (!restored) return
    if (restored.text && !typedRef.current) {
      const text = restored.text
      const keep = (drafted: string, live: string) => (published && drafted.trim() === '' ? live : drafted)
      setCode((live) => keep(text.code, live))
      setDisplayName((live) => keep(text.displayName, live))
      setCreatorName((live) => keep(text.creatorName, live))
    }
    if (restored.logo) {
      const restoredLogo = restored.logo
      setLogo((prev) => prev ?? restoredLogo)
      setLogoUrl((prev) => prev ?? trackUrl(restoredLogo))
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
    // Restore runs once, when the draft hook reports what was on this device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  /** Text autosave on the keystroke, never on mount: looking stores nothing. */
  function setText(field: TextField, value: string) {
    typedRef.current = true
    if (field === 'code') setCode(value)
    if (field === 'displayName') setDisplayName(value)
    if (field === 'creatorName') setCreatorName(value)
    saveText({ code, displayName, creatorName, [field]: value })
  }

  function pickClip(clip: VoicePackClipType, file: File | null) {
    setErrorMessage(null)
    if (!file) return
    if (file.size > MAX_CLIP_BYTES) {
      setErrorMessage(`${CLIP_GUIDE[clip].label}: that file is over ${MAX_CLIP_BYTES / MB} MB.`)
      return
    }
    setClips((prev) => ({ ...prev, [clip]: file }))
    setClipUrls((prev) => ({ ...prev, [clip]: trackUrl(file) }))
    saveClip(clip, file)
  }

  /** Take the default pack's line (the audio Example plays) as this clip. */
  async function takeDefaultClip(clip: VoicePackClipType) {
    if (usingDefault) return
    setErrorMessage(null)
    setUsingDefault(clip)
    try {
      const response = await fetch(voicePackAssetUrl(clip))
      if (!response.ok) throw new Error(String(response.status))
      const blob = await response.blob()
      pickClip(clip, new File([blob], `${clip}.mp3`, { type: blob.type || 'audio/mpeg' }))
    } catch {
      setErrorMessage(`${CLIP_GUIDE[clip].label}: the default line could not be loaded. Record or upload one instead.`)
    } finally {
      setUsingDefault(null)
    }
  }

  function registerClipInput(clip: VoicePackClipType, el: HTMLInputElement | null) {
    fileInputsRef.current[clip] = el
  }

  /** Throw one take away: page state, preview, file picker and saved draft. */
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
      setErrorMessage(`Logo: that image is over ${MAX_LOGO_BYTES / MB} MB.`)
      return
    }
    setLogo(file)
    setLogoUrl(trackUrl(file))
    saveClip(VOICE_PACK_LOGO_SLOT, file)
  }

  const normalizedCode = normalizeVoicePackCode(code)
  const codeOk = isValidVoicePackCode(normalizedCode)
  const missingClips = VOICE_PACK_CLIP_TYPES.filter((clip) => !clips[clip] && !publishedClips[clip])
  const hasLogo = logo !== null || publishedLogo !== null
  const canSubmit = codeOk && displayName.trim().length > 0 && missingClips.length === 0 && hasLogo && status !== 'submitting'

  async function submit() {
    if (!canSubmit) return
    setStatus('submitting')
    setErrorMessage(null)
    try {
      const form = new FormData()
      form.set('token', token)
      form.set('code', normalizedCode)
      form.set('displayName', displayName)
      if (creatorName.trim()) form.set('creatorName', creatorName)
      // Only what this sitting produced; an omitted part keeps what is published.
      for (const clip of VOICE_PACK_CLIP_TYPES) {
        const file = clips[clip]
        if (file) form.set(clip, file)
      }
      if (logo) form.set('logo', logo)
      const res = await fetch('/api/voice-packs/submit', { method: 'POST', body: form })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message ?? `Upload failed (HTTP ${res.status})`)
      clearDraft()
      setSavedCode(json.data.code as string)
      setSavedMode(json.data.mode === 'updated' ? 'updated' : 'created')
      setStatus('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }

  return {
    code,
    displayName,
    creatorName,
    setText,
    normalizedCode,
    codeOk,
    clips,
    clipUrls,
    publishedClips,
    logo,
    logoUrl,
    publishedLogo,
    draftNotice: draft.notice,
    missingClips,
    canSubmit,
    status,
    errorMessage,
    savedCode,
    savedMode,
    playingExample,
    usingDefault,
    pickClip,
    takeDefaultClip,
    discardClip,
    registerClipInput,
    toggleExample,
    pickLogo,
    submit,
  }
}
