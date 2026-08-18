// @ts-nocheck
import { useState, useEffect } from 'react'
import type { SyntheticEvent } from 'react'
import './SetSelection.css'
import { fetchSets, isSetBeta, isSetPrerelease } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import Button from './Button'
import SubscribeModal from './SubscribeModal'
import {
  buildTeaserModalCopy,
  getTeaserUserState,
  shouldPeekUnreleased,
} from './setSelectionTeaser'
import { splitSetsForDisplay } from './setSelectionOrder'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'

interface SetData {
  code: string
  name: string
  imageUrl?: string
  prereleaseDate?: string
  releaseDate?: string
  comingSoon?: boolean
}

export interface SetSelectionProps {
  onSetSelect: (setCode: string) => void
  onBack?: () => void
  title?: string
  headerAction?: React.ReactNode
}

function SetSelection({ onSetSelect, onBack, title, headerAction }: SetSelectionProps) {
  const { user, isPatron } = useAuth()
  const [rawSets, setRawSets] = useState<SetData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageFallbacks, setImageFallbacks] = useState<Record<string, number>>({})
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [isVertical, setIsVertical] = useState(false)

  // Check if user has beta access (beta tester or admin)
  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  // Three-state user model for the "Coming Soon" teaser. See
  // src/components/setSelectionTeaser.ts for the SPEC.
  const teaserState = getTeaserUserState(isPatron, user?.is_beta_tester, user?.is_admin)
  const peekUnreleased = shouldPeekUnreleased(teaserState)

  // Modal state for the teaser card click
  const [teaserModalOpen, setTeaserModalOpen] = useState(false)
  const [teaserModalSet, setTeaserModalSet] = useState<SetData | null>(null)

  // Check if we're in vertical (single column) mode
  useEffect(() => {
    const checkVertical = () => {
      setIsVertical(window.innerWidth <= 900)
    }

    checkVertical()
    window.addEventListener('resize', checkVertical)
    return () => window.removeEventListener('resize', checkVertical)
  }, [])

  useEffect(() => {
    // Wait for patron status to resolve before fetching. Without this guard
    // we'd briefly fetch without peekUnreleased and then re-fetch with it,
    // flashing the teaser in/out of view.
    if (teaserState === 'loading') return

    const loadSets = async () => {
      try {
        setLoading(true)
        const setsData = await fetchSets({ includeBeta: hasBetaAccess, peekUnreleased })
        setRawSets(setsData)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }
    loadSets()
  }, [hasBetaAccess, peekUnreleased, teaserState])

  // Both containers come from one split so they stay in one order. On mobile
  // they stack into a single column, so that column runs newest-first end to
  // end; on desktop they are two separate blocks in the fixed grid order.
  const { latest: latestSets, regular: sets } = splitSetsForDisplay(rawSets, isVertical)

  // U7 — track teaser exposure once per render cycle when a Coming Soon
  // teaser is visible to the current user. Captures "non-sub saw the
  // teaser" independently of whether they click it.
  const teaserSetCode = latestSets.find((s: SetData) => s.comingSoon)?.code
  useEffect(() => {
    if (teaserSetCode) {
      trackEvent(AnalyticsEvents.SUBSCRIBE_CTA_SHOWN, {
        surface: 'setPreview',
        setCode: teaserSetCode,
      })
    }
  }, [teaserSetCode])

  if (loading) {
    return (
      <div className="set-selection">
        <div className="loading"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="set-selection">
        <div className="error">Error: {error}</div>
        <Button variant="back" onClick={onBack}>Go Back</Button>
      </div>
    )
  }

  const handleImageError = (setCode: string, e: SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement
    // Try fallback URLs if primary pack art fails
    const fallbacks = [
      `https://swudb.com/images/packs/${setCode.toLowerCase()}.jpg`,
      `https://swudb.com/images/booster/${setCode}.jpg`,
      `https://swudb.com/images/sets/${setCode}.jpg`,
    ]

    const currentAttempt = imageFallbacks[setCode] || 0

    if (currentAttempt < fallbacks.length) {
      // Try next fallback URL
      target.src = fallbacks[currentAttempt]
      setImageFallbacks(prev => ({ ...prev, [setCode]: currentAttempt + 1 }))
    } else {
      // All fallbacks failed, mark as failed to show placeholder
      setFailedImages(prev => new Set([...prev, setCode]))
      target.style.display = 'none'
    }
  }

  const handleTeaserClick = (set: SetData) => {
    setTeaserModalSet(set)
    setTeaserModalOpen(true)
  }

  const renderSetCard = (set: SetData) => {
    if (set.comingSoon) {
      // "Coming Soon" teaser: lock icon, no Catalog link, click opens modal.
      return (
        <div
          key={set.code}
          className="set-card set-card--coming-soon"
          role="button"
          tabIndex={0}
          onClick={() => handleTeaserClick(set)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTeaserClick(set) }}
          aria-label={`${set.name} — Coming Soon. Subscribe for early access.`}
        >
          <div className="coming-soon-badge">
            <LockIcon />
            <span>Coming Soon</span>
          </div>
          <div className="set-image-container">
            {set.imageUrl && !failedImages.has(set.code) && (
              <img
                src={set.imageUrl}
                alt={`${set.name} booster pack`}
                className="set-image"
                onError={(e) => handleImageError(set.code, e)}
              />
            )}
            <div className="set-image-placeholder" style={{ display: (!set.imageUrl || failedImages.has(set.code)) ? 'flex' : 'none' }}>
              <div className="placeholder-text">{set.name}</div>
              <div className="placeholder-code">{set.code}</div>
            </div>
          </div>
          <div className="set-info">
            <h3>{set.name}</h3>
          </div>
        </div>
      )
    }

    const beta = isSetBeta(set)
    const prerelease = isSetPrerelease(set)
    const badgeText = beta ? 'Beta' : prerelease ? 'Pre-Release' : null
    const cardClass = beta ? 'set-card--beta' : prerelease ? 'set-card--prerelease' : ''
    return (
      <div
        key={set.code}
        className={`set-card ${cardClass}`}
        onClick={() => onSetSelect(set.code)}
      >
        {badgeText && <div className="beta-badge">{badgeText}</div>}
        <div className="set-image-container">
          {set.imageUrl && !failedImages.has(set.code) && (
            <img
              src={set.imageUrl}
              alt={`${set.name} booster pack`}
              className="set-image"
              onError={(e) => handleImageError(set.code, e)}
            />
          )}
          <div className="set-image-placeholder" style={{ display: (!set.imageUrl || failedImages.has(set.code)) ? 'flex' : 'none' }}>
            <div className="placeholder-text">{set.name}</div>
            <div className="placeholder-code">{set.code}</div>
          </div>
        </div>
        <div className="set-info">
          <h3>{set.name}</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="set-selection">
      <div className="set-selection-header">
        <h1>{title || 'Select a Set'}</h1>
        {headerAction && <div className="set-selection-header-action">{headerAction}</div>}
      </div>
      {latestSets.length > 0 && (
        <div className="latest-sets-row">
          {latestSets.map(renderSetCard)}
        </div>
      )}
      <div className="sets-grid">
        {sets.map(renderSetCard)}
      </div>
      <SubscribeModal
        isOpen={teaserModalOpen}
        onClose={() => setTeaserModalOpen(false)}
        {...buildTeaserModalCopy(teaserState, teaserModalSet?.name ?? '')}
        setCode={teaserModalSet?.code}
        surface="setPreview"
      />
    </div>
  )
}

// Small inline lock icon (line art). Stays here so the teaser card stays
// self-contained without pulling in an icon library.
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export default SetSelection
