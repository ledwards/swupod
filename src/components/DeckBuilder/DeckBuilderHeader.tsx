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

import EditableTitle from '../EditableTitle'
import Button from '../Button'
import DraftReportButton from '../DraftReportButton'
import CountdownTimer from '../CountdownTimer'
import PoolBuilds from '../PoolBuilds'
import { savePool } from '../../utils/poolApi'
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
}: DeckBuilderHeaderProps) {
  // Calculate deck legality for Play button
  const deckCardCount = Object.values(cardPositions)
    .filter(pos => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false).length
  const isDeckLegal = activeLeader && activeBase && deckCardCount >= 30
  const canUsePlayAction = Boolean(onPlay || shareId)

  // Handle build from pool action (non-owners only)
  const handleBuildFromPool = async () => {
    if (!isAuthenticated) {
      signIn()
      return
    }

    try {
      setErrorMessage('Setting up your build...')
      setMessageType('info')

      const builtPool = await savePool({
        setCode: setCode,
        cards: cards,
        packs: null,
        deckBuilderState: savedState,
        poolType: poolType,
        name: null,
        isPublic: false,
        parentPoolId: shareId,
      })

      if (builtPool.alreadyExists) {
        setErrorMessage('Opening your existing build...')
        setMessageType('success')
      } else {
        setErrorMessage('Build created! Redirecting...')
        setMessageType('success')
      }

      setTimeout(() => {
        window.location.href = `/pool/${shareId}/deck/${builtPool.shareId}`
      }, 1000)
    } catch (err) {
      console.error('Failed to create build:', err)
      setErrorMessage('Failed to create build')
      setMessageType('error')
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    }
  }

  // Handle copy share URL
  const handleCopyShareUrl = async () => {
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
            isEditable={isOwner}
            placeholder="Deck Builder"
          />
        </h1>
        <p className="deck-builder-pool-type">{isInfiniteMode ? 'Limited Deckbuilder' : isDraftMode ? 'Draft Pool' : 'Sealed Pool'}</p>
        {rootShareId && (
          <PoolBuilds
            shareId={rootShareId}
            currentUserId={currentUserId}
            isOwner={isOwner}
          />
        )}
      </div>

      {deckBuildDeadline && (
        <div className="deck-build-timer" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          color: 'rgba(255, 215, 0, 0.9)', fontWeight: 600
        }}>
          <span>Build Timer:</span>
          <CountdownTimer
            totalSeconds={Math.max(0, Math.floor((new Date(deckBuildDeadline).getTime() - Date.now()) / 1000))}
            startedAt={new Date(new Date(deckBuildDeadline).getTime() - 20 * 60 * 1000).toISOString()}
            active={true}
            label=""
            warningThreshold={300}
            onExpire={() => {
              if (typeof window !== 'undefined' && shareId) {
                window.location.href = `/pool/${shareId}/deck/play`
              }
            }}
          />
        </div>
      )}

      {!isLoading && <div className={`header-buttons ${isInfoBarSticky ? 'hidden' : ''}`}>
        {/* Build with This Pool button for non-owners */}
        {!isInfiniteMode && !isOwner && (
          <Button
            variant="secondary"
            className="export-button"
            onClick={handleBuildFromPool}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Build with This Pool</span>
          </Button>
        )}

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


        {/* Share button */}
        {!isInfiniteMode && shareId && (
          <Button
            variant="secondary"
            className="export-button"
            onClick={handleCopyShareUrl}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy Share URL</span>
          </Button>
        )}

        {/* Draft Log button */}
        {draftShareId && (
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
        {draftShareId && isPatron && isOwner && (
          <DraftReportButton draftShareId={draftShareId} />
        )}
      </div>}

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
