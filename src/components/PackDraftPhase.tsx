// @ts-nocheck
'use client'

import { useState, useRef, useEffect } from 'react'
import PlayerCircle from './PlayerCircle'
import DraftableCard from './DraftableCard'
import TimerPanel from './TimerPanel'
import DraftReviewModal from './DraftReviewModal'
import CountdownTimer from './CountdownTimer'
import Button from './Button'
import { CardPreview } from './DeckBuilder/CardPreview'
import useCardPreview from '../hooks/useCardPreview'
import { getSingleAspectColor, NO_ASPECT_COLOR } from '../utils/aspectColors'
import { getSetConfig } from '../utils/setConfigs'
import './PackDraftPhase.css'

const ReviewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
)

interface Card {
  id?: string
  instanceId?: string
  name?: string
  title?: string
  subtitle?: string
  aspects?: string[]
  rarity?: string
  cost?: number
  isFoil?: boolean
  imageUrl?: string
  [key: string]: unknown
}

interface Leader {
  name: string
  imageUrl?: string
  backImageUrl?: string
  [key: string]: unknown
}

interface Player {
  id: string
  pickStatus?: 'picked' | 'selected' | 'picking' | 'timeout'
  [key: string]: unknown
}

interface MyPlayer extends Player {
  currentPack?: Card[]
  draftedCards?: Card[]
  draftedLeaders?: Leader[]
}

interface DraftState {
  packNumber?: number
  pickInPack?: number
  reviewUntil?: string
  [key: string]: unknown
}

interface Draft {
  maxPlayers?: number
  packSize?: number
  competitive?: boolean
  [key: string]: unknown
}

interface HoveredLeaderPreview {
  leader: Leader
  x: number | null
  y: number | null
}

interface PackDraftPhaseProps {
  draft: Draft | null
  players: Player[]
  myPlayer: MyPlayer | null
  draftState: DraftState | null
  onSelect: (cardId: string | null) => void
  loading: boolean
  error: string | null
  isHost: boolean
  onTogglePause: () => void
  onUpdateTimerSettings?: (settings: Record<string, unknown>) => void
  shareId: string
  onTimerExpire: () => void
}

