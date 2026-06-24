// @ts-nocheck
/**
 * DeckBuilderHeader Component
 *
 * Displays the main header for the deck builder including:
 * - Editable pool name
 * - Pool type (Draft/Sealed)
 * - Action buttons (Clone, Play, Share)
 * - Status messages
 */

import { useState } from 'react'
import EditableTitle from '../EditableTitle'
import Button from '../Button'
import DraftReportButton from '../DraftReportButton'
import PoolBuilds from '../PoolBuilds'
import { savePool } from '../../utils/poolApi'
import DeckBuildTimer from './DeckBuildTimer'
import type { CardPosition } from './AspectPenaltyToggle'
import type { MessageType } from './DeleteDeckSection'
import type { PoolType } from './DeckImageModal'

export interface DeckBuilderHeaderProps {
  currentPoolName?: string
  onRenamePool: (name: string) => void
  isOwner: boolean
  isDraftMode: boolean
  isInfiniteMode?: boolean
  isInfoBarSticky: boolean
  isAuthenticated: boolean
  signIn: () => void
  shareId?: string
  cardPositions: Record<string, CardPosition>
  activeLeader: string | null
  activeBase: string | null
  setCode: string
  cards: unknown[]
  savedState: unknown
  poolType: PoolType
  errorMessage: string | null
  setErrorMessage: (message: string | null) => void
  messageType: MessageType | null
  setMessageType: (type: MessageType | null) => void
  draftShareId?: string | null
  isLoading?: boolean
  isPatron?: boolean
  deckBuildDeadline?: string | null
  onPlay?: () => void
  rootShareId?: string | null
  currentUserId?: string | null
  subtitleOverride?: string | null
  competitive?: boolean
  /** Swiss Practice: primary deck is frozen (no rename, no forced-forward timer). */
  swissLocked?: boolean
  /** Pod owner can toggle the pod-level lock for everyone. */
  swissCanUnlock?: boolean
  onToggleSwissLock?: () => void
  /** Swiss Practice is underway but decks are unlocked: show the lock area in its
   *  "tap to lock again" state instead of the expired build timer. */
  swissUnlocked?: boolean
  /** Competitive event in progress (not yet complete): hide Stats / Draft Log /
   *  Draft Report until the Swiss event is over. */
  swissInProgress?: boolean
}

