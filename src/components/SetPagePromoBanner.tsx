// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getSetConfig } from '../utils/setConfigs/index'
import { isSetUpcoming } from '../utils/membership'
import { promoDismissalKey, type PromoVariant } from './landingPagePromo'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'
import Button from './Button'
import SubscribeModal from './SubscribeModal'
import './LandingPage.css'

interface Props {
  setCode: string
  spoiledNormalCount: number
  totalNormalCount: number
}

// Mirrors LandingPage.hexToRgba — kept local so we don't drag the whole
// landing-page module into the set catalog bundle.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Conversion banner for the set catalog page. Shows on /sets/{code} while the
 * set is unreleased and at least one real card is synced, to users who are
 * NOT in beta (logged out, non-patron, or patron-without-beta).
 *
 * Shares localStorage dismissal keys with the homepage banner, so dismissing
 * on either surface carries across. patronActivation is intentionally absent
 * — beta testers don't need a "you're in beta" prompt while browsing the set.
 */
export default function SetPagePromoBanner({ setCode, spoiledNormalCount, totalNormalCount }: Props) {
  const { user, isPatron } = useAuth()
  const isBetaTester = Boolean(user?.is_beta_tester) || Boolean(user?.is_admin)

  const [dismissed, setDismissed] = useState<Partial<Record<PromoVariant, boolean>>>({})
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const next: Partial<Record<PromoVariant, boolean>> = {}
    for (const v of ['nonSubConversion', 'patronNoBeta'] as const) {
      const key = promoDismissalKey(setCode, v)
      if (key && localStorage.getItem(key)) next[v] = true
    }
    setDismissed(next)
  }, [setCode])

  if (!isSetUpcoming(setCode)) return null
  if (isPatron === null) return null
  if (isPatron === true && isBetaTester) return null

  const setConfig = getSetConfig(setCode.replace('-CB', ''))
  if (!setConfig) return null
  const setName = setConfig.setName
  const setColor = setConfig.color

  const variant: PromoVariant = isPatron === false ? 'nonSubConversion' : 'patronNoBeta'
  if (dismissed[variant]) return null

  const promoBannerStyle = setColor
    ? {
        background: hexToRgba(setColor, 0.14),
        borderColor: hexToRgba(setColor, 0.45),
        borderLeftColor: setColor,
      }
    : undefined

  const handleDismiss = (v: PromoVariant) => {
    const key = promoDismissalKey(setCode, v)
    if (key && typeof window !== 'undefined') {
      try { localStorage.setItem(key, '1') } catch { /* localStorage disabled */ }
    }
    setDismissed(prev => ({ ...prev, [v]: true }))
  }

  if (variant === 'nonSubConversion') {
    return (
      <div
        className="next-set-promo-banner next-set-promo-banner--feature"
        role="region"
        aria-label={`${setName} is in beta`}
        style={promoBannerStyle}
      >
        <div className="next-set-promo-banner-stack">
          <div className="next-set-promo-banner-text">
            <div className="next-set-promo-banner-headline">
              {setName} is in beta
              {' · '}
              <span className="next-set-promo-banner-headline-count">
                {spoiledNormalCount.toLocaleString()} / {totalNormalCount.toLocaleString()} cards
              </span>
            </div>
            <div className="next-set-promo-banner-subhead">
              Generally available on pre-release date. Or join your Beta friend&apos;s {setCode} pod!
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            className="next-set-promo-banner-cta"
            onClick={() => {
              const url = 'https://www.patreon.com/cw/ProtectthePod'
              trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_CLICKED, {
                surface: 'setCatalog',
                setCode,
                ctaUrl: url,
              })
              window.open(url, '_blank', 'noopener,noreferrer')
            }}
          >
            Become a Friend of the Pod
          </Button>
        </div>
        <Button
          variant="icon"
          size="sm"
          className="next-set-promo-banner-dismiss"
          aria-label="Dismiss banner"
          onClick={() => handleDismiss('nonSubConversion')}
        >
          ×
        </Button>
      </div>
    )
  }

  return (
    <>
      <div
        className="next-set-promo-banner"
        role="region"
        aria-label={`Early access to ${setName}`}
        style={promoBannerStyle}
      >
        <span className="next-set-promo-banner-copy">
          Get early access to {setName} — Enroll in beta.
        </span>
        <Button
          variant="primary"
          size="sm"
          className="next-set-promo-banner-cta"
          onClick={() => setModalOpen(true)}
        >
          Enroll in Beta
        </Button>
        <Button
          variant="icon"
          size="sm"
          className="next-set-promo-banner-dismiss"
          aria-label="Dismiss banner"
          onClick={() => handleDismiss('patronNoBeta')}
        >
          ×
        </Button>
      </div>
      <SubscribeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        headline={`Be the first to draft ${setName}`}
        setCode={setCode}
        ctaUrl="/beta"
        ctaLabel="Enroll in Beta"
        surface="setPreview"
      />
    </>
  )
}