function PackDraftPhase({
  draft,
  players,
  myPlayer,
  draftState,
  onSelect,
  loading,
  error,
  isHost,
  onTogglePause,
  onUpdateTimerSettings,
  shareId,
  onTimerExpire,
}: PackDraftPhaseProps) {

  const [showReviewModal, setShowReviewModal] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hoveredLeaderPreview, setHoveredLeaderPreview] = useState<HoveredLeaderPreview | null>(null)
  const {
    hoveredCardPreview: reviewHoveredCard,
    handleCardMouseEnter: reviewHandleMouseEnter,
    handleCardMouseLeave: reviewHandleMouseLeave,
    handlePreviewMouseEnter: reviewHandlePreviewMouseEnter,
    handlePreviewMouseLeave: reviewHandlePreviewMouseLeave,
    handleCardTouchStart: reviewHandleTouchStart,
    handleCardTouchEnd: reviewHandleTouchEnd,
    dismissPreview: reviewDismissPreview,
  } = useCardPreview()
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [showPassing, setShowPassing] = useState(false)
  const [lastPackSize, setLastPackSize] = useState(0)
  const [, forceUpdate] = useState(0)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const passingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const passingFromPackRef = useRef<string | null>(null) // Track the first card ID when we started passing
  // Always-fresh ref to currentPack so the click-time validation in
  // handleCardClick can't be fooled by a stale closure when a click fires
  // on a DOM element rendered before the latest state update arrived.
  const currentPackRef = useRef<Card[]>([])

  // Exit fullscreen on Escape
  useEffect(() => {
    if (!isFullscreen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  // Force re-render when review period ends
  useEffect(() => {
    if (draftState?.reviewUntil) {
      const remaining = new Date(draftState.reviewUntil).getTime() - Date.now()
      if (remaining > 0) {
        const timer = setTimeout(() => forceUpdate(n => n + 1), remaining + 100)
        return () => clearTimeout(timer)
      }
    }
  }, [draftState?.reviewUntil])

  const handleLeaderNameMouseEnter = (e: React.MouseEvent, leader: Leader) => {
    // Disable hover preview on mobile
    if (window.innerWidth <= 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
      return
    }

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    previewTimeoutRef.current = setTimeout(() => {
      // Static preview in left half of screen
      setHoveredLeaderPreview({ leader, x: null, y: null })
    }, 500)
  }

  const handleLeaderNameMouseLeave = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    setHoveredLeaderPreview(null)
  }

  const currentPack = myPlayer?.currentPack || []
  currentPackRef.current = currentPack
  const draftedCards = myPlayer?.draftedCards || []
  const draftedLeaders = myPlayer?.draftedLeaders || []
  const totalPacks = draftState?.totalPacks || draft?.settings?.chaosSets?.length || 3
  const canSelect = (myPlayer?.pickStatus === 'picking' || myPlayer?.pickStatus === 'selected') && currentPack.length > 0
  const hasSelected = myPlayer?.pickStatus === 'selected'

  const packNumber = draftState?.packNumber || 1
  const pickInPack = draftState?.pickInPack || 1

  // Local selection state, persisted to localStorage
  const storageKey = `draft-selection-${shareId}-pack-${packNumber}-${pickInPack}`

  // Load selection from localStorage on mount and when pick changes
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored && currentPack.some(c => (c.instanceId || c.id) === stored)) {
      setSelectedCardId(stored)
    } else {
      setSelectedCardId(null)
    }
  }, [storageKey, currentPack])

  // Sync localStorage selection with server on mount (in case of refresh)
  // Only re-send if the stored card is still in the current pack
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored && canSelect && myPlayer?.pickStatus === 'picking') {
      // Verify the stored card is still available before re-sending
      const cardStillAvailable = currentPack.some(c => (c.instanceId || c.id) === stored)
      if (cardStillAvailable) {
        onSelect(stored)
      } else {
        // Clear stale selection
        localStorage.removeItem(storageKey)
        setSelectedCardId(null)
      }
    }
  }, []) // Only on mount

  // Clear localStorage when pick advances (currentPack changes)
  useEffect(() => {
    if (myPlayer?.pickStatus === 'picking' && !hasSelected) {
      // New pick started, clear old selection if card no longer in pack
      const stored = localStorage.getItem(storageKey)
      if (stored && !currentPack.some(c => (c.instanceId || c.id) === stored)) {
        localStorage.removeItem(storageKey)
        setSelectedCardId(null)
      }
    }
  }, [currentPack, myPlayer?.pickStatus, hasSelected, storageKey])

  // Clear old pack selections when pack/pick changes
  useEffect(() => {
    // Clean up selections from previous picks in localStorage
    // This prevents stale selections from being re-sent after pause/unpause
    const keysToCheck: string[] = []
    for (let p = 1; p <= totalPacks; p++) {
      for (let pick = 1; pick <= 16; pick++) {
        const key = `draft-selection-${shareId}-pack-${p}-${pick}`
        if (key !== storageKey) {
          keysToCheck.push(key)
        }
      }
    }
    keysToCheck.forEach(key => localStorage.removeItem(key))
  }, [packNumber, pickInPack, shareId, storageKey, totalPacks])

  // Track the previous pick number to detect when packs should pass
  const prevPickRef = useRef({ packNumber: 0, pickInPack: 0 })

  // Manage "passing" state - show skeleton cards when transitioning between picks
  // Show passing when: pickStatus is 'picked' OR when all players have picked (from public data)
  useEffect(() => {
    // Use status from players array (WebSocket) - it's more up-to-date than myPlayer (HTTP)
    const myPublicPlayer = players?.find(p => p.id === myPlayer?.id)
    const myStatus = myPublicPlayer?.pickStatus || myPlayer?.pickStatus

    const isPicked = myStatus === 'picked'
    const hasSelected = myStatus === 'selected'
    const hasNoCards = currentPack.length === 0
    const pickChanged = prevPickRef.current.packNumber !== packNumber ||
                        prevPickRef.current.pickInPack !== pickInPack

    // Check if all players are done (picked or selected)
    const allPlayersDone = players?.length > 0 && players.every(p =>
      p.pickStatus === 'picked' || p.pickStatus === 'selected'
    )

    // Update previous pick tracking
    if (pickChanged && currentPack.length > 0) {
      prevPickRef.current = { packNumber, pickInPack }
    }

    // Calculate expected next pack size
    const calculateExpectedSize = () => {
      if (currentPack.length > 0) {
        return Math.max(0, currentPack.length - 1)
      }
      return Math.max(0, (draft?.packSize || 14) - draftedCards.length % (draft?.packSize || 14) - 1)
    }

    // Get first card ID to track pack identity
    const firstCardId = currentPack[0]?.instanceId || currentPack[0]?.id || null

    // Show passing when:
    // 1. I've picked and waiting for others
    // 2. All players are done (picked or selected) - round about to advance
    // 3. Waiting for pack data after pick advanced
    if (isPicked || allPlayersDone) {
      // Remember what pack we're passing FROM
      if (!showPassing && firstCardId) {
        passingFromPackRef.current = firstCardId
      }
      setShowPassing(true)
      const expectedSize = calculateExpectedSize()
      setLastPackSize(expectedSize > 0 ? expectedSize : lastPackSize)
    } else if (hasNoCards && myStatus === 'picking') {
      // Waiting for pack data after pick advanced, keep showing passing
      setShowPassing(true)
    } else if (currentPack.length > 0 && myStatus === 'picking') {
      // Only hide passing if we have a DIFFERENT pack than when we started passing
      const packHasChanged = passingFromPackRef.current !== null &&
        firstCardId !== passingFromPackRef.current

      if (packHasChanged) {
        // New pack arrived, hide passing after brief delay
        if (passingTimeoutRef.current) {
          clearTimeout(passingTimeoutRef.current)
        }
        passingTimeoutRef.current = setTimeout(() => {
          setShowPassing(false)
          passingFromPackRef.current = null
        }, 100)
      }
      // If pack hasn't changed, keep showing passing (waiting for new pack)
    }

    return () => {
      if (passingTimeoutRef.current) {
        clearTimeout(passingTimeoutRef.current)
      }
    }
  }, [myPlayer?.pickStatus, currentPack, packNumber, pickInPack, draft?.packSize, draftedCards.length, lastPackSize, players, showPassing])

  // Pack draft: pack 1 & 3 pass left, pack 2 passes right
  const passDirection = packNumber % 2 === 1 ? 'left' : 'right'

  // Sort cards by rarity (common first, then uncommon, rare, legendary), foil always last
  const sortCards = (cards: Card[]) => {
    const sorted = [...cards]
    const rarityOrder: Record<string, number> = { 'Common': 0, 'Uncommon': 1, 'Rare': 2, 'Legendary': 3 }
    return sorted.sort((a, b) => {
      // Foils always go last
      if (a.isFoil && !b.isFoil) return 1
      if (!a.isFoil && b.isFoil) return -1
      // Then sort by rarity
      return (rarityOrder[a.rarity || ''] ?? 4) - (rarityOrder[b.rarity || ''] ?? 4)
    })
  }

  const sortedPack = sortCards(currentPack)

  const handleCardClick = (card: Card) => {
    if (loading || !canSelect) return

    const cardId = card.instanceId || card.id

    // Validate the card is still in the LATEST current pack (via ref, not
    // closure). The closure's `currentPack` could be stale if this click
    // handler was attached during a previous render and a new pack has
    // since arrived via socket.
    const freshPack = currentPackRef.current
    const cardStillInPack = freshPack.some(c => (c.instanceId || c.id) === cardId)
    if (!cardStillInPack && selectedCardId !== cardId) {
      console.warn('Card no longer in pack, ignoring click')
      return
    }

    if (selectedCardId === cardId) {
      // Unselect
      localStorage.removeItem(storageKey)
      setSelectedCardId(null)
      onSelect(null)
    } else {
      // Select new card
      localStorage.setItem(storageKey, cardId!)
      setSelectedCardId(cardId!)
      onSelect(cardId!)
    }
  }

  const handleCardRightClick = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  const handleDeselect = (e: React.MouseEvent) => {
    e.stopPropagation()
    localStorage.removeItem(storageKey)
    setSelectedCardId(null)
    onSelect(null)
  }

  // Inter-pack review period for competitive drafts
  const isReviewPeriod = draft?.competitive &&
    draftState?.reviewUntil &&
    new Date(draftState.reviewUntil).getTime() > Date.now()

  const reviewStartedAt = isReviewPeriod
    ? new Date(new Date(draftState!.reviewUntil!).getTime() - 30 * 1000).toISOString()
    : null

  if (isReviewPeriod) {
    return (
      <div className="pack-draft-phase">
        <div className="review-period" style={{ textAlign: 'center', padding: '32px' }}>
          <h3 style={{ color: 'rgba(255, 215, 0, 0.9)', marginBottom: '8px' }}>Review Your Cards</h3>
          <p style={{ marginBottom: '16px', opacity: 0.8 }}>Next pack starts in:</p>
          <CountdownTimer
            totalSeconds={30}
            startedAt={reviewStartedAt}
            active={true}
            label=""
            warningThreshold={10}
          />
          <div
            className="review-cards"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              justifyContent: 'center',
              marginTop: '24px',
            }}
          >
            {draftedCards.map(card => (
              <div
                key={card.instanceId || card.id}
                style={{ flexShrink: 0, cursor: 'zoom-in' }}
                onMouseEnter={(e) => reviewHandleMouseEnter(card, e)}
                onMouseLeave={reviewHandleMouseLeave}
                onTouchStart={() => reviewHandleTouchStart(card)}
                onTouchEnd={reviewHandleTouchEnd}
              >
                <img
                  src={card.imageUrl}
                  alt={card.name || card.title || 'Card'}
                  style={{ width: '80px', borderRadius: '4px', display: 'block' }}
                />
              </div>
            ))}
          </div>
        </div>
        {reviewHoveredCard && (
          <CardPreview
            card={reviewHoveredCard.card}
            x={reviewHoveredCard.x}
            y={reviewHoveredCard.y}
            isMobile={reviewHoveredCard.isMobile}
            onMouseEnter={reviewHandlePreviewMouseEnter}
            onMouseLeave={reviewHandlePreviewMouseLeave}
            onDismiss={reviewDismissPreview}
          />
        )}
      </div>
    )
  }

  return (
    <div className="pack-draft-phase">
      <div className={`draft-layout${isFullscreen ? ' draft-layout-expanded' : ''}`}>
        <div className="players-section">
          <PlayerCircle
            players={players}
            maxPlayers={draft?.maxPlayers || 8}
            currentUserId={myPlayer?.id}
            showStatus={true}
            draft={draft}
            showTimers={true}
            hideEmptySeats={true}
            isHost={isHost}
            onTogglePause={onTogglePause}
            passDirection={passDirection}
            showLeaderInfo="simple"
          />
        </div>

        <div className={`cards-section${isFullscreen ? ' cards-section-fullscreen' : ''}`}>
          {/* Timer bar above pick area - TimerPanel handles its own visibility */}
          <TimerPanel
            draft={draft}
            players={players}
            compact={false}
            isHost={isHost}
            onTogglePause={onTogglePause}
            onUpdateTimerSettings={onUpdateTimerSettings}
            draftState={draftState}
            onTimerExpire={onTimerExpire}
          />

          <div className="draft-info-header">
            <div className="my-leaders-info">
              <span className="info-label">Your Leaders:</span>
              {draftedLeaders.length > 0 ? (
                <div className="leader-thumbnails">
                  {draftedLeaders.map((l, idx) => (
                    <div
                      key={idx}
                      className="leader-thumbnail"
                      onMouseEnter={(e) => handleLeaderNameMouseEnter(e, l)}
                      onMouseLeave={handleLeaderNameMouseLeave}
                    >
                      <img
                        src={l.imageUrl}
                        alt={l.name}
                        className="leader-thumbnail-img"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <span className="info-value">None</span>
              )}
            </div>
            <div className="draft-progress-info">
              <span className="progress-item">
                <span className="info-label">Cards:</span>
                <span className="info-value">{draftedCards.length}/{(draft?.packSize || 14) * totalPacks}</span>
              </span>
              {!draft?.competitive && (
                <Button variant="secondary" size="sm" className="review-button" onClick={() => setShowReviewModal(true)}>
                  <ReviewIcon />
                  <span>Your Cards</span>
                </Button>
              )}
              {draft?.competitive && (
                <span className="competitive-card-count" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                  {draftedCards?.length || 0} cards drafted
                </span>
              )}
            </div>
          </div>

          <Button variant="icon" size="sm" className="fullscreen-toggle-button" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, opacity: 0.6 }} onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            )}
          </Button>

          <div className="current-pack">
            {draft?.settings?.draftMode === 'chaos' && (() => {
              const chaosSets = draft?.settings?.chaosSets
              const setCode = chaosSets?.[packNumber - 1]
              const config = setCode ? getSetConfig(setCode) : null
              const color = config?.color || '#9B59B6'
              return (
                <div className="pack-set-bar" style={{ background: `${color}18`, borderColor: color }}>
                  <span className="pack-set-name">{config?.setName || setCode}</span>
                  <span className="pack-set-separator">·</span>
                  <span className="pack-set-code">{setCode}</span>
                </div>
              )
            })()}
            {/* Show skeleton cards when waiting for next pack */}
            {showPassing && (lastPackSize > 0 || currentPack.length > 0) ? (
              <div className="pack-grid">
                {Array.from({ length: lastPackSize || currentPack.length }).map((_, idx) => (
                  <div key={`skeleton-${idx}`} className="skeleton-card">
                    <div className="skeleton-shimmer"></div>
                  </div>
                ))}
              </div>
            ) : sortedPack.length > 0 ? (
              <div className="pack-grid">
                {sortedPack.map((card) => {
                  const cardId = card.instanceId || card.id
                  return (
                    <DraftableCard
                      key={cardId}
                      card={card}
                      onClick={() => handleCardClick(card)}
                      onRightClick={(e: React.MouseEvent) => handleCardRightClick(e)}
                      disabled={loading}
                      selected={selectedCardId === cardId}
                      dimmed={!!(selectedCardId && selectedCardId !== cardId)}
                      useStaticPreview={true}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="no-cards">
                {myPlayer?.pickStatus === 'picked'
                  ? 'Waiting for other players...'
                  : 'No cards in pack'}
              </p>
            )}
          </div>

          {/* Passing message - below cards */}
          {showPassing && (lastPackSize > 0 || currentPack.length > 0) && (
            <div className="passing-message">
              Passing {passDirection === 'left' ? 'Left' : 'Right'}...
            </div>
          )}

          {/* Selection confirmation banner - below cards */}
          {selectedCardId && !showPassing && (() => {
            const selectedCard = currentPack.find(c => (c.instanceId || c.id) === selectedCardId)
            if (!selectedCard || !selectedCard.name) return null
            const firstAspect = selectedCard.aspects?.[0]
            const aspectColor = firstAspect ? getSingleAspectColor(firstAspect) : NO_ASPECT_COLOR
            return (
              <div
                className="selection-confirmation-banner"
                style={{
                  background: `linear-gradient(135deg, ${aspectColor}33 0%, ${aspectColor}22 100%)`,
                  borderColor: aspectColor,
                }}
              >
                <div className="selection-info">
                  <span className="selection-label">Selected:</span>
                  <span className="selection-card-name" style={{ color: aspectColor }}>
                    {selectedCard.name || selectedCard.title || 'Card'}
                  </span>
                  {selectedCard.subtitle && (
                    <span className="selection-card-subtitle">{selectedCard.subtitle}</span>
                  )}
                </div>
                {hasSelected ? (
                  // Only show "Waiting" if there are players who aren't done yet
                  players?.some(p => p.pickStatus !== 'picked' && p.pickStatus !== 'selected') ? (
                    <div className="selection-status-text">Waiting for other players...</div>
                  ) : null
                ) : (
                  <button className="deselect-button" onClick={(e) => handleDeselect(e)} title="Deselect">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            )
          })()}

        </div>
      </div>

      {error && <div className="phase-error">{error}</div>}



      {showReviewModal && (
        <DraftReviewModal
          draftedCards={draftedCards}
          draftedLeaders={draftedLeaders}
          packSize={draft?.packSize || 14}
          draft={draft}
          players={players}
          isHost={isHost}
          onTogglePause={onTogglePause}
          onTimerExpire={onTimerExpire}
          onClose={() => setShowReviewModal(false)}
        />
      )}

      {hoveredLeaderPreview && (() => {
        const leader = hoveredLeaderPreview.leader
        const hasBackImage = leader.backImageUrl

        // Calculate scaled dimensions for static preview
        const scale = 0.6 // Scale down to 60% for dual images
        const scaledFrontWidth = 504 * scale
        const scaledFrontHeight = 360 * scale
        const scaledBackWidth = 360 * scale
        const scaledBackHeight = 504 * scale

        return (
          <div
            className="card-preview-enlarged"
            style={{
              position: 'fixed',
              right: '0',
              top: '0',
              width: '50vw',
              height: '100vh',
              zIndex: 9999,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingLeft: '20px',
            }}
          >
            {hasBackImage ? (
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                {/* Front - horizontal */}
                <div style={{
                  width: `${scaledFrontWidth}px`,
                  height: `${scaledFrontHeight}px`,
                  overflow: 'hidden',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                }}>
                  <img
                    src={leader.imageUrl}
                    alt={leader.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
                {/* Back - vertical */}
                <div style={{
                  width: `${scaledBackWidth}px`,
                  height: `${scaledBackHeight}px`,
                  overflow: 'hidden',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                }}>
                  <img
                    src={leader.backImageUrl}
                    alt={`${leader.name} - Back`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{
                width: `${504 * 1.5}px`,
                height: `${360 * 1.5}px`,
                overflow: 'hidden',
                borderRadius: '24px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
              }}>
                <img
                  src={leader.imageUrl}
                  alt={leader.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

export default PackDraftPhase
