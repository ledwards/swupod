'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import { isCompanionBeta } from '@/src/utils/companionBeta'
import { usePluginPresence } from '@/src/hooks/usePluginPresence'
import WayfinderStoreButtons from '@/src/components/WayfinderStoreButtons'
import './PluginCTA.css'

export type PluginCTAState = 'install' | 'soon' | 'hidden'

/**
 * usePluginCTA — the ONE place the Companion show/hide/gating decision lives.
 * Both <PluginCTA> and any consumer that needs to branch use this; the logic is
 * never repeated. (e.g. the play page: `hasPlugin ? <Linkage/> : shouldShow ?
 * <PluginCTA/> : null`.)
 *
 *   'hidden'  → user already has the Companion (detected OR has recorded games)
 *   'soon'    → not in the admin rollout → neutral placeholder
 *   'install' → in the rollout + no Companion → show the pitch
 *
 * Dev override: ?plugincta=install|soon|hide forces the state on any session.
 */
export function usePluginCTA(): {
  state: PluginCTAState
  /** True unless the user already has the Companion (state !== 'hidden'). */
  shouldShow: boolean
  /** Is this user in the (admin) rollout? */
  inRollout: boolean
  /** Does this user already have the Companion? */
  hasPlugin: boolean
} {
  const { user } = useAuth()
  const inRollout = isCompanionBeta(user)
  const { hasPlugin } = usePluginPresence()

  const [qa, setQa] = useState<string | null>(null)
  useEffect(() => {
    setQa(new URLSearchParams(window.location.search).get('plugincta'))
  }, [])

  const state: PluginCTAState =
    qa === 'install' ? 'install'
    : qa === 'soon' ? 'soon'
    : qa === 'hide' ? 'hidden'
    : hasPlugin ? 'hidden'
    : inRollout ? 'install'
    : 'soon'

  return { state, shouldShow: state !== 'hidden', inRollout, hasPlugin }
}

/**
 * PluginCTA — THE one Wayfinder Companion install CTA. Drop it in anywhere; it
 * owns all the logic (via usePluginCTA), so call sites pass only a variant.
 *
 * Variants:
 *   - 'card'       full vertical hero: lockup + heading + copy + every browser.
 *   - 'autodetect' same hero, but a SINGLE button for the browser you're in;
 *                  the rest go in the "also available" line.
 *   - 'compact'    just the browser logos — no lockup, no copy (rare, tight spots).
 *
 * Always uses the OFFICIAL combined lockup (/branding/wayfinder_companion.svg) —
 * one designed asset, never a bare mark next to a wordmark.
 */
export interface PluginCTAProps {
  variant?: 'card' | 'compact' | 'autodetect'
  /** Optional context heading (defaults to the install headline). */
  heading?: string
  /** Optional context copy (defaults to the install copy). */
  copy?: string
  className?: string
}

const DEFAULT_HEADING = 'Play Your Protect the Pod Deck Online'
const DEFAULT_COPY =
  'Install the Companion to queue on Karabast with your PTP pool, tie games back to this page, and rewatch your replays.'

function Lockup() {
  return (
    <img
      className="plugin-cta-lockup"
      src="/branding/wayfinder_companion.svg"
      alt="Wayfinder Companion"
      width={1089}
      height={1054}
    />
  )
}

export function PluginCTA({ variant = 'card', heading, copy, className = '' }: PluginCTAProps) {
  const { state } = usePluginCTA()

  if (state === 'hidden') return null

  if (state === 'soon') {
    return (
      <div className={`plugin-cta plugin-cta--soon plugin-cta--${variant} ${className}`.trim()}>
        <span className="plugin-cta-badge">Coming soon</span>
        <h3 className="plugin-cta-heading">Gameplay stats are on the way</h3>
        <p className="plugin-cta-copy">
          Soon you&apos;ll be able to record your games, tie them back to the pool you drafted, and
          rewatch your replays — right here.
        </p>
      </div>
    )
  }

  // compact — just the browser logos, no lockup / copy.
  if (variant === 'compact') {
    return (
      <div className={`plugin-cta plugin-cta--install plugin-cta--compact ${className}`.trim()}>
        <WayfinderStoreButtons mode="all" />
      </div>
    )
  }

  // card | autodetect — full hero; autodetect shows just the current browser.
  return (
    <div className={`plugin-cta plugin-cta--install plugin-cta--${variant} ${className}`.trim()}>
      <Lockup />
      <div className="plugin-cta-text">
        <h3 className="plugin-cta-heading">{heading || DEFAULT_HEADING}</h3>
        <p className="plugin-cta-copy">{copy || DEFAULT_COPY}</p>
      </div>
      <WayfinderStoreButtons mode={variant === 'autodetect' ? 'current' : 'all'} />
    </div>
  )
}

export default PluginCTA
