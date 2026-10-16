'use client'

/**
 * /gift/gc2026 for alpha viewers: the GC 2026 card's landing page.
 *
 * Same flow as GiftGc2026Legacy: a returning owner lands on the confirmation
 * (no re-prompt, no replay); Unlock claims the Silver Pack and opens it with
 * PackOpeningAnimation; the confirmation then offers Friends of the Pod the
 * Black Pack, opened the same way. One primary per view.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import DiscordLoginButton from '@/src/components/DiscordLoginButton'
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
import ThemedPage, { ThemedPanel } from '@/src/components/ThemedPage/ThemedPage'
import { CheckIcon } from '@/src/components/PodHub/icons'
import { GC2026_CHAOS_URL, GC2026_PACK_IMAGE, GiftPack, PlaceholderArtNote } from './GiftAlphaParts'

type Status = 'idle' | 'claiming' | 'openingSilver' | 'confirmSilver' | 'openingBlack' | 'confirmBlack' | 'closed' | 'error'
type EventPack = { cards: unknown[] }

const SUBTITLE = '2026 Galactic Championship Event Packs'

export default function GiftGc2026Alpha() {
  const { user, loading, isPatron } = useAuth() as unknown as {
    user: { username?: string } | null
    loading: boolean
    isPatron: boolean | null
  }
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [pack, setPack] = useState<EventPack | null>(null)
  const [ownsBlack, setOwnsBlack] = useState(false)

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

  const unlockSilver = async () => {
    setStatus('claiming')
    const r = await claim('silver')
    if (!r.ok) return setStatus(r.closed ? 'closed' : 'error')
    setPack(r.pack ?? null)
    setStatus('openingSilver')
  }

  const unlockBlack = async () => {
    setStatus('claiming')
    const r = await claim('black')
    if (!r.ok) return setStatus('error')
    setOwnsBlack(true)
    setPack(r.pack ?? null)
    setStatus('openingBlack')
  }

  if ((status === 'openingSilver' || status === 'openingBlack') && pack) {
    const isSilver = status === 'openingSilver'
    return (
      <PackOpeningAnimation
        packs={[pack] as never}
        packCount={1}
        packImageUrl={isSilver ? GC2026_PACK_IMAGE.silver : GC2026_PACK_IMAGE.black}
        onComplete={() => setStatus(isSilver ? 'confirmSilver' : 'confirmBlack')}
      />
    )
  }

  const toChaos = () => router.push(GC2026_CHAOS_URL)

  if (status === 'confirmSilver' || status === 'confirmBlack') {
    const both = status === 'confirmBlack'
    const offerBlack = !both && isPatron === true && !ownsBlack
    return (
      <ThemedPage title={both ? 'Black Pack Unlocked' : 'Silver Pack Unlocked'} subtitle={SUBTITLE} narrow>
        <div className="gfta-packs">
          <GiftPack tier="silver" tag="On your account" tagTone="success" />
          {(both || ownsBlack) && <GiftPack tier="black" tag="On your account" tagTone="success" />}
        </div>
        <ThemedPanel className="gfta-cta" aria-label="Unlocked">
          <p className="tpage-status tpage-status--success">
            <CheckIcon />
            <span>
              {both
                ? 'Both Event Packs are on your account. Use them in Chaos Sealed whenever you like.'
                : 'It’s yours forever. Pick it in your Chaos Sealed pools any time.'}
            </span>
          </p>
          {offerBlack ? (
            <div className="tpage-row">
              <Button variant="primary" size="lg" onClick={unlockBlack}>Unlock Your Black Pack</Button>
              <Button size="lg" onClick={toChaos}>Go to Chaos Sealed</Button>
            </div>
          ) : (
            <Button variant="primary" size="lg" onClick={toChaos}>Go to Chaos Sealed</Button>
          )}
        </ThemedPanel>
      </ThemedPage>
    )
  }

  if (status === 'closed') {
    return (
      <ThemedPage title="GC 2026 Event Packs" subtitle={SUBTITLE} narrow>
        <ThemedPanel className="gfta-cta" aria-label="Claim window closed">
          <p className="tpage-copy">The GC 2026 claim window has closed. Any packs you already unlocked are still yours.</p>
          <Button size="lg" onClick={toChaos}>Go to Your Packs</Button>
        </ThemedPanel>
      </ThemedPage>
    )
  }

  return (
    <ThemedPage title="You Met Me at GC 2026" subtitle={SUBTITLE} narrow>
      <div className="gfta-lede">
        <p className="gfta-lede-big">Thanks for saying hi. Hope you&apos;re having a great weekend!</p>
        <p className="tpage-muted">
          This card unlocks the <strong>2026 Galactic Championship Event Packs</strong> on your
          Protect the Pod account, a little digital keepsake of the weekend. Use unlocked Event
          Packs in your Chaos Sealed pools from now on, forever.
        </p>
      </div>
      <div className="gfta-packs">
        <GiftPack tier="silver" tag="Free with this card" tagTone="success" />
        <GiftPack tier="black" locked tag="Friends of the Pod" tagTone="accent" />
      </div>
      <PlaceholderArtNote plural />
      <ThemedPanel className="gfta-cta" aria-label="Claim">
        {loading ? (
          <ContentSkeleton kind="control" />
        ) : !user ? (
          <DiscordLoginButton />
        ) : (
          <>
            {user.username && <p className="tpage-muted">Signed in as {user.username}.</p>}
            <Button variant="primary" size="lg" onClick={unlockSilver} disabled={status === 'claiming'}>
              {status === 'claiming' ? 'Unlocking…' : 'Unlock Event Packs'}
            </Button>
            <p className="tpage-meta">The Black Pack unlocks right after, if you&apos;re a Friend of the Pod.</p>
          </>
        )}
        {status === 'error' && (
          <p className="tpage-status tpage-status--danger" role="alert">Something went wrong. Give it another try in a moment.</p>
        )}
      </ThemedPanel>
    </ThemedPage>
  )
}
