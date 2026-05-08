// @ts-nocheck
/**
 * StickyInfoBar Component
 *
 * Displays the sticky navigation bar with:
 * - Selected leader/base names (clickable to scroll)
 * - Deck/Pool counts (clickable to scroll)
 * - Action buttons (Clone, Play, Share) when sticky
 */

import { useRef, type RefObject, type MouseEvent, type TouchEvent } from 'react'
import Button from '../Button'
import { getAspectColor } from '../../utils/aspectColors'
import { savePool } from '../../utils/poolApi'
import { ViewModeToggle, type ViewMode } from './ViewModeToggle'
import type { CardPosition } from './AspectPenaltyToggle'
import type { MessageType } from './DeleteDeckSection'
import type { PoolType } from './DeckImageModal'

// Helper to scroll to an element with offset
function scrollToElement(selector: string, wasCollapsed: boolean) {
  const element = document.querySelector(selector)
  if (element) {
    const headerElement = document.querySelector('.deck-info-bar') as HTMLElement | null
    const headerHeight = headerElement?.offsetHeight || 0
    const topOffset = 20
    const scrollOffset = headerHeight + topOffset + 10
    setTimeout(() => {
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset
      window.scrollTo({
        top: elementPosition - scrollOffset,
        behavior: 'smooth'
      })
    }, wasCollapsed ? 400 : 0)
  }
}

export interface StickyInfoBarProps {
  infoBarRef: RefObject<HTMLDivElement | null>
  isInfoBarSticky: boolean
  activeLeader: string | null
  activeBase: string | null
  cardPositions: Record<string, CardPosition>
  leadersExpanded: boolean
  setLeadersExpanded: (expanded: boolean) => void
  basesExpanded: boolean
  setBasesExpanded: (expanded: boolean) => void
  deckExpanded: boolean
  setDeckExpanded: (expanded: boolean) => void
  sideboardExpanded: boolean
  setSideboardExpanded: (expanded: boolean) => void
  onCardMouseEnter: (card: CardPosition['card'], e: MouseEvent | TouchEvent) => void
  onCardMouseLeave: () => void
  isDraftMode: boolean
  isInfiniteMode?: boolean
  isOwner: boolean
  isAuthenticated: boolean
  signIn: () => void
  shareId?: string
  draftShareId?: string | null
  setErrorMessage: (message: string | null) => void
  setMessageType: (type: MessageType | null) => void
  setCode: string
  cards: unknown[]
  savedState: unknown
  poolType: PoolType
  currentPoolName?: string
  builderLabel?: string | null
  // View mode toggle props
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  showNavTooltip: (text: string, e: MouseEvent, position?: 'left' | 'below') => void
  hideTooltip: () => void
  onPlay?: () => void
}

