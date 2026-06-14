// @ts-nocheck
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { usePresence } from '../hooks/usePresence'
import { usePublicPodsSocket } from '../hooks/usePublicPodsSocket'
import { formatPoolLabel } from '../utils/poolDisplayName'
import {
  PATREON_URL,
  getUpcomingSetForPromo,
} from '../utils/membership'
import {
  selectHomepagePromoVariant,
  promoDismissalKey,
  type PromoVariant,
} from './landingPagePromo'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'
import ReleaseNotes from './ReleaseNotes'
import Button from './Button'
import SubscribeModal from './SubscribeModal'
import Countdown from './Countdown'
import { getSetConfig } from '../utils/setConfigs/index'
// Summary-backed (NOT cardData) — this is a 'use client' component; a
// cardData import would embed the 8 MB cards.json in the landing bundle (U5).
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
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0)
}

// Normal-variant spoiler progress now comes from src/utils/cardSummary
// (generated from the same corrected card data) — we deliberately count
// Normal-only: users intuit "X of Y cards spoiled" at the gameplay level,
// not the cardCount=776 figure (which doubles up by treatment).

// Card art for mode buttons (hover reveal)
const MODE_ART = {
  sealedSolo: 'https://cdn.starwarsunlimited.com//card_SWH_01_465_Cunning_HYP_9c76fc00ac.png',
  draftSolo: 'https://cdn.starwarsunlimited.com//card_07020301_EN_Han_Solo_5c873340ad.png',
  sealedLive: 'https://cdn.starwarsunlimited.com//card_04020336_EN_Close_the_Shield_Gate_54e600004d.png',
  draftLive: 'https://cdn.starwarsunlimited.com//card_07020493_EN_The_Master_Codebreaker_fb7127ab41.png',
  history: 'https://cdn.starwarsunlimited.com//card_05020502_EN_Darth_Revan_s_Lightsabers_d4bd32215b.png',
  deckbuilder: 'https://cdn.starwarsunlimited.com//card_04030998_EN_Grand_Admiral_Thrawn_Leader_Unit_eba4967d61.png',
  importPool: 'https://cdn.starwarsunlimited.com//card_04020522_EN_Death_Star_Plans_c573838ad4.png',
}

interface ActiveDraft {
  shareId: string
  status: string
  setName?: string
  draftName?: string
  createdAt?: string
}

interface ActiveSealedPod {
  shareId: string
  status: string
  setName?: string
  poolName?: string
  createdAt?: string
}

