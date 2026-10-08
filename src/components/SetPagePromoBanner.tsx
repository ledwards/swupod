// @ts-nocheck
'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getSetConfig } from '../utils/setConfigs/index'
import { isSetUpcoming } from '../utils/membership'
import { promoDismissalKey } from './landingPagePromo'
import Button from './Button'
import SubscribeModal from './SubscribeModal'
import './LandingPage.css'

interface Props {
  setCode: string
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
 * Set-page beta enrollment banner. Renders on /sets/{code} for one audience
 * only: patrons who have not yet enrolled in beta. Logged-out visitors,
 * non-patrons, beta testers, and admins all see nothing.
 *
 * Shares the localStorage dismissal key with the homepage patron-no-beta
 * banner, so a dismissal on either surface carries across.
 */
export default function SetPagePromoBanner({ setCode }: Props) {
  const { user, isPatron, refreshSession } = useAuth()
  const isBetaTester = Boolean(user?.is_beta_tester) || Boolean(user?.is_admin)

  const [dismissed, setDismissed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  // Guards against showing the banner to someone whose JWT cookie is stale —
  // e.g., they were granted beta access in another tab/session and the cookie
  // hasn't caught up. We re-query the DB once before rendering.
  const [sessionVerified, setSessionVerified] = useState(false)
  const refreshAttempted = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = promoDismissalKey(setCode, 'patronNoBeta')
    if (key && localStorage.getItem(key)) setDismissed(true)
  }, [setCode])

  useEffect(() => {
    if (refreshAttempted.current) return
    if (isPatron !== true) return
    if (isBetaTester) return
    refreshAttempted.current = true
    refreshSession().finally(() => setSessionVerified(true))
  }, [isPatron, isBetaTester, refreshSession])

  if (!isSetUpcoming(setCode)) return null
  if (isPatron !== true) return null
  if (isBetaTester) return null
  if (!sessionVerified) return null
  if (dismissed) return null

  const setConfig = getSetConfig(setCode.replace('-CB', ''))
  if (!setConfig) return null
  const setName = setConfig.setName
  const setColor = setConfig.color

  const promoBannerStyle = setColor
    ? {
        background: hexToRgba(setColor, 0.14),
        borderColor: hexToRgba(setColor, 0.45),
        borderLeftColor: setColor,
      }
    : undefined

  const handleDismiss = () => {
    const key = promoDismissalKey(setCode, 'patronNoBeta')
    if (key && typeof window !== 'undefined') {
      try { localStorage.setItem(key, '1') } catch { /* localStorage disabled */ }
    }
    setDismissed(true)
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
          onClick={handleDismiss}
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
