// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import PlayerCircle from './PlayerCircle'
import DraftableCard from './DraftableCard'
import TimerPanel from './TimerPanel'
import { getSingleAspectColor, NO_ASPECT_COLOR } from '../utils/aspectColors'
import './LeaderDraftPhase.css'

interface Leader {
  id?: string
  instanceId?: string
  name?: string
  title?: string
  subtitle?: string
  aspects?: string[]
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
  leaders?: Leader[]
  draftedLeaders?: Leader[]
}

interface DraftState {
  leaderRound?: number
  [key: string]: unknown
}

interface Draft {
  maxPlayers?: number
  [key: string]: unknown
}

interface LeaderDraftPhaseProps {
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

function LeaderDraftPhase({
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
}: LeaderDraftPhaseProps) {
  const leaders = myPlayer?.leaders || []
  const draftedLeaders = myPlayer?.draftedLeaders || []
  const canSelect = (myPlayer?.pickStatus === 'picking' || myPlayer?.pickStatus === 'selected') && leaders.length > 0
  const hasSelected = myPlayer?.pickStatus === 'selected'
  const round = draftState?.leaderRound || 1
  const totalLeaderRounds = draftState?.totalPacks || draft?.settings?.chaosSets?.length || 3
  // Spectators (anyone viewing who isn't one of the drafters) get no `myPlayer`.
  // Hide the player-only leader-draft UI for them and just show the round.
  const isSpectator = !myPlayer

  // Local selection state, persisted to localStorage
  const storageKey = `draft-selection-${shareId}-leader-${round}`
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [showPassing, setShowPassing] = useState(false)
  const [lastLeadersCount, setLastLeadersCount] = useState(0)
  const passingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const passingFromPackRef = useRef<string | null>(null) // Track the first leader ID when we started passing

  // Load selection from localStorage on mount and when round changes
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored && leaders.some(l => (l.instanceId || l.id) === stored)) {
      setSelectedCardId(stored)
    } else {
      setSelectedCardId(null)
    }
  }, [storageKey, leaders])

  // Sync localStorage selection with server on mount (in case of refresh)
  // Only re-send if the stored leader is still in the current leaders array
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored && canSelect && myPlayer?.pickStatus === 'picking') {
      // Verify the stored leader is still available before re-sending
      const leaderStillAvailable = leaders.some(l => (l.instanceId || l.id) === stored)
      if (leaderStillAvailable) {
        onSelect(stored)
      } else {
        // Clear stale selection
        localStorage.removeItem(storageKey)
        setSelectedCardId(null)
      }
    }
  }, []) // Only on mount

  // Clear localStorage when round advances (leaders array changes after pick)
  useEffect(() => {
    if (myPlayer?.pickStatus === 'picking' && !hasSelected) {
      // New round started, clear old selection if leader no longer available
      const stored = localStorage.getItem(storageKey)
      if (stored && !leaders.some(l => (l.instanceId || l.id) === stored)) {
        localStorage.removeItem(storageKey)
        setSelectedCardId(null)
      }
    }
  }, [leaders, myPlayer?.pickStatus, hasSelected, storageKey])

  // Clear all old leader selections when round changes
  useEffect(() => {
    // Clean up selections from previous rounds
    for (let r = 1; r <= totalLeaderRounds; r++) {
      if (r !== round) {
        const oldKey = `draft-selection-${shareId}-leader-${r}`
        localStorage.removeItem(oldKey)
      }
    }
  }, [round, shareId, totalLeaderRounds])

  // Manage "passing" state - show skeleton cards when ALL players have picked
  // Check public data (players array) for immediate feedback, don't wait for HTTP
  useEffect(() => {
    // Use status from players array (WebSocket) - it's more up-to-date than myPlayer (HTTP)
    const myPublicPlayer = players?.find(p => p.id === myPlayer?.id)
    const myStatus = myPublicPlayer?.pickStatus || myPlayer?.pickStatus

    const iPicked = myStatus === 'picked'
    const iSelected = myStatus === 'selected'

    // Check if all players are done (picked or selected)
    const allPlayersDone = players?.length > 0 && players.every(p =>
      p.pickStatus === 'picked' || p.pickStatus === 'selected'
    )

    // Get first leader ID to track pack identity
    const firstLeaderId = leaders[0]?.instanceId || leaders[0]?.id || null

    if ((iPicked || allPlayersDone) && leaders.length > 0) {
      // Remember what pack we're passing FROM
      if (!showPassing && firstLeaderId) {
        passingFromPackRef.current = firstLeaderId
      }
      // Start showing passing state immediately when all players done
      setShowPassing(true)
      // Next round will have one fewer leader (the one we just picked)
      setLastLeadersCount(Math.max(0, leaders.length - 1))

      // Clear any existing timeout
      if (passingTimeoutRef.current) {
        clearTimeout(passingTimeoutRef.current)
      }
    } else if (myStatus === 'picking' && leaders.length > 0) {
      // Only hide passing if we have a DIFFERENT pack than when we started passing
      const packHasChanged = passingFromPackRef.current !== null &&
        firstLeaderId !== passingFromPackRef.current

      if (packHasChanged) {
        // New leaders arrived, hide passing after brief delay
        if (passingTimeoutRef.current) {
          clearTimeout(passingTimeoutRef.current)
        }
        passingTimeoutRef.current = setTimeout(() => {
          setShowPassing(false)
          passingFromPackRef.current = null
        }, 100)
      }
      // If pack hasn't changed, keep showing passing (waiting for new leaders)
    }

    return () => {
      if (passingTimeoutRef.current) {
        clearTimeout(passingTimeoutRef.current)
      }
    }
  }, [myPlayer?.pickStatus, leaders, showPassing, players])

  const handleCardClick = (card: Leader) => {
    if (loading || !canSelect) return

    const cardId = card.instanceId || card.id

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

  // Leader draft always passes right
  const passDirection = 'right'

  return (
    <div className="leader-draft-phase">
      <div className="draft-layout">
        <div className="players-section">
          <PlayerCircle
            players={players}
            maxPlayers={draft?.maxPlayers || 8}
            currentUserId={myPlayer?.id}
            showStatus={true}
            draft={draft}
            hideEmptySeats={true}
            showLeaderInfo={true}
            passDirection={passDirection}
            leaderRound={round}
          />
        </div>

        <div className="cards-section">
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
            cardsRemaining={leaders.length}
          />

          {isSpectator && (
            <div className="draft-info-header">
              <div className="draft-progress-info">
                <span className="progress-item">
                  <span className="info-label">Spectating —</span>
                  <span className="info-value">Leader Round {round} of {totalLeaderRounds}</span>
                </span>
              </div>
            </div>
          )}

          {!isSpectator && (<>
          <div className="drafted-leaders">
            <h3>Your Drafted Leaders ({draftedLeaders.length}/{totalLeaderRounds})</h3>
            <div className="drafted-leaders-grid">
              {draftedLeaders.map((leader, idx) => (
                <DraftableCard
                  key={idx}
                  card={leader}
                  disabled={true}
                  useStaticPreview={true}
                />
              ))}
              {Array(Math.max(0, totalLeaderRounds - draftedLeaders.length))
                .fill(null)
                .map((_, idx) => (
                  <div key={`empty-${idx}`} className="drafted-leader empty">
                    <span>?</span>
                  </div>
                ))}
            </div>
          </div>

          <div className="available-leaders">
            <h3>
              {hasSelected
                ? (players?.some(p => p.pickStatus !== 'picked' && p.pickStatus !== 'selected')
                    ? 'Waiting for other players...'
                    : 'Ready')
                : canSelect
                  ? (round === totalLeaderRounds ? 'Select Your Final Leader' : 'Select a Leader')
                  : 'Waiting...'}
            </h3>

            {/* Show skeleton cards when waiting for next round */}
            {showPassing && (lastLeadersCount > 0 || leaders.length > 0) ? (
              <div className="leaders-grid">
                {Array.from({ length: lastLeadersCount || leaders.length }).map((_, idx) => (
                  <div key={`skeleton-${idx}`} className="skeleton-card leader">
                    <div className="skeleton-shimmer"></div>
                  </div>
                ))}
              </div>
            ) : leaders.length > 0 ? (
              <div className="leaders-grid">
                {leaders.map((leader) => {
                  const cardId = leader.instanceId || leader.id
                  return (
                    <DraftableCard
                      key={cardId}
                      card={leader}
                      onClick={() => handleCardClick(leader)}
                      onRightClick={(e: React.MouseEvent) => handleCardRightClick(e)}
                      disabled={loading}
                      selected={selectedCardId === cardId}
                      dimmed={selectedCardId && selectedCardId !== cardId}
                      useStaticPreview={true}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="no-leaders">
                {myPlayer?.pickStatus === 'picked'
                  ? 'Waiting for other players...'
                  : 'No leaders available'}
              </p>
            )}
          </div>
          </>)}

          {/* Passing message - below cards */}
          {!isSpectator && showPassing && (lastLeadersCount > 0 || leaders.length > 0) && (
            <div className="passing-message">
              Passing Right...
            </div>
          )}

          {/* Selection confirmation banner - below cards */}
          {!isSpectator && selectedCardId && !showPassing && (() => {
            const selectedLeader = leaders.find(l => (l.instanceId || l.id) === selectedCardId)
            if (!selectedLeader || !selectedLeader.name) return null
            const firstAspect = selectedLeader.aspects?.[0]
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
                    {selectedLeader.name || selectedLeader.title || 'Leader'}
                  </span>
                  {selectedLeader.subtitle && (
                    <span className="selection-card-subtitle">{selectedLeader.subtitle}</span>
                  )}
                </div>
                {hasSelected ? (
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
    </div>
  )
}

export default LeaderDraftPhase
