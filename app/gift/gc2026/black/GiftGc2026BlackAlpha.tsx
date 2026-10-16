'use client'

/**
 * /gift/gc2026/black for alpha viewers: the Black Pack, locked to Friends of
 * the Pod. Same flow as GiftGc2026BlackLegacy: signed-out visitors are sent
 * to sign in; an existing Black entitlement shows as already unlocked; a
 * Friend of the Pod unlocks and opens it; everyone else gets the membership
 * pitch. One primary per view.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
import ThemedPage, { ThemedPanel } from '@/src/components/ThemedPage/ThemedPage'
import { CheckIcon } from '@/src/components/PodHub/icons'
import { PATREON_URL } from '@/src/utils/membership'
import { GC2026_CHAOS_URL, GC2026_PACK_IMAGE, GiftPack, PlaceholderArtNote } from '../GiftAlphaParts'

type Status = 'idle' | 'claiming' | 'opening' | 'already' | 'closed' | 'error'
type EventPack = { cards: unknown[] }

const TITLE = 'The GC 2026 Black Pack'
const SUBTITLE = '2026 Galactic Championship Event Packs'

export default function GiftGc2026BlackAlpha() {
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

  useEffect(() => {
    if (!user) return
    let alive = true
    fetch('/api/promo/entitlements?campaign=gc2026', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (alive && json?.data?.black) setStatus((s) => (s === 'idle' ? 'already' : s))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [user])

  const unlock = async () => {
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
      if (json?.data?.granted) {
        setPack(json.data.pack as EventPack)
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
        packImageUrl={GC2026_PACK_IMAGE.black}
        onComplete={() => router.push(GC2026_CHAOS_URL)}
      />
    )
  }

  const pending = loading || !user || isPatron === null
  const toChaos = () => router.push(GC2026_CHAOS_URL)

  return (
    <ThemedPage title={TITLE} subtitle={SUBTITLE} narrow busy={pending}>
      {pending ? (
        <ContentSkeleton kind="card" />
      ) : isPatron !== true ? (
        <>
          <div className="gfta-lede">
            <p className="tpage-muted">
              The Black Pack is the <strong>Friends of the Pod</strong> half of the GC 2026 set: ten
              alt-art event promos that stack on top of the Silver Pack anyone can claim.
            </p>
          </div>
          <div className="gfta-packs">
            <GiftPack tier="black" locked tag="Friends of the Pod" tagTone="accent" />
          </div>
          <PlaceholderArtNote plural={false} />
          <ThemedPanel className="gfta-cta" aria-label="Claim">
            <p className="tpage-copy">Become a Friend of the Pod to unlock it. Then it&apos;s yours in Chaos Sealed forever.</p>
            <a className="btn btn--primary btn--lg" href={PATREON_URL} target="_blank" rel="noopener noreferrer">
              Become a Friend of the Pod
            </a>
          </ThemedPanel>
        </>
      ) : status === 'already' ? (
        <>
          <div className="gfta-packs">
            <GiftPack tier="black" tag="On your account" tagTone="success" />
          </div>
          <ThemedPanel className="gfta-cta" aria-label="Unlocked">
            <p className="tpage-status tpage-status--success"><CheckIcon /><span>Your Black Pack is already unlocked.</span></p>
            <Button variant="primary" size="lg" onClick={toChaos}>Go to Your Packs</Button>
          </ThemedPanel>
        </>
      ) : status === 'closed' ? (
        <ThemedPanel className="gfta-cta" aria-label="Claim window closed">
          <p className="tpage-copy">The GC 2026 claim window has closed. Any packs you already unlocked are still yours.</p>
          <Button size="lg" onClick={toChaos}>Go to Your Packs</Button>
        </ThemedPanel>
      ) : (
        <>
          <div className="gfta-packs">
            <GiftPack tier="black" tag="Friends of the Pod" tagTone="accent" />
          </div>
          <PlaceholderArtNote plural={false} />
          <ThemedPanel className="gfta-cta" aria-label="Claim">
            <p className="tpage-copy">Unlock your Black Pack and open it right now.</p>
            <Button variant="primary" size="lg" onClick={unlock} disabled={status === 'claiming'}>
              {status === 'claiming' ? 'Unlocking…' : 'Unlock Black Pack'}
            </Button>
            {status === 'error' && (
              <p className="tpage-status tpage-status--danger" role="alert">Something went wrong. Give it another try in a moment.</p>
            )}
          </ThemedPanel>
        </>
      )}
    </ThemedPage>
  )
}
