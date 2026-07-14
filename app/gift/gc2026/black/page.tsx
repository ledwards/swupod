'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
import { PATREON_URL } from '@/src/utils/membership'
import '../page.css'

type Status = 'idle' | 'claiming' | 'opening' | 'already' | 'closed' | 'error'
type EventPack = { cards: unknown[] }

// Single entitlement-checking surface for the Black Pack (plan U6/D7). Reached from the
// Promo Packs section's locked Black tile and from the /gift/gc2026 nudge. Opens the pack
// for Friends of the Pod; shows the soft CTA for everyone else.
export default function GiftGc2026BlackPage() {
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
        body: JSON.stringify({ campaign: 'gc2026', tier: 'black' }),
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
        setStatus('already')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'opening' && pack) {
    return (
      <PackOpeningAnimation
        packs={[pack] as never}
        packCount={1}
        onComplete={() => router.push('/formats/chaos-sealed')}
      />
    )
  }

  if (loading || !user || isPatron === null) {
    return (
      <div className="gift-page">
        <div className="gift-container">
          <div className="loading">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="gift-page">
      <div className="gift-container">
        <h1>GC 2026 Black Pack</h1>

        {isPatron !== true ? (
          <div className="gift-panel">
            <p className="gift-panel-copy">
              The Black Pack is an <strong>exclusive for Friends of the Pod</strong> — alt-art
              event promos on top of the Silver Pack anyone can claim.
            </p>
            <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="primary" size="lg">Become a Friend of the Pod</Button>
            </a>
          </div>
        ) : status === 'already' ? (
          <div className="gift-panel gift-panel--ok">
            <span className="gift-check">✓</span>
            <p>Your Black Pack is already unlocked.</p>
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
            <p className="gift-panel-copy">Unlock your Black Pack and open it right now.</p>
            <Button variant="primary" size="lg" onClick={handleUnlock} disabled={status === 'claiming'}>
              {status === 'claiming' ? 'Unlocking…' : 'Unlock Black Pack'}
            </Button>
            {status === 'error' && (
              <p className="gift-error">Something went wrong. Give it another try in a moment.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
