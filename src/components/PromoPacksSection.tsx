'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import PackOpeningAnimation from '@/src/components/PackOpeningAnimation'
import './PromoPacksSection.css'

// Promo Packs section for the Chaos Sealed / Chaos Draft pages (plan U6).
// Shows the GC 2026 Silver Pack (clickable to open once unlocked) and the Black Pack
// (visible but locked unless owned). Opening reuses PackOpeningAnimation, which renders
// as a full-screen overlay. The real gates are enforced server-side; this is UX only.

const CAMPAIGN = 'gc2026'
const PACK_IMAGE: Record<'silver' | 'black', string> = {
  silver: '/pack-images/gc2026-silver-pack.png',
  black: '/pack-images/gc2026-black-pack.png',
}

type Entitlements = { silver: boolean; black: boolean }
type EventPack = { cards: unknown[] }

type PromoTier = 'silver' | 'black'

// `selectable` (Chaos Sealed): owned tiles toggle into the pool being built and report the
// selection up via onSelectionChange. Default (Chaos Draft): owned tiles open a standalone pack.
export default function PromoPacksSection({
  selectable = false,
  onSelectionChange,
}: {
  selectable?: boolean
  onSelectionChange?: (tiers: PromoTier[]) => void
} = {}) {
  // AuthContext is untyped (.jsx → createContext(null)); cast to the shape we use.
  const { isPatron } = useAuth() as unknown as { isPatron: boolean | null }
  const [ent, setEnt] = useState<Entitlements | null>(null)
  const [pack, setPack] = useState<EventPack | null>(null)
  const [openTier, setOpenTier] = useState<PromoTier>('silver')
  const [selected, setSelected] = useState<Set<PromoTier>>(new Set())

  const toggle = useCallback((tier: PromoTier) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(tier) ? next.delete(tier) : next.add(tier)
      onSelectionChange?.([...next])
      return next
    })
  }, [onSelectionChange])

  useEffect(() => {
    let alive = true
    fetch(`/api/promo/entitlements?campaign=${CAMPAIGN}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (alive && json?.data) setEnt({ silver: !!json.data.silver, black: !!json.data.black })
      })
      .catch(() => {
        if (alive) setEnt({ silver: false, black: false })
      })
    return () => {
      alive = false
    }
  }, [])

  const openPack = useCallback(async (tier: 'silver' | 'black') => {
    try {
      const res = await fetch('/api/promo/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaign: CAMPAIGN, tier }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.data?.pack) {
        setOpenTier(tier)
        setPack(json.data.pack as EventPack)
      }
    } catch {
      /* opening is best-effort; leave the tile as-is on failure */
    }
  }, [])

  // Don't render until entitlements resolve, or the patron state is still loading —
  // avoids flashing the wrong lock state (mirrors SubscribePodBanner's null gate).
  if (ent === null || isPatron === null) return null

  if (pack) {
    return (
      <PackOpeningAnimation
        packs={[pack] as never}
        packCount={1}
        packImageUrl={PACK_IMAGE[openTier]}
        onComplete={() => setPack(null)}
      />
    )
  }

  return (
    <div className="promo-packs-section">
      <h3>GC 2026 Promo Packs</h3>
      <div className="promo-packs-grid">
        {/* Silver — anyone who claimed via the GC card. */}
        {ent.silver ? (
          <div
            className={`promo-pack-tile promo-pack-tile--silver${selectable && selected.has('silver') ? ' promo-pack-tile--selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => (selectable ? toggle('silver') : openPack('silver'))}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (selectable ? toggle('silver') : openPack('silver'))}
          >
            <span className="promo-pack-name">Silver Pack</span>
            <span className="promo-pack-cta">
              {selectable ? (selected.has('silver') ? '✓ In your pool' : '+ Add to pool') : 'Open pack'}
            </span>
          </div>
        ) : (
          <a className="promo-pack-tile promo-pack-tile--silver promo-pack-tile--locked" href="/gift/gc2026">
            <span className="promo-pack-name">Silver Pack</span>
            <span className="promo-pack-hint">Unlock with your GC 2026 card</span>
          </a>
        )}

        {/* Black — Friends of the Pod. Always visible; locked until owned. */}
        {ent.black ? (
          <div
            className={`promo-pack-tile promo-pack-tile--black${selectable && selected.has('black') ? ' promo-pack-tile--selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => (selectable ? toggle('black') : openPack('black'))}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (selectable ? toggle('black') : openPack('black'))}
          >
            <span className="promo-pack-name">Black Pack</span>
            <span className="promo-pack-cta">
              {selectable ? (selected.has('black') ? '✓ In your pool' : '+ Add to pool') : 'Open pack'}
            </span>
          </div>
        ) : (
          <a className="promo-pack-tile promo-pack-tile--black promo-pack-tile--locked" href="/gift/gc2026/black">
            <span className="promo-pack-lock" aria-hidden="true">🔒</span>
            <span className="promo-pack-name">Black Pack</span>
            <span className="promo-pack-hint">
              {isPatron ? 'Unlock your Black Pack' : 'Friends of the Pod unlocks this'}
            </span>
          </a>
        )}
      </div>
    </div>
  )
}