export function DeckBuilderHeader({
  currentPoolName,
  onRenamePool,
  isOwner,
  isDraftMode,
  isInfiniteMode = false,
  isInfoBarSticky,
  isAuthenticated,
  signIn,
  shareId,
  cardPositions,
  activeLeader,
  activeBase,
  setCode,
  cards,
  savedState,
  poolType,
  errorMessage,
  setErrorMessage,
  messageType,
  setMessageType,
  draftShareId,
  isLoading,
  isPatron,
  deckBuildDeadline,
  onPlay,
  rootShareId = null,
  currentUserId = null,
  subtitleOverride = null,
  competitive = false,
  swissLocked = false,
  swissCanUnlock = false,
  onToggleSwissLock,
  swissUnlocked = false,
  swissInProgress = false,
}: DeckBuilderHeaderProps) {
  // Calculate deck legality for Play button
  const deckCardCount = Object.values(cardPositions)
    .filter(pos => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false).length
  const isDeckLegal = activeLeader && activeBase && deckCardCount >= 30
  const canUsePlayAction = Boolean(onPlay || shareId)

  // Inline status messages — anchored to their respective controls.
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [buildMessage, setBuildMessage] = useState<string | null>(null)

  // Handle build from pool action — always creates a new build (no dedup).
  const handleBuildFromPool = async () => {
    if (!isAuthenticated) {
      signIn()
      return
    }

    try {
      setBuildMessage('Creating new build.')

      const parentId = rootShareId || shareId
      const builtPool = await savePool({
        setCode: setCode,
        cards: cards,
        packs: null,
        deckBuilderState: savedState,
        poolType: poolType,
        name: null,
        isPublic: false,
        parentPoolId: parentId,
      })

      setTimeout(() => {
        window.location.href = `/pool/${parentId}/deck/${builtPool.shareId}`
      }, 600)
    } catch (err) {
      console.error('Failed to create build:', err)
      setBuildMessage('Failed to create build')
      setTimeout(() => setBuildMessage(null), 3000)
    }
  }

  // Handle copy share URL
  const handleCopyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pool/${shareId}`)
      setShareMessage('Copied!')
      setTimeout(() => setShareMessage(null), 2500)
    } catch (err) {
      setShareMessage('Failed to copy')
      setTimeout(() => setShareMessage(null), 3000)
    }
  }

  // Handle navigate to play
  const handlePlay = () => {
    if (isDeckLegal && onPlay) {
      onPlay()
    }
  }

  return (
    <div className="deck-builder-header">
      <div className="deck-builder-header-title-container">
        <h1>
          <EditableTitle
            value={currentPoolName}
            onSave={onRenamePool}
            isEditable={isOwner && !swissLocked}
            placeholder="Deck Builder"
          />
        </h1>
        <p className="deck-builder-pool-type">{subtitleOverride || (isInfiniteMode ? 'Limited Deckbuilder' : isDraftMode ? 'Draft Pool' : 'Sealed Pool')}{competitive && ' · Competitive'}</p>
      </div>

      {/* Swiss Practice lock indicator. Replaces the build timer once the deck is
          frozen. For the pod owner it's a button that toggles the pod-level lock
          for everyone; for everyone else it's a non-interactive "warning" badge.
          Note: the timer NEVER forces the user forward anymore — it just counts
          down, and when time is up the lock indicator takes over. Once the owner
          unlocks (swissUnlocked), the SAME area stays put but flips to an open
          padlock with "tap to lock again" — we never fall back to a dead 0:00
          build timer. */}
      {swissLocked ? (
        <div className="deck-build-lock">
          <Button
            variant="warning"
            disabled={!swissCanUnlock}
            onClick={swissCanUnlock ? onToggleSwissLock : undefined}
            title={swissCanUnlock
              ? 'Unlock every player’s deck for this pod'
              : undefined}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>
              {swissCanUnlock
                ? 'Swiss Practice in progress — tap to unlock decks'
                : 'Swiss Practice in progress — primary deck can’t be edited'}
            </span>
          </Button>
        </div>
      ) : swissUnlocked ? (
        <div className="deck-build-lock">
          <Button
            variant="primary"
            disabled={!swissCanUnlock}
            onClick={swissCanUnlock ? onToggleSwissLock : undefined}
            title={swissCanUnlock
              ? 'Lock every player’s deck for this pod again'
              : undefined}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
            <span>
              {swissCanUnlock
                ? 'Swiss Practice in progress — decks unlocked · tap to lock again'
                : 'Swiss Practice in progress — decks unlocked by the host'}
            </span>
          </Button>
        </div>
      ) : deckBuildDeadline && new Date(deckBuildDeadline).getTime() > Date.now() ? (
        <DeckBuildTimer deadline={deckBuildDeadline} />
      ) : null}

      {!isLoading && <div className={`header-buttons ${isInfoBarSticky ? 'hidden' : ''}`}>
        {/* Play button */}
        {canUsePlayAction && (
          <Button
            variant="primary"
            className={`export-button ready-to-play-button ${!isDeckLegal ? 'disabled' : ''}`}
            onClick={handlePlay}
            disabled={!isDeckLegal}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>{isDeckLegal ? 'Ready to Play' : 'Finish Deckbuilding to Play'}</span>
          </Button>
        )}

        {shareId && !swissInProgress && (
          <Button
            variant="secondary"
            className="export-button"
            onClick={() => { window.open(`/pool/${shareId}/deck/stats`, '_blank', 'noopener') }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19V5"></path>
              <path d="M4 19h16"></path>
              <rect x="7" y="11" width="3" height="5" rx="1"></rect>
              <rect x="12" y="8" width="3" height="8" rx="1"></rect>
              <rect x="17" y="6" width="3" height="10" rx="1"></rect>
            </svg>
            <span>Stats</span>
          </Button>
        )}

        {/* Copy Share URL moved to the PoolBuilds card list (icon-only chip). */}

        {/* Draft Log button — hidden when the owner is a patron (they get the
            richer Draft Report button below instead). */}
        {draftShareId && !(isPatron && isOwner) && !swissInProgress && (
          <Button
            variant="secondary"
            className="export-button"
            onClick={() => { window.location.href = `/draft/${draftShareId}/log` }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>Draft Log</span>
          </Button>
        )}

        {/* Draft Report button (FOP only) */}
        {draftShareId && isPatron && isOwner && !swissInProgress && (
          <DraftReportButton draftShareId={draftShareId} />
        )}
      </div>}

      {rootShareId && (
        <PoolBuilds
          shareId={rootShareId}
          currentUserId={currentUserId}
          isOwner={isOwner}
          activeShareId={shareId || null}
          onCreateBuild={handleBuildFromPool}
          createBuildMessage={buildMessage}
          onCopyShare={shareId ? handleCopyShareUrl : undefined}
        />
      )}

      {errorMessage && (
        <div className="error-message" style={{
          marginTop: '1rem',
          marginLeft: 'auto',
          marginRight: 'auto',
          padding: '0.5rem 1rem',
          background: messageType === 'error' ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 100, 255, 0.2)',
          border: messageType === 'error' ? '1px solid #ff0000' : '1px solid #0066ff',
          borderRadius: '4px',
          color: messageType === 'error' ? '#ffcccc' : '#cce5ff',
          width: 'fit-content',
          fontSize: '0.875rem'
        }}>
          {errorMessage}
        </div>
      )}
    </div>
  )
}

export default DeckBuilderHeader
