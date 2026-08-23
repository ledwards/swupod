'use client'

/**
 * /redeem — enter a creator's code, unlock their voice pack on your account.
 *
 * Auth is required (the unlock is a permanent per-account grant), so a signed-out
 * visitor gets a Discord login button; signInWithDiscord already returns them to this
 * exact path afterwards, so the code they were about to type is one step away.
 *
 * On success the confirmation shows the pack's logo, and clicking the logo plays that
 * pack's `greeting` clip — the click is itself the user gesture browsers require
 * before audio may play.

 *
 * Both states lead with the Protect the Pod badge (`/ptp_logo400.png` — the same
 * lockup the homepage and the lobby head with; the mark stacked over the logotype is
 * baked into that one asset). Landing here from a creator's stream may be someone's
 * first sight of the site, so it has to say whose site it is before it asks for a code.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import { normalizeVoicePackCode, type VoicePackClipType } from '@/src/services/voicePacks'
import { CLIP_GUIDE } from '@/src/services/voicePackClipGuide'
import { VOICE_PACK_CLIPS, voicePackAssetUrl } from '@/src/utils/voicePackAssets'
import './redeem.css'

interface ClaimedPack {
  id: string
  code: string
  displayName: string
  creatorName: string | null
  logoUrl: string
  /** The clip slots this pack actually filled — a pack may be short a few. */
  clips?: VoicePackClipType[]
  greetingUrl: string | null
}

/**
 * The Protect the Pod badge, linked home. `/ptp_logo400.png` is the whole lockup —
 * mark over logotype in one asset — exactly as `.landing-logo` and
 * `.lobby-header-logo` use it. Never pair it with `/ptp_logotype.png`; that would
 * print "PROTECT THE POD" twice.
 */
function RedeemBrandHero() {
  return (
    <a className="redeem-brand" href="/" aria-label="Protect the Pod home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="redeem-brand-logo" src="/ptp_logo400.png" alt="Protect the Pod" />
    </a>
  )
}

/** ▶ / ■ for a row that is idle / playing. */
function PlayGlyph({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="6 4 20 12 6 20" />
    </svg>
  )
}

/**
 * Everything the pack can say, one row per cue, each played on demand.
 *
 * Nothing here plays by itself. Somebody who has just unlocked a voice wants to
 * hear it, but on their own terms — so this is a list of buttons, not a reel.
 *
 * Rows follow VOICE_PACK_CLIPS (cue order — greeting, the calls, the countdown,
 * the timer), filtered to what this pack actually filled, because a creator pack
 * can be published a slot or two short and a dead button is worse than no button.
 */
