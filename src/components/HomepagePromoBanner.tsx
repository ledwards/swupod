'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { getUpcomingSetForPromo } from '../utils/membership'
import {
  selectHomepagePromoVariant,
  promoDismissalKey,
  type PromoVariant,
} from './landingPagePromo'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'
import Button from './Button'
import SubscribeModal from './SubscribeModal'
import Countdown from './Countdown'
import { getSetConfig, isBeta, getPublicAccessDate } from '../utils/setConfigs/index'
import { STANDARD_DRAFT_NEW_PATH } from '../utils/draftCreationRoutes'
// Summary-backed (NOT cardData): this is a 'use client' component and must not
// embed cards.json in the homepage bundle.
import { getNormalSpoilerProgress } from '../utils/cardSummary'
import './LandingPage.css'

// Convert a #RRGGBB hex string to an rgba() string with the given alpha.
// Used to tint the homepage promo banner with the upcoming set's color.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Construct a Date representing local-midnight of an ISO date string ('YYYY-MM-DD').
// Using `new Date('YYYY-MM-DDT00:00:00')` (no Z, no offset) is the standard way to
// get local midnight; we parse the parts explicitly to avoid any parser ambiguity.
function localMidnight(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0)
}

/**
 * The upcoming-set promo banner: release/prerelease dates with a countdown,
 * Friends-of-the-Pod conversion, beta enrollment and beta activation. One
 * implementation for every page that serves `/` (the shared homepage and the
 * legacy landing page) so the variants and dismissals cannot drift apart.
 * `?previewPromo=SET` forces a set for design review.
 */
