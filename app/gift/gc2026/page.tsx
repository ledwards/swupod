'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
import './page.css'

// Flow states. The gift page is the whole experience — claim → open (reusing
// PackOpeningAnimation) → a confirmation that unlocks the Black Pack for Friends of the Pod
// and opens that the same way. No bounce to the old full-screen opening route.
type Status =
  | 'idle'
  | 'claiming'
  | 'openingSilver'
  | 'confirmSilver'
  | 'openingBlack'
  | 'confirmBlack'
  | 'closed'
  | 'error'
type EventPack = { cards: unknown[] }

const CHAOS_URL = '/formats/chaos-sealed'
const PACK_IMAGE = {
  silver: '/pack-images/gc2026-silver-pack.png',
  black: '/pack-images/gc2026-black-pack.png',
}

export default function GiftGc2026Page() {
  // AuthContext is untyped (.jsx → createContext(null)); cast to the shape we use.
  const { user, loading, signIn, isPatron } = useAuth() as unknown as {
    user: unknown
    loading: boolean
    signIn: () => void
    isPatron: boolean | null
  }
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [pack, setPack] = useState<EventPack | null>(null)
  const [ownsBlack, setOwnsBlack] = useState(false)
  const [heroOk, setHeroOk] = useState(true)

  // Reflect existing entitlements on load: a returning owner lands straight on the
  // confirmation, not the unlock button (F2 — no re-prompt, no replay).
  useEffect(() => {
    if (!user) return
    let alive = true
    fetch('/api/promo/entitlements?campaign=gc2026', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive || !json?.data) return
        if (json.data.black) setOwnsBlack(true)
        if (json.data.silver) setStatus((s) => (s === 'idle' ? 'confirmSilver' : s))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user])

  const claim = async (tier: 'silver' | 'black') => {
    const res = await fetch('/api/promo/claim', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ campaign: 'gc2026', tier }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, closed: res.status === 403 && tier === 'silver' }
    return { ok: true, pack: json?.data?.pack as EventPack | undefined }
  }

  const handleUnlockSilver = async () => {
    setStatus('claiming')
    const r = await claim('silver')
    if (!r.ok) return setStatus(r.closed ? 'closed' : 'error')
    setPack(r.pack ?? null)
    setStatus('openingSilver')
  }

  const handleUnlockBlack = async () => {
    setStatus('claiming')
    const r = await claim('black')
    if (!r.ok) return setStatus('error')
    setOwnsBlack(true)
    setPack(r.pack ?? null)
    setStatus('openingBlack')
  }

  // Reuse the standard pack-opening experience for each tier.
  if ((status === 'openingSilver' || status === 'openingBlack') && pack) {
    const isSilver = status === 'openingSilver'
    return (
      <PackOpeningAnimation
        packs={[pack] as never}
        packCount={1}
        packImageUrl={isSilver ? PACK_IMAGE.silver : PACK_IMAGE.black}
        onComplete={() => setStatus(isSilver ? 'confirmSilver' : 'confirmBlack')}
      />
    )
  }

  return (
    <div className="gift-page">
      <div className="gift-container">
        {heroOk && (
          <div className="gift-hero-wrap">
            <img
              className="gift-hero"
              src="/gift/gc2026-hero.webp"
              alt="Protect the Pod — GC 2026"
              onError={() => setHeroOk(false)}
            />
          </div>
        )}

        {(() => {
          switch (status) {
            case 'confirmSilver':
              return (
                <div className="gift-panel gift-panel--ok">
                  <span className="gift-check">✓</span>
                  <h1>Your Silver Pack is unlocked!</h1>
                  <p className="gift-panel-copy">
                    It&apos;s yours forever — pick it in your <strong>Chaos Sealed</strong> pools any time.
                  </p>
                  {isPatron === true && !ownsBlack && (
                    <Button variant="primary" size="lg" onClick={handleUnlockBlack}>
                      Unlock your Black Pack
                    </Button>
                  )}
                  <Button variant="secondary" size="lg" onClick={() => router.push(CHAOS_URL)}>
                    Go to your Chaos Sealed pools
                  </Button>
                </div>
              )
            case 'confirmBlack':
              return (
                <div className="gift-panel gift-panel--ok">
                  <span className="gift-check">✓</span>
                  <h1>Your Black Pack is unlocked!</h1>
                  <p className="gift-panel-copy">
                    Both Event Packs are on your account — use them in Chaos Sealed whenever you like.
                  </p>
                  <Button variant="primary" size="lg" onClick={() => router.push(CHAOS_URL)}>
                    Go to your Chaos Sealed pools
                  </Button>
                </div>
              )
            case 'closed':
              return (
                <div className="gift-panel gift-panel--closed">
                  <p>The GC 2026 claim window has closed. Any packs you already unlocked are still yours.</p>
                  <Button variant="secondary" size="lg" onClick={() => router.push(CHAOS_URL)}>
                    Go to your packs
                  </Button>
                </div>
              )
            default:
              return (
                <>
                  <h1>You met me at GC 2026 🎉</h1>
                  <p className="gift-lede">
                    Thanks for saying hi. Hope you&apos;re having a great weekend!
                  </p>
                  <p className="gift-lede">
                    This card unlocks the <strong>2026 Galactic Championship Event Packs</strong> on your
                    Protect the Pod account — a little digital keepsake of the weekend. You can use unlocked
                    Event Packs in your Chaos Sealed pools from now on, forever!
                  </p>
                  <div className="gift-packs">
                    <figure className="gift-pack">
                      <img src={PACK_IMAGE.silver} alt="GC 2026 Silver Event Pack" />
                      <figcaption className="gift-pack-label">SILVER PACK</figcaption>
                    </figure>
                    <figure className="gift-pack gift-pack--locked">
                      <img src={PACK_IMAGE.black} alt="GC 2026 Black Event Pack" />
                      <figcaption className="gift-pack-label">BLACK PACK</figcaption>
                    </figure>
                  </div>
                  <p className="gift-disclaimer">
                    Heads up: Fantasy Flight Games hasn&apos;t released the official GC 2026
                    alt-art yet, so the cards you unlock show <strong>placeholder images</strong> for
                    now. They&apos;ll switch to the final art automatically once FFG publishes it —
                    the packs on your account stay exactly the same.
                  </p>
                  <div className="gift-cta">
                    {loading ? (
                      <div className="loading">Loading…</div>
                    ) : !user ? (
                      <Button variant="primary" size="lg" onClick={signIn}>
                        Log in to claim your prize
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={handleUnlockSilver}
                        disabled={status === 'claiming'}
                      >
                        {status === 'claiming' ? 'Unlocking…' : 'Unlock Event Packs'}
                      </Button>
                    )}
                    {status === 'error' && (
                      <p className="gift-error">Something went wrong. Give it another try in a moment.</p>
                    )}
                  </div>
                </>
              )
          }
        })()}
      </div>
    </div>
  )
}