export function StickyInfoBar({
  infoBarRef,
  isInfoBarSticky,
  activeLeader,
  activeBase,
  cardPositions,
  leadersExpanded,
  setLeadersExpanded,
  basesExpanded,
  setBasesExpanded,
  deckExpanded,
  setDeckExpanded,
  sideboardExpanded,
  setSideboardExpanded,
  onCardMouseEnter,
  onCardMouseLeave,
  isDraftMode,
  isInfiniteMode = false,
  isOwner,
  isAuthenticated,
  signIn,
  shareId,
  draftShareId,
  setErrorMessage,
  setMessageType,
  setCode,
  cards,
  savedState,
  poolType,
  currentPoolName,
  builderLabel,
  viewMode,
  setViewMode,
  showNavTooltip,
  hideTooltip,
  onPlay,
}: StickyInfoBarProps) {
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Calculate deck counts
  const deckCardCount = Object.values(cardPositions)
    .filter(pos => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false).length
  const poolCardCount = Object.values(cardPositions)
    .filter(pos => (pos.section === 'sideboard' || pos.enabled === false) && pos.visible && !pos.card.isBase && !pos.card.isLeader).length
  const isDeckLegal = activeLeader && activeBase && deckCardCount >= 30
  const canUsePlayAction = Boolean(onPlay || shareId)

  // Get deck count color
  const getDeckCountColor = () => {
    if (deckCardCount < 30) return '#E74C3C' // Red
    if (deckCardCount === 30) return '#27AE60' // Green
    return '#F1C40F' // Yellow
  }

  // Handle clone action
  const handleClone = async () => {
    if (!isAuthenticated) {
      signIn()
      return
    }

    try {
      setErrorMessage('Cloning pool...')
      setMessageType('info')

      const clonedPool = await savePool({
        setCode: setCode,
        cards: cards,
        packs: null,
        deckBuilderState: savedState,
        poolType: poolType,
        name: currentPoolName ? `${currentPoolName} (Copy)` : null,
        isPublic: false
      })

      setErrorMessage('Pool cloned! Redirecting...')
      setMessageType('success')

      setTimeout(() => {
        window.location.href = `/pool/${clonedPool.shareId}/deck`
      }, 1000)
    } catch (err) {
      console.error('Failed to clone pool:', err)
      setErrorMessage('Failed to clone pool')
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    }
  }

  // Handle share action
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pool/${shareId}`)
      setErrorMessage('Share URL copied to clipboard!')
      setMessageType('success')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    } catch (err) {
      setErrorMessage('Failed to copy to clipboard')
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    }
  }

  // Handle play navigation
  const handlePlay = () => {
    if (isDeckLegal && onPlay) {
      onPlay()
    }
  }

  // Touch handlers for long press preview
  const handleTouchStart = (card: CardPosition['card'], e: TouchEvent) => {
    if (isInfoBarSticky) {
      longPressTimeoutRef.current = setTimeout(() => {
        onCardMouseEnter(card, e)
      }, 500)
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }
  }

  const leaderCard = activeLeader && cardPositions[activeLeader]?.card
  const baseCard = activeBase && cardPositions[activeBase]?.card
  const deckAnchorSelector = viewMode === 'arena' ? '#arena-deck-header' : viewMode === 'list' ? '#deck-list-header' : '#deck-header'
  const poolAnchorSelector = viewMode === 'arena' ? '#arena-pool-header' : viewMode === 'list' ? '#pool-list-header' : '#pool-header'

  return (
    <div className={`deck-info-bar ${isInfoBarSticky ? 'sticky' : ''}`} ref={infoBarRef}>
      <div className="selected-cards-info">
        {/* Leader display */}
        <div
          className={`selected-card-container ${!activeLeader ? 'select-card-placeholder' : ''} ${isInfoBarSticky ? 'sticky-layout' : 'inline-layout'}`}
          onClick={() => {
            const wasCollapsed = !leadersExpanded
            if (wasCollapsed) setLeadersExpanded(true)
            scrollToElement('.blocks-leaders-row .card-block', wasCollapsed)
          }}
          style={{ cursor: 'pointer' }}
        >
          {leaderCard ? (
            <>
              <span
                className="selected-card-name"
                style={{ color: getAspectColor(leaderCard) }}
                onMouseEnter={(e) => isInfoBarSticky && onCardMouseEnter(leaderCard, e)}
                onMouseLeave={() => isInfoBarSticky && onCardMouseLeave()}
                onTouchStart={(e) => handleTouchStart(leaderCard, e)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
              >
                {leaderCard.name}
              </span>
              {leaderCard.subtitle && (
                <span className="selected-card-subtitle">{leaderCard.subtitle as string}</span>
              )}
            </>
          ) : (
            <span className="selected-card-name">(Select a Leader)</span>
          )}
        </div>

        <span className="separator"></span>

        {/* Base display */}
        <div
          className={`selected-card-container ${!activeBase ? 'select-card-placeholder' : ''}`}
          onClick={() => {
            const wasCollapsed = !basesExpanded
            if (wasCollapsed) setBasesExpanded(true)
            scrollToElement('.blocks-bases-row .card-block', wasCollapsed)
          }}
          style={{ cursor: 'pointer' }}
        >
          {baseCard ? (
            <span
              className="selected-card-name"
              style={{ color: getAspectColor(baseCard) }}
              onMouseEnter={(e) => isInfoBarSticky && onCardMouseEnter(baseCard, e)}
              onMouseLeave={() => isInfoBarSticky && onCardMouseLeave()}
              onTouchStart={(e) => handleTouchStart(baseCard, e)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            >
              {baseCard.name}
            </span>
          ) : (
            <span className="selected-card-name">(Select a Base)</span>
          )}
        </div>

        {isInfoBarSticky && builderLabel && (
          <span className="sticky-builder-label">by {builderLabel}</span>
        )}
      </div>

      <div className="deck-counts-info">
        {/* Deck count */}
        <span
          className="section-link"
          onClick={() => {
            const wasCollapsed = !deckExpanded
            if (wasCollapsed) setDeckExpanded(true)
            scrollToElement(deckAnchorSelector, wasCollapsed)
          }}
          style={{ cursor: 'pointer' }}
        >
          <span className="section-link-label">Deck</span>{' '}
          <span className="section-link-count">(<span style={{ color: getDeckCountColor() }}>{deckCardCount}</span>/30)</span>
        </span>

        <span className="separator"></span>

        {/* Pool/Sideboard count */}
        <span
          className="section-link"
          onClick={() => {
            const wasCollapsed = !sideboardExpanded
            if (wasCollapsed) setSideboardExpanded(true)
            scrollToElement(poolAnchorSelector, wasCollapsed)
          }}
          style={{ cursor: 'pointer' }}
        >
          <span className="section-link-label">{isInfiniteMode ? 'Pool' : isDraftMode ? 'Card Pool' : 'Sideboard'}</span>{' '}
          <span className="section-link-count">({poolCardCount})</span>
        </span>

        {/* View mode toggle between Sideboard and action buttons (desktop) */}
        {isInfoBarSticky && (
          <ViewModeToggle
            viewMode={viewMode}
            setViewMode={setViewMode}
            showNavTooltip={showNavTooltip}
            hideTooltip={hideTooltip}
          />
        )}
      </div>

      {/* Action buttons + view mode toggle row when sticky */}
      {isInfoBarSticky && (
        <div className="header-buttons-in-nav">
          {/* View mode toggle (mobile row companion) */}
          <div className="mobile-view-mode-in-nav">
            <ViewModeToggle
              viewMode={viewMode}
              setViewMode={setViewMode}
              showNavTooltip={showNavTooltip}
              hideTooltip={hideTooltip}
            />
          </div>
          {/* Clone button for non-owners */}
          {!isInfiniteMode && !isOwner && (
            <Button variant="icon" className="export-button-icon" onClick={handleClone}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span className="button-tooltip tooltip-below">Clone</span>
            </Button>
          )}

          {/* Play button */}
          {canUsePlayAction && (
            <Button
              variant="icon"
              className={`export-button-icon ready-to-play-icon ${!isDeckLegal ? 'disabled' : ''}`}
              onClick={handlePlay}
              disabled={!isDeckLegal}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span className="button-tooltip tooltip-below">{isDeckLegal ? 'Ready to Play' : 'Create Deck to Continue'}</span>
            </Button>
          )}

          {/* Clone button for owners */}
          {!isInfiniteMode && isOwner && (
            <Button variant="icon" className="export-button-icon" onClick={handleClone}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span className="button-tooltip tooltip-below">Clone</span>
            </Button>
          )}

          {/* Copy Share URL moved to PoolBuilds card list */}
        </div>
      )}
    </div>
  )
}

export default StickyInfoBar