export default function HomepagePromoBanner({ hasActiveDraft = false }: { hasActiveDraft?: boolean }) {
  // AuthContext is untyped JSX; the user object is snake_case (documented trap).
  const { user, isPatron, refreshSession } = useAuth() as {
    user: { is_beta_tester?: boolean; is_admin?: boolean } | null
    isPatron: boolean | null
    refreshSession: () => Promise<unknown>
  }
  const hasBetaAccess = user?.is_beta_tester || user?.is_admin
  const router = useRouter()
  const searchParams = useSearchParams()
  // Homepage promo banner state (U5). `?previewPromo=ASH` (or any setCode)
  // forces the banner for that set to render even when we're outside the
  // 4-week pre-prerelease window — used for design review / dogfooding
  // before the natural window opens.
  const previewPromoSetCode = (searchParams?.get('previewPromo') || '').toUpperCase() || null
  const upcomingSet = useMemo(() => {
    if (previewPromoSetCode) {
      const previewed = getSetConfig(previewPromoSetCode)
      if (previewed) return previewed
    }
    return getUpcomingSetForPromo()
  }, [previewPromoSetCode])
  const [dismissedVariantsForSet, setDismissedVariantsForSet] = useState<Partial<Record<PromoVariant, boolean>>>({})
  const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false)

  // Read dismissal flags from localStorage on mount (client-only — avoid SSR mismatch).
  useEffect(() => {
    if (typeof window === 'undefined' || !upcomingSet?.setCode) {
      setDismissedVariantsForSet({})
      return
    }
    const next: Partial<Record<PromoVariant, boolean>> = {}
    for (const variant of ['nonSubConversion', 'patronNoBeta', 'patronActivation', 'prereleaseLive'] as const) {
      const key = promoDismissalKey(upcomingSet.setCode, variant)
      if (key && localStorage.getItem(key)) next[variant] = true
    }
    setDismissedVariantsForSet(next)
  }, [upcomingSet?.setCode])

  // While previewing, treat the visitor as an anonymous non-patron with no
  // active draft and a clean dismissal slate so the conversion banner always
  // resolves — otherwise the variant selector would still pick patronNoBeta
  // or short-circuit on hasActiveDraft based on real session state.
  const isPreviewing = Boolean(previewPromoSetCode)
  // Admins are not the target audience for any homepage promo banner —
  // they're already at the end of the funnel. Suppress unconditionally
  // unless they're previewing variants from /admin (future tool surface).
  const promoVariant: PromoVariant =
    !isPreviewing && user?.is_admin
      ? 'none'
      : selectHomepagePromoVariant({
          hasActiveDraft: isPreviewing ? false : hasActiveDraft,
          upcomingSet,
          isPatron: isPreviewing ? false : isPatron,
          isBetaTester: isPreviewing ? false : Boolean(hasBetaAccess),
          // "live for everyone" is the public-access date now, not FFG's
          // pre-release — beta access can open well before either.
          isPrerelease: upcomingSet ? !isBeta(upcomingSet) : false,
          dismissedVariantsForSet: isPreviewing ? {} : dismissedVariantsForSet,
        })

  // JWT staleness self-heal: if the variant resolves to patronNoBeta but the
  // user's flags might be stale (granted beta in another tab/session, JWT
  // hasn't caught up), refresh the session once. Mirrors SetPagePromoBanner.
  const refreshAttemptedRef = useRef(false)
  useEffect(() => {
    if (refreshAttemptedRef.current) return
    if (promoVariant !== 'patronNoBeta') return
    refreshAttemptedRef.current = true
    refreshSession().catch(() => { /* ignore — banner already visible, refresh is best-effort */ })
  }, [promoVariant, refreshSession])

  const setName = upcomingSet?.setName ?? upcomingSet?.setCode ?? null
  const setCode = upcomingSet?.setCode ?? null
  const setColor = upcomingSet?.color ?? null
  const prereleaseDate = upcomingSet?.prereleaseDate ?? null
  // Local-midnight Date for the countdown target. Memoized so the Date
  // identity is stable across renders (the countdown effect re-subscribes
  // when targetDate.getTime() changes).
  const prereleaseLocalMidnight = useMemo(
    () => (prereleaseDate ? localMidnight(prereleaseDate) : null),
    [prereleaseDate],
  )
  // Spoiler progress for the upcoming set, Normal variant only (user-facing
  // gameplay count, not the doubled variant inventory). Read from the tiny
  // generated card summary — no card-database import in this client bundle.
  const spoilerProgress = useMemo(
    () => (setCode ? getNormalSpoilerProgress(setCode) : { spoiled: 0, total: 0 }),
    [setCode],
  )
  // The date the set opens to EVERYONE. Since beta exclusivity is counted from
  // betaAccessDate (see getPublicAccessDate), this is no longer the same thing
  // as FFG's pre-release — for HMW it is a week earlier. The banners used to
  // say "on pre-release date", which became a straightforwardly wrong promise
  // the moment the two dates diverged.
  const publicAccessLabel = useMemo(() => {
    const iso = upcomingSet ? getPublicAccessDate(upcomingSet) : null
    if (!iso) return null
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', timeZone: 'UTC',
    })
  }, [upcomingSet])
  // Theme the whole banner with the upcoming set's color: faint tinted
  // background + matching border + stronger left accent. Each upcoming set
  // gets its own visual identity instead of a generic neutral chrome.
  // Per DESIGN.md (Light-Not-Paint + no side-stripes): the banner rests on the
  // neutral translucent surface from CSS; the set color shows only as a subtle,
  // uniform tinted border — not a saturated fill or a thick left stripe.
  const promoBannerStyle = setColor
    ? {
        borderColor: hexToRgba(setColor, 0.5),
      }
    : undefined

  // U7 — track which banner variant the user actually saw. Fires once per
  // variant per session; downstream PostHog event already captures the user
  // identity, time, and current_url.
  useEffect(() => {
    if (promoVariant === 'none') return
    const surface =
      promoVariant === 'patronActivation' || promoVariant === 'prereleaseLive'
        ? null // not a conversion event — already a patron / set is live for all
        : 'homepageBanner'
    if (!surface) return
    trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_SHOWN, {
      surface,
      setCode,
      variant: promoVariant,
    })
  }, [promoVariant, setCode])

  const handleDismissPromo = (variant: PromoVariant) => {
    const promoKey = promoDismissalKey(setCode, variant)
    if (promoKey && typeof window !== 'undefined') {
      try { localStorage.setItem(promoKey, '1') } catch { /* localStorage disabled */ }
    }
    setDismissedVariantsForSet(prev => ({ ...prev, [variant]: true }))
  }

  // Compute modal headline + CTA overrides per variant. Patron activation does
  // NOT use the modal (CTA goes straight to standard draft creation).
  let modalHeadline = ''
  let modalCtaUrl: string | undefined = undefined
  let modalCtaLabel: string | undefined = undefined
  let modalSurface: 'homepageBanner' | undefined = undefined
  if (promoVariant === 'nonSubConversion' && setName) {
    modalHeadline = `Be the first to draft ${setName}`
    modalSurface = 'homepageBanner'
  } else if (promoVariant === 'patronNoBeta' && setName) {
    modalHeadline = `Be the first to draft ${setName}`
    modalCtaUrl = '/beta'
    modalCtaLabel = 'Enroll in Beta'
    modalSurface = 'homepageBanner'
  }

  const countdown = prereleaseLocalMidnight && prereleaseLocalMidnight.getTime() > Date.now()
    ? <div className="next-set-promo-banner-countdown"><span>Pre-release in</span><Countdown targetDate={prereleaseLocalMidnight} /></div>
    : null
  return (
    <>
      {promoVariant === 'prereleaseLive' && setName && (
        <div
          className="next-set-promo-banner next-set-promo-banner--feature"
          role="region"
          aria-label={`${setName} is live`}
          style={promoBannerStyle}
        >
          <div className="next-set-promo-banner-stack">
            <div className="next-set-promo-banner-text">
              <div className="next-set-promo-banner-headline">
                {setName} is live!
              </div>
              <div className="next-set-promo-banner-subhead">
                Available to all.
              </div>
            </div>
          </div>
          <Button
            variant="icon"
            size="sm"
            className="next-set-promo-banner-dismiss"
            aria-label="Dismiss banner"
            onClick={() => handleDismissPromo('prereleaseLive')}
          >
            ×
          </Button>
        </div>
      )}
      {promoVariant === 'nonSubConversion' && setName && (
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
                  {spoilerProgress.spoiled.toLocaleString()} / {spoilerProgress.total.toLocaleString()} cards
                </span>
              </div>
              <div className="next-set-promo-banner-subhead">
                {publicAccessLabel ? `Generally available ${publicAccessLabel}.` : 'Generally available soon.'} Or join your Beta friend&apos;s {setCode} pod!
              </div>
              {countdown}
            </div>
            <Button
              variant="primary"
              size="sm"
              className="next-set-promo-banner-cta"
              onClick={() => {
                const url = 'https://www.patreon.com/cw/ProtectthePod'
                trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_CLICKED, {
                  surface: 'homepageBanner',
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
            onClick={() => handleDismissPromo('nonSubConversion')}
          >
            ×
          </Button>
        </div>
      )}
      {promoVariant === 'patronNoBeta' && setName && (
        <div
          className="next-set-promo-banner"
          role="region"
          aria-label={`Early access to ${setName}`}
          style={promoBannerStyle}
        >
          <span className="next-set-promo-banner-copy">
            Get early access to {setName} — Enroll in beta.
            {countdown}
          </span>
          <Button
            variant="primary"
            size="sm"
            className="next-set-promo-banner-cta"
            onClick={() => setIsSubscribeModalOpen(true)}
          >
            Enroll in Beta
          </Button>
          <Button
            variant="icon"
            size="sm"
            className="next-set-promo-banner-dismiss"
            aria-label="Dismiss banner"
            onClick={() => handleDismissPromo('patronNoBeta')}
          >
            ×
          </Button>
        </div>
      )}
      {promoVariant === 'patronActivation' && setName && (
        <div
          className="next-set-promo-banner next-set-promo-banner--patron"
          role="region"
          aria-label={`You are enrolled in the ${setName} beta`}
          style={promoBannerStyle}
        >
          <span className="next-set-promo-banner-copy">
            You&apos;re enrolled in beta — start drafting {setName} now.
          </span>
          <Button
            variant="primary"
            size="sm"
            className="next-set-promo-banner-cta"
            onClick={() => router.push(STANDARD_DRAFT_NEW_PATH)}
          >
            Try a Draft
          </Button>
          <Button
            variant="icon"
            size="sm"
            className="next-set-promo-banner-dismiss"
            aria-label="Dismiss banner"
            onClick={() => handleDismissPromo('patronActivation')}
          >
            ×
          </Button>
        </div>
      )}
      <SubscribeModal
        isOpen={isSubscribeModalOpen}
        onClose={() => setIsSubscribeModalOpen(false)}
        headline={modalHeadline}
        {...(modalSurface === 'homepageBanner' && setCode ? { setCode } : {})}
        {...(modalCtaUrl ? { ctaUrl: modalCtaUrl } : {})}
        {...(modalCtaLabel ? { ctaLabel: modalCtaLabel } : {})}
        {...(modalSurface ? { surface: modalSurface } : {})}
      />
    </>
  )
}
