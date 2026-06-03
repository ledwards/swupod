// @ts-nocheck
import { useEffect, useMemo, useState } from 'react'
import './SubscribePodBanner.css'
import Button from './Button'
import { SubscribeModal } from './SubscribeModal'
import { useAuth } from '../contexts/AuthContext'
import {
  BETA_ENROLL_URL,
  PATREON_URL,
} from '../utils/membership'
import { getSetConfig } from '../utils/setConfigs/index'
import { shouldShowPodBanner } from './subscribePodBannerGate'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'

/**
 * SubscribePodBanner — soft sub-marketing banner shown to non-patrons (and to
 * patrons-without-beta-enrollment) when they join a pod whose set has not yet
 * released.
 *
 * Design (per plan U6):
 * - No modal interrupt on join — banner only. A friend invited them; modal
 *   would create friction for the inviter.
 * - Dismissible inline. SessionStorage key `subBannerSeen-{setCode}` is set
 *   on FIRST RENDER (not on dismissal), so closing the tab still counts and
 *   the banner does not spam across multiple ASH pods in one session.
 * - Renders nothing while isPatron === null (loading); avoids flashing the
 *   CTA before patron status resolves.
 * - Three-state user model:
 *     anonymous / isPatron === false → primary CTA → Patreon URL
 *     isPatron === true && !is_beta_tester → softer CTA → /beta (don't pitch
 *       paying users; nudge them to activate)
 *     isPatron === true && is_beta_tester → render nothing
 *
 * The pure gating predicate lives in `./subscribePodBannerGate.ts` so unit
 * tests can import it without dragging React/JSX through the test loader.
 */

interface SubscribePodBannerProps {
  podSetCode?: string | null
}

const SESSION_KEY_PREFIX = 'subBannerSeen-'

function getSessionDismissed(setCode: string | null | undefined): boolean {
  if (!setCode) return false
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(SESSION_KEY_PREFIX + setCode) !== null
  } catch {
    return false
  }
}

function markSessionSeen(setCode: string | null | undefined): void {
  if (!setCode) return
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(SESSION_KEY_PREFIX + setCode, '1')
  } catch {
    /* sessionStorage unavailable (private mode) — degrade gracefully */
  }
}

export function SubscribePodBanner({ podSetCode }: SubscribePodBannerProps) {
  const { isPatron, user } = useAuth()
  const isBetaTester = Boolean(user?.is_beta_tester)
  const [modalOpen, setModalOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Compute the canonical set code (strip Carbonite -CB suffix) once.
  const baseSetCode = useMemo(() => {
    if (!podSetCode) return null
    return podSetCode.replace('-CB', '')
  }, [podSetCode])

  // Read session state once on mount per setCode change.
  const [sessionDismissed, setSessionDismissed] = useState(false)
  useEffect(() => {
    setSessionDismissed(getSessionDismissed(baseSetCode))
  }, [baseSetCode])

  const decision = shouldShowPodBanner({
    isPatron,
    isBetaTester,
    setCode: baseSetCode,
    sessionDismissed: sessionDismissed || dismissed,
  })

  // Mark session-seen on first render that the banner is eligible to show.
  // Using the gating decision (not "dismissed") so closing the tab still
  // counts toward "one banner per set per session".
  useEffect(() => {
    if (decision.show) {
      markSessionSeen(baseSetCode)
      // U7 — track that the banner was shown.
      trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_SHOWN, {
        surface: 'podBanner',
        setCode: baseSetCode ?? null,
      })
    }
  }, [decision.show, baseSetCode])

  if (!decision.show) return null

  const setConfig = baseSetCode ? getSetConfig(baseSetCode) : null
  const setName = setConfig?.setName || baseSetCode || 'this set'

  const isActivateVariant = decision.variant === 'activate'

  const headline = isActivateVariant
    ? `Enroll in beta to play ${setName}`
    : `Get early access to ${setName}`
  const ctaUrl = isActivateVariant ? BETA_ENROLL_URL : PATREON_URL
  const ctaLabel = isActivateVariant ? 'Enroll in Beta' : 'Subscribe'

  const bannerCopy = isActivateVariant
    ? `This pod uses ${setName}. Your membership unlocks early access — enroll in beta to get it.`
    : `This pod uses ${setName}. Get your own early access — start a free trial.`

  const handleSubscribeClick = () => {
    // U7 — track the banner CTA click (distinct from the modal's
    // own click event, which fires when the user hits Patreon).
    trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_CLICKED, {
      surface: 'podBanner',
      setCode: baseSetCode ?? null,
      step: 'banner_to_modal',
    })
    setModalOpen(true)
  }
  const handleDismiss = () => setDismissed(true)
  const handleModalClose = () => setModalOpen(false)

  return (
    <>
      <div
        className={`subscribe-pod-banner${isActivateVariant ? ' subscribe-pod-banner--activate' : ''}`}
        role="region"
        aria-label="Membership promotion"
      >
        <span className="subscribe-pod-banner-copy">{bannerCopy}</span>
        <div className="subscribe-pod-banner-actions">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubscribeClick}
            className="subscribe-pod-banner-cta"
          >
            {ctaLabel}
          </Button>
          <Button
            variant="icon"
            size="sm"
            onClick={handleDismiss}
            aria-label="Dismiss membership banner"
            className="subscribe-pod-banner-dismiss"
          >
            &times;
          </Button>
        </div>
      </div>

      <SubscribeModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        headline={headline}
        setCode={baseSetCode || undefined}
        ctaUrl={ctaUrl}
        ctaLabel={ctaLabel}
        surface="podBanner"
      />
    </>
  )
}

export default SubscribePodBanner