function LandingPage() {
  const { user, loading, signIn, isPatron, refreshSession } = useAuth()
  const hasBetaAccess = user?.is_beta_tester || user?.is_admin
  const router = useRouter()
  const searchParams = useSearchParams()
  const [wasRemoved, setWasRemoved] = useState(false)

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
    for (const variant of ['nonSubConversion', 'patronNoBeta', 'patronActivation'] as const) {
      const key = promoDismissalKey(upcomingSet.setCode, variant)
      if (key && localStorage.getItem(key)) next[variant] = true
    }
    setDismissedVariantsForSet(next)
  }, [upcomingSet?.setCode])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('removed') === '1') {
      setWasRemoved(true)
    }
  }, [])
  const playerCount = usePresence(user?.id)
  const publicPods = usePublicPodsSocket()
  const [activeDraft, setActiveDraft] = useState<ActiveDraft | null>(null)
  const [activeSealedPod, setActiveSealedPod] = useState<ActiveSealedPod | null>(null)
  const [isDiscordMember, setIsDiscordMember] = useState(true)

  const sealedPodsOpen = publicPods.filter(p => p.podType === 'sealed').length
  const draftPodsOpen = publicPods.filter(p => p.podType === 'draft').length

  // Check Discord membership and active pods when user is logged in
  useEffect(() => {
    if (!user || loading) {
      setActiveDraft(null)
      setActiveSealedPod(null)
      setIsDiscordMember(false)
      return
    }

    const checkDiscordMembership = async () => {
      try {
        const response = await fetch('/api/auth/discord-member', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setIsDiscordMember(data.data?.isMember || false)
        }
      } catch (err) {
        // If check fails, keep hidden (default true) — better to hide than show incorrectly
        console.error('Discord membership check failed:', err)
      }
    }

    const checkActiveDrafts = async () => {
      try {
        const response = await fetch('/api/draft/history', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const active = data.pods?.find(
            (pod: ActiveDraft) => pod.status === 'waiting' || pod.status === 'leader_draft' || pod.status === 'pack_draft'
          )
          setActiveDraft(active || null)
        }
      } catch (err) {
        console.error('Failed to check active drafts:', err)
      }
    }

    const checkActiveSealedPods = async () => {
      try {
        const response = await fetch('/api/sealed/history', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const active = data.pods?.find(
            (pod: ActiveSealedPod) => pod.status === 'waiting'
          )
          setActiveSealedPod(active || null)
        }
      } catch (err) {
        console.error('Failed to check active sealed pods:', err)
      }
    }

    checkDiscordMembership()
    checkActiveDrafts()
    checkActiveSealedPods()
  }, [user, loading])

  const hasActiveDraft = Boolean(activeDraft || activeSealedPod)
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
      promoVariant === 'patronActivation'
        ? null // not a conversion event — already a patron
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
  // NOT use the modal (CTA goes straight to /draft/new).
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

  return (
    <div className="landing-page">
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
            onClick={() => router.push('/draft/new')}
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
        setCode={modalSurface === 'homepageBanner' ? setCode ?? undefined : undefined}
        ctaUrl={modalCtaUrl}
        ctaLabel={modalCtaLabel}
        surface={modalSurface}
      />
      <ReleaseNotes />
      {wasRemoved && (
        <div className="removed-banner">You were removed from the pod by the host.</div>
      )}
      <div className="landing-content">
        <a href="/">
          <img className="landing-logo" src="/ptp_logo400.png" alt="Protect the Pod Logo" />
        </a>
        <h1 className="visually-hidden">Protect the Pod</h1>
        <h2 className="subtitle">
          The Star Wars Unlimited<br />
          Limited Simulator
        </h2>
        {!loading && !user && (
          <button className="discord-cta" onClick={signIn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor" />
            </svg>
            Login with Discord
          </button>
        )}
        {!loading && user && !isDiscordMember && (
          <a
            className="discord-cta"
            href={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor" />
            </svg>
            Join the Discord
          </a>
        )}
        {playerCount > 0 && (
          <div className="players-online-landing">
            <span className="online-dot-landing" />
            <span>{playerCount} player{playerCount !== 1 ? 's' : ''} online</span>
          </div>
        )}
        {activeDraft && (
          <div className="active-draft-banner">
            <span>Live Pod: {activeDraft.draftName || formatPoolLabel(activeDraft.setName ?? activeDraft.setCode, 'draft')}{activeDraft.createdAt ? ` ${new Date(activeDraft.createdAt).toLocaleDateString()}` : ''}</span>
            <Button
              variant="primary"
              size="sm"
              className="rejoin-button"
              onClick={() => router.push(`/draft/${activeDraft.shareId}`)}
            >
              Rejoin?
            </Button>
          </div>
        )}
        {activeSealedPod && (
          <div className="active-draft-banner">
            <span>Live Pod: {activeSealedPod.poolName || activeSealedPod.setName || ''} Sealed{activeSealedPod.createdAt ? ` ${new Date(activeSealedPod.createdAt).toLocaleDateString()}` : ''}</span>
            <Button
              variant="primary"
              size="sm"
              className="rejoin-button"
              onClick={() => router.push(`/sealed/${activeSealedPod.shareId}`)}
            >
              Rejoin?
            </Button>
          </div>
        )}
        <div className="mode-sections-row">
          <div className="mode-section">
            <h3 className="mode-section-header">Solo</h3>
            <div className="mode-column">
              <button className="mode-button art-unit" onClick={() => router.push('/sealed')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.draftSolo}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Sealed</span>
                  <span className="mode-button-subtitle">Build a deck from 6 packs</span>
                </div>
              </button>
              <button className="mode-button art-event" onClick={() => router.push('/draft/solo')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.sealedSolo}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Draft</span>
                  <span className="mode-button-subtitle">Draft against bots</span>
                </div>
              </button>
              <button className="mode-button art-leader-unit" onClick={() => router.push('/formats')}>
                <div
                  className="mode-button-art"
                  style={{ backgroundImage: `url("https://cdn.starwarsunlimited.com//card_SWH_01_283_Hansolo_Leader_Unit_HYP_6c91c1ab96.png")` }}
                />
                <div className="mode-button-content">
                  <span className="mode-button-title">Other</span>
                  <span className="mode-button-subtitle">Chaos, Pack Wars, and more</span>
                </div>
              </button>
            </div>
          </div>
          <div className="mode-section">
            <h3 className="mode-section-header">Live Pod</h3>
            <div className="mode-column">
              <button className="mode-button art-event" onClick={() => router.push('/sealed/pod')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.sealedLive}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Sealed</span>
                  <span className="mode-button-subtitle">Play with friends</span>
                  {sealedPodsOpen > 0 && (
                    <span className="pods-open-badge">{sealedPodsOpen} pod{sealedPodsOpen !== 1 ? 's' : ''} open</span>
                  )}
                </div>
              </button>
              <button className="mode-button art-unit" onClick={() => router.push('/draft')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.draftLive}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Draft</span>
                  <span className="mode-button-subtitle">8-player booster draft</span>
                  {draftPodsOpen > 0 && (
                    <span className="pods-open-badge">{draftPodsOpen} pod{draftPodsOpen !== 1 ? 's' : ''} open</span>
                  )}
                </div>
              </button>
              <button className="mode-button art-unit" onClick={() => router.push('/formats')}>
                <div
                  className="mode-button-art"
                  style={{ backgroundImage: `url("https://cdn.starwarsunlimited.com//card_0302467_EN_Jar_Jar_Binks_0e94fbc644.png")` }}
                />
                <div className="mode-button-content">
                  <span className="mode-button-title">Other</span>
                  <span className="mode-button-subtitle">Chaos, Pack Wars, and more</span>
                </div>
              </button>
            </div>
          </div>
          <div className="mode-section">
            <h3 className="mode-section-header">Deckbuilder</h3>
            <div className="mode-column">
              {user && (
                <button className="mode-button art-unit" onClick={() => router.push('/history')}>
                  <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.history}")` }} />
                  <div className="mode-button-content">
                    <span className="mode-button-title">History</span>
                    <span className="mode-button-subtitle">Your past pools and decks</span>
                  </div>
                </button>
              )}
              <button className="mode-button art-unit mode-button-deckbuilder" onClick={() => router.push('/deckbuilder')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.deckbuilder}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Limited</span>
                  <span className="mode-button-subtitle">Infinite copies of every card in a set</span>
                </div>
              </button>
              {hasBetaAccess && (
                <button className="mode-button art-unit" onClick={() => router.push('/import')}>
                  <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.importPool}")` }} />
                  <div className="mode-button-content">
                    <span className="mode-button-title">Import Pool</span>
                    <span className="mode-button-subtitle">From your registered sealed sheet</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="landing-disclaimer">
        <div className="landing-footer-links">
          <a href="/stats" onClick={(e) => { e.preventDefault(); router.push('/stats') }}>Stats</a>
          <span className="footer-separator">·</span>
          <a href="/qa" onClick={(e) => { e.preventDefault(); router.push('/qa') }}>QA</a>
          <span className="footer-separator">·</span>
          <a href="/api" onClick={(e) => { e.preventDefault(); router.push('/api') }}>API</a>
          <span className="footer-separator">·</span>
          <a href="https://github.com/ledwards/swupod" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="footer-separator">·</span>
          <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">Patreon</a>
          <span className="footer-separator">·</span>
          <a href="https://swag.protectthepod.com" target="_blank" rel="noopener noreferrer">Swag</a>
          <span className="footer-separator">·</span>
          <a href="/support-the-pod" onClick={(e) => { e.preventDefault(); router.push('/support-the-pod') }}>Support the Pod</a>
          <span className="footer-separator">·</span>
          <a href="/terms-of-service" onClick={(e) => { e.preventDefault(); router.push('/terms-of-service') }}>Terms</a>
          <span className="footer-separator">·</span>
          <a href="/privacy-policy" onClick={(e) => { e.preventDefault(); router.push('/privacy-policy') }}>Privacy</a>
        </div>
        <p>Protect the Pod is in no way affiliated with Disney or Fantasy Flight Games. Star Wars characters, cards, logos, and art are property of Disney and/or Fantasy Flight Games.</p>
      </div>
    </div>
  )
}

export default LandingPage