function VoicePackPlaylist({
  pack,
  playingClip,
  onPlay,
}: {
  pack: ClaimedPack
  playingClip: VoicePackClipType | null
  onPlay: (clip: VoicePackClipType) => void
}) {
  const available = pack.clips ?? []
  const rows = VOICE_PACK_CLIPS.filter(clip => available.includes(clip as VoicePackClipType))
  if (rows.length === 0) return null

  return (
    <aside className="redeem-playlist" aria-label={`Clips in ${pack.displayName}`}>
      <h2 className="redeem-playlist-title">Hear it</h2>
      <p className="redeem-playlist-intro">Every call this pack makes. Press one to play it.</p>
      <ul className="redeem-playlist-rows">
        {rows.map(clip => {
          const guide = CLIP_GUIDE[clip as VoicePackClipType]
          const isPlaying = playingClip === clip
          return (
            <li key={clip}>
              <button
                type="button"
                className={`redeem-playlist-row${isPlaying ? ' is-playing' : ''}`}
                onClick={() => onPlay(clip as VoicePackClipType)}
                aria-label={`${isPlaying ? 'Stop' : 'Play'} ${guide.label}`}
                // The description is clipped to one line in the two-column layout,
                // so the full sentence lives here rather than being lost.
                title={guide.when}
              >
                <span className="redeem-playlist-glyph">
                  <PlayGlyph playing={isPlaying} />
                </span>
                <span className="redeem-playlist-text">
                  <span className="redeem-playlist-label">{guide.label}</span>
                  <span className="redeem-playlist-when">{guide.when}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export default function RedeemPage() {
  // AuthContext is untyped (.jsx → createContext(null)); cast to the shape we use.
  const { user, loading, signIn } = useAuth() as unknown as {
    user: unknown
    loading: boolean
    signIn: () => void
  }

  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'claiming' | 'done' | 'owned' | 'error'>('idle')
  const [pack, setPack] = useState<ClaimedPack | null>(null)
  // Re-entering a code you already hold is not a failure and not an unlock — it
  // is a fact about your account. It stays on the entry form and says so in a
  // notice, rather than replaying the whole "Unlocked!" reward for a pack that
  // was unlocked some other day.
  const [ownedPackName, setOwnedPackName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // ONE player for the whole page. The logo and every row in the playlist go
  // through it, so a second click always replaces the first rather than layering
  // on top of it — the same rule the draft's cue engine follows.
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingClip, setPlayingClip] = useState<VoicePackClipType | null>(null)

  // Nothing plays on arrival. Unlocking a pack should not shout at whoever is
  // sitting in a quiet room; every clip here is played on purpose.
  const playClip = useCallback((packId: string, clip: VoicePackClipType) => {
    const current = audioRef.current
    if (current) {
      current.pause()
      audioRef.current = null
    }
    // Clicking the row that is already playing stops it.
    if (playingClip === clip) {
      setPlayingClip(null)
      return
    }
    const audio = new Audio(voicePackAssetUrl(clip, packId))
    audio.addEventListener('ended', () => {
      setPlayingClip(current => (current === clip ? null : current))
    })
    audioRef.current = audio
    setPlayingClip(clip)
    audio.play().catch(() => {
      setPlayingClip(current => (current === clip ? null : current))
    })
  }, [playingClip])

  // Stop anything mid-sentence when the page goes away.
  useEffect(() => () => {
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  async function handleRedeem() {
    const normalized = normalizeVoicePackCode(code)
    setStatus('claiming')
    setErrorMessage(null)
    setOwnedPackName(null)
    try {
      const res = await fetch('/api/voice-packs/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message ?? 'That code is not valid.')
      }
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

  if (status === 'done' && pack) {
    const hasGreeting = (pack.clips ?? []).includes('greeting')
    return (
      <div className="redeem-page page-background">
        <RedeemBrandHero />
        <div className="redeem-done-layout">
        <div className="redeem-card redeem-card--done">
          <header className="redeem-header">
            <span className="redeem-eyebrow">Voice pack unlocked</span>
            <h1 className="redeem-title">Unlocked!</h1>
          </header>

          <button
            type="button"
            className={`redeem-logo-button${playingClip === 'greeting' ? ' is-playing' : ''}`}
            onClick={() => playClip(pack.id, 'greeting')}
            disabled={!hasGreeting}
            aria-label={`Play the greeting from ${pack.displayName}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="redeem-logo" src={pack.logoUrl} alt={pack.displayName} />
          </button>
          <p className="redeem-fineprint">
            {!hasGreeting
              ? ' '
              : playingClip === 'greeting'
                ? 'Playing…'
                : 'Tap the logo to hear the greeting'}
          </p>

          <div className="redeem-pack-identity">
            <p className="redeem-pack-name">{pack.displayName}</p>
            {pack.creatorName && <p className="redeem-pack-creator">by {pack.creatorName}</p>}
          </div>

          {/* Reads on from the identity block above it — "Leebo, by Protect the Pod,
              is added to your account!" — which is why the two sit tight together and
              this line stands alone. The line below has to hold one line at the card's
              width; it is worded to the space, so do not lengthen it casually. */}
          <p className="redeem-added">is added to your account!</p>
          <p className="redeem-copy">
            Pick it when you host a draft and your whole table hears it.
          </p>

          <div className="redeem-actions">
            <a className="btn btn--primary btn--md" href="/draft">
              Host a draft
            </a>
          </div>
        </div>

        <VoicePackPlaylist
          pack={pack}
          playingClip={playingClip}
          onPlay={(clip) => playClip(pack.id, clip)}
        />
        </div>
      </div>
    )
  }

  return (
    <div className="redeem-page page-background">
      <RedeemBrandHero />
      <div className="redeem-card">
        <header className="redeem-header">
          <h1 className="redeem-title">Redeem a code</h1>
          <p className="redeem-copy">
            Got a code from a creator? Enter it here to unlock their voice pack. It stays
            on your account, and when you host a draft the whole table hears it.
          </p>
        </header>

        {loading ? (
          <div className="loading">Loading…</div>
        ) : !user ? (
          <div className="redeem-actions">
            <Button variant="primary" size="lg" onClick={signIn}>
              Log in to redeem
            </Button>
          </div>
        ) : (
          <>
            <label className="redeem-field">
              <span className="redeem-label">Code</span>
              <input
                className="redeem-input"
                type="text"
                value={code}
                maxLength={24}
                placeholder="PODCAST26"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => {
                  setCode(e.target.value)
                  if (status === 'error' || status === 'owned') setStatus('idle')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && code.trim()) handleRedeem()
                }}
              />
            </label>

            <div className="redeem-actions">
              <Button
                variant="primary"
                size="lg"
                disabled={code.trim().length === 0 || status === 'claiming'}
                onClick={handleRedeem}
              >
                {status === 'claiming' ? 'Checking…' : 'Redeem'}
              </Button>
            </div>
          </>
        )}

        {status === 'owned' && (
          <div className="redeem-notice" role="status">
            You already own {ownedPackName ?? 'this voice pack'}. Pick it when you host a
            draft and your whole table hears it.
          </div>
        )}

        {status === 'error' && errorMessage && (
          <div className="redeem-error" role="alert">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  )
}
