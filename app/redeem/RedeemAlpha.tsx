'use client'

/**
 * /redeem for alpha viewers: enter a creator's code, unlock their voice pack.
 *
 * Same flow as RedeemLegacy: POST /api/voice-packs/claim; a code you already
 * hold stays on the form with a notice; a new unlock shows the pack, whose
 * logo plays its greeting (the click is the gesture browsers require), and a
 * "Hear It" list of every clip it filled. Nothing plays on arrival, and one
 * player serves the whole page so a second click replaces the first.
 *
 * Signed out: the standard Discord login, which returns here.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import DiscordLoginButton from '@/src/components/DiscordLoginButton'
import FriendOfThePodCTA from '@/src/components/FriendOfThePodCTA'
import ThemedPage, { ThemedPanel } from '@/src/components/ThemedPage/ThemedPage'
import { PlayIcon, StopIcon } from '@/src/components/ThemedPage/icons'
import { normalizeVoicePackCode, type VoicePackClipType } from '@/src/services/voicePacks'
import { CLIP_GUIDE } from '@/src/services/voicePackClipGuide'
import { VOICE_PACK_CLIPS, voicePackAssetUrl } from '@/src/utils/voicePackAssets'
import './redeem-alpha.css'

interface ClaimedPack {
  id: string
  code: string
  displayName: string
  creatorName: string | null
  logoUrl: string
  clips?: VoicePackClipType[]
  greetingUrl: string | null
}

export default function RedeemAlpha() {
  const { user, loading, isPatron } = useAuth() as unknown as {
    user: unknown
    loading: boolean
    /** null while patron status is still resolving: no pitch until it is known. */
    isPatron: boolean | null
  }

  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'claiming' | 'done' | 'owned' | 'error'>('idle')
  const [pack, setPack] = useState<ClaimedPack | null>(null)
  const [ownedPackName, setOwnedPackName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingClip, setPlayingClip] = useState<VoicePackClipType | null>(null)

  const playClip = useCallback((packId: string, clip: VoicePackClipType) => {
    audioRef.current?.pause()
    audioRef.current = null
    // Pressing the clip that is playing stops it.
    if (playingClip === clip) {
      setPlayingClip(null)
      return
    }
    const audio = new Audio(voicePackAssetUrl(clip, packId))
    audio.addEventListener('ended', () => setPlayingClip((c) => (c === clip ? null : c)))
    audioRef.current = audio
    setPlayingClip(clip)
    audio.play().catch(() => setPlayingClip((c) => (c === clip ? null : c)))
  }, [playingClip])

  useEffect(() => () => {
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  async function handleRedeem() {
    setStatus('claiming')
    setErrorMessage(null)
    setOwnedPackName(null)
    try {
      const res = await fetch('/api/voice-packs/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizeVoicePackCode(code) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.message ?? 'That code is not valid.')
      const claimed = json.data.pack as ClaimedPack
      if (json.data.alreadyOwned === true) {
        setOwnedPackName(claimed.displayName)
        setStatus('owned')
        return
      }
      setPack(claimed)
      setStatus('done')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'That code is not valid.')
      setStatus('error')
    }
  }

  const fotp = isPatron === false ? <FriendOfThePodCTA className="rdma-fotp" /> : null

  if (status === 'done' && pack) {
    const filled = pack.clips ?? []
    const hasGreeting = filled.includes('greeting')
    const rows = VOICE_PACK_CLIPS.filter((clip) => filled.includes(clip as VoicePackClipType)) as VoicePackClipType[]
    return (
      <ThemedPage title="Unlocked!" subtitle="A new voice for your drafts" className="rdma-page">
        <div className="rdma-done">
          <ThemedPanel className="rdma-identity" aria-label="Voice Pack Unlocked">
            <span className="tpage-tag tpage-tag--success">Voice Pack Unlocked</span>
            <button
              type="button"
              className={`rdma-logo${playingClip === 'greeting' ? ' is-playing' : ''}`}
              onClick={() => playClip(pack.id, 'greeting')}
              disabled={!hasGreeting}
              aria-label={`Play the greeting from ${pack.displayName}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pack.logoUrl} alt={pack.displayName} />
            </button>
            {hasGreeting && (
              <p className="tpage-meta">
                {playingClip === 'greeting' ? 'Playing the greeting' : 'Tap the logo to hear the greeting'}
              </p>
            )}
            <div>
              <p className="rdma-name">{pack.displayName}</p>
              {pack.creatorName && <p className="tpage-muted">by {pack.creatorName}</p>}
            </div>
            <p className="tpage-copy">is added to your account! Pick it when you host a draft and your whole table hears it.</p>
            <a className="btn btn--primary btn--md" href="/draft">Host a Draft</a>
          </ThemedPanel>

          {rows.length > 0 && (
            <ThemedPanel label="Hear It" aria-label={`Clips in ${pack.displayName}`}>
              <p className="tpage-muted">Every call this pack makes. Press one to play it.</p>
              <ul className="rdma-clips">
                {rows.map((clip) => {
                  const guide = CLIP_GUIDE[clip]
                  const playing = playingClip === clip
                  return (
                    <li key={clip}>
                      <button
                        type="button"
                        className={`rdma-clip${playing ? ' is-playing' : ''}`}
                        onClick={() => playClip(pack.id, clip)}
                        aria-label={`${playing ? 'Stop' : 'Play'} ${guide.label}`}
                      >
                        <span className="rdma-glyph">{playing ? <StopIcon /> : <PlayIcon />}</span>
                        <span className="rdma-clip-text">
                          <b>{guide.label}</b>
                          <span className="tpage-meta">{guide.when}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </ThemedPanel>
          )}
        </div>
        {fotp}
      </ThemedPage>
    )
  }

  return (
    <ThemedPage title="Redeem a Code" subtitle="Unlock a creator voice pack" narrow className="rdma-page">
      <ThemedPanel aria-label="Redeem a Code">
        <p className="tpage-muted">
          Got a code from a creator? Enter it here to unlock their voice pack. It stays on your
          account, and when you host a draft the whole table hears it.
        </p>
        {loading ? (
          <ContentSkeleton kind="control" />
        ) : !user ? (
          <div className="tpage-row">
            <DiscordLoginButton />
          </div>
        ) : (
          <>
            <div className="tpage-field">
              <label className="tpage-label" htmlFor="rdma-code">Code</label>
              <input
                id="rdma-code"
                className="tpage-input rdma-code"
                type="text"
                value={code}
                maxLength={24}
                placeholder="PODCAST26"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={status === 'error' ? 'rdma-error' : undefined}
                onChange={(e) => {
                  setCode(e.target.value)
                  if (status === 'error' || status === 'owned') setStatus('idle')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.trim()) void handleRedeem()
                }}
              />
            </div>
            <Button
              variant="primary"
              size="lg"
              className="rdma-submit"
              disabled={code.trim().length === 0 || status === 'claiming'}
              onClick={handleRedeem}
            >
              {status === 'claiming' ? 'Checking…' : 'Redeem'}
            </Button>
          </>
        )}
        {status === 'owned' && (
          <p className="tpage-raised tpage-copy" role="status">
            You already own {ownedPackName ?? 'this voice pack'}. Pick it when you host a draft and
            your whole table hears it.
          </p>
        )}
        {status === 'error' && errorMessage && (
          <p className="tpage-status tpage-status--danger" id="rdma-error" role="alert">{errorMessage}</p>
        )}
      </ThemedPanel>
      {fotp}
    </ThemedPage>
  )
}
