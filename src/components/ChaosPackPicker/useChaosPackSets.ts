'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { fetchSets } from '../../utils/api'
import type { SetData } from '../../utils/packSelectorSort'
import { getTeaserUserState, shouldPeekUnreleased } from '../setSelectionTeaser'

interface AuthUser { is_beta_tester?: boolean; is_admin?: boolean }

/**
 * The GC 2026 Event Packs, after the same entitlement fetch the Chaos pages have always made.
 * Unlocked ones are ordinary packs; locked ones stay listed and say how to get them.
 */
async function loadEventPacks(isPatron: boolean): Promise<SetData[]> {
  let owned = { silver: false, black: false }
  try {
    const res = await fetch('/api/promo/entitlements?campaign=gc2026', { credentials: 'include' })
    if (res.ok) owned = { ...owned, ...((await res.json())?.data || {}) }
  } catch {
    // Non-fatal: treat as not unlocked.
  }
  return [
    {
      code: 'GC2026_SILVER',
      name: '2026 GC Silver Pack',
      promo: true,
      ...(owned.silver ? {} : { locked: { label: 'Locked', href: '/gift/gc2026', description: 'Unlock it with your GC 2026 card' } }),
    },
    {
      code: 'GC2026_BLACK',
      name: '2026 GC Black Pack',
      promo: true,
      ...(owned.black ? {} : {
        locked: isPatron
          ? { label: 'Unlock', href: '/gift/gc2026/black', description: 'Unlock your Black Pack' }
          : { label: 'Friends only', href: '/gift/gc2026/black', description: 'Available to Friends of the Pod' },
      }),
    },
  ]
}

export type PeekVariant = 'patreon' | 'beta' | false

/** Sets (Carbonite included), the "Coming Soon" teaser and the Event Packs for a Chaos setup. */
export function useChaosPackSets() {
  const { user, isPatron } = useAuth() as { user: AuthUser | null; isPatron: boolean | null }
  const [sets, setSets] = useState<SetData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasBetaAccess = Boolean(user?.is_beta_tester || user?.is_admin)
  const teaserState = getTeaserUserState(isPatron, user?.is_beta_tester, user?.is_admin)
  const peekUnreleased = shouldPeekUnreleased(teaserState)
  const peekVariant: PeekVariant = teaserState === 'patronNoBeta' ? 'beta' : teaserState === 'nonSub' ? 'patreon' : false

  useEffect(() => {
    if (teaserState === 'loading') return
    let live = true
    Promise.all([
      fetchSets({ includeBeta: hasBetaAccess, includeCarbonite: true, peekUnreleased }),
      loadEventPacks(isPatron === true),
    ])
      .then(([setsData, eventPacks]) => { if (live) setSets([...(setsData as SetData[]), ...eventPacks]) })
      .catch(() => { if (live) setError('Unable to load sets. Please reload.') })
    return () => { live = false }
  }, [hasBetaAccess, peekUnreleased, teaserState, isPatron])

  return { sets, error, peekVariant }
}

/** Codes a viewer can actually add: not a teaser, not locked. */
export const selectableCodes = (sets: readonly SetData[]): Set<string> =>
  new Set(sets.filter((s) => !s.comingSoon && !s.locked).map((s) => s.code))
