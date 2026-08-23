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
import { normalizeVoicePackCode } from '@/src/services/voicePacks'
import './redeem.css'

interface ClaimedPack {
  id: string
  code: string
  displayName: string
  creatorName: string | null
  logoUrl: string
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
  const [playing, setPlaying] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Preload the greeting the moment we know the pack, so the logo click is instant.
  useEffect(() => {
    if (!pack?.greetingUrl) return
    const audio = new Audio(pack.greetingUrl)
    audio.preload = 'auto'
    audio.addEventListener('ended', () => setPlaying(false))
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [pack])

  const playGreeting = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    setPlaying(true)
    audio.play().catch(() => setPlaying(false))
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
    return (
      <div className="redeem-page page-background">
        <RedeemBrandHero />
        <div className="redeem-card redeem-card--done">
          <header className="redeem-header">
            <span className="redeem-eyebrow">Voice pack unlocked</span>
            <h1 className="redeem-title">Unlocked!</h1>
          </header>

          <button
            type="button"
            className={`redeem-logo-button${playing ? ' is-playing' : ''}`}
            onClick={playGreeting}
            disabled={!pack.greetingUrl}
            aria-label={`Play the greeting from ${pack.displayName}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="redeem-logo" src={pack.logoUrl} alt={pack.displayName} />
          </button>
          <p className="redeem-fineprint">
            {!pack.greetingUrl
              ? ' '
              : playing
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
