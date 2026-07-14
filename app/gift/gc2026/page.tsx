'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
import { PATREON_URL } from '@/src/utils/membership'
import './page.css'

type Status = 'idle' | 'claiming' | 'opening' | 'already' | 'closed' | 'error'
type EventPack = { cards: unknown[] }

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

  // Geared to not-yet-signed-up visitors: bounce straight to Discord sign-in,
  // which returns here (?auth=success) to complete the claim.
  useEffect(() => {
    if (!loading && !user) signIn()
  }, [loading, user, signIn])

  const handleUnlock = async () => {
    setStatus('claiming')
    try {
      const res = await fetch('/api/promo/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaign: 'gc2026', tier: 'silver' }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setStatus(res.status === 403 ? 'closed' : 'error')
        return
      }
      const data = json?.data
      if (data?.granted) {
        setPack(data.pack as EventPack)
        setStatus('opening')
      } else {
        // Idempotent re-claim — no second gift moment (F2).
        setStatus('already')
      }
    } catch {
      setStatus('error')
    }
  }

  // The one-time gift moment, then off to where the packs live.
  if (status === 'opening' && pack) {
    return (
      <PackOpeningAnimation
        packs={[pack] as never}
        packCount={1}
        onComplete={() => router.push('/formats/chaos-sealed')}
      />
    )
  }

  if (loading || !user) {
    return (
      <div className="gift-page">
        <div className="gift-container">
          <div className="loading">Taking you to sign in…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="gift-page">
      <div className="gift-container">
        <h1>You met me at GC 2026 🎉</h1>
        <p className="gift-lede">
          Thanks for saying hi. This card unlocks the <strong>2026 Galactic Championship
          Event Packs</strong> on your Protect the Pod account — a little digital keepsake of
          the weekend.
        </p>

        {status === 'already' ? (
          <div className="gift-panel gift-panel--ok">
            <span className="gift-check">✓</span>
            <p>Your Silver Pack is already unlocked.</p>
            <Button variant="primary" size="lg" onClick={() => router.push('/formats/chaos-sealed')}>
              Go to your packs
            </Button>
          </div>
        ) : status === 'closed' ? (
          <div className="gift-panel gift-panel--closed">
            <p>The GC 2026 claim window has closed. Any packs you already unlocked are still yours.</p>
            <Button variant="secondary" size="lg" onClick={() => router.push('/formats/chaos-sealed')}>
              Go to your packs
            </Button>
          </div>
        ) : (
          <div className="gift-panel">
            <p className="gift-panel-copy">
              Unlock your <strong>Silver Pack</strong> and open it right now.
            </p>
            <Button variant="primary" size="lg" onClick={handleUnlock} disabled={status === 'claiming'}>
              {status === 'claiming' ? 'Unlocking…' : 'Unlock Event Packs'}
            </Button>
            {status === 'error' && (
              <p className="gift-error">Something went wrong. Give it another try in a moment.</p>
            )}
          </div>
        )}

        {/* Subtle, not-pushy Friend-of-the-Pod nudge for the Black Pack. */}
        <div className="gift-black-nudge">
          {isPatron === true ? (
            <p>
              As a Friend of the Pod you can also{' '}
              <a href="/gift/gc2026/black">unlock your Black Pack →</a>
            </p>
          ) : (
            <p>
              Friends of the Pod also get an exclusive <strong>Black Pack</strong>.{' '}
              <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">Become a Friend →</a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
