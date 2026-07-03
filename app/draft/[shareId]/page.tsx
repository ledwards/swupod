// @ts-nocheck
'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import { useDraftSocket } from '../../../src/hooks/useDraftSocket'
import { usePresence } from '../../../src/hooks/usePresence'
import { joinDraft, leaveDraft, startDraft, randomizeSeats, randomizePacks, makePick, selectCard, updateSettings, togglePause, dropFromDraft } from '../../../src/utils/draftApi'
import { formatPoolLabel } from '../../../src/utils/poolDisplayName'
import DraftLobby from '../../../src/components/DraftLobby'
import LeaderDraftPhase from '../../../src/components/LeaderDraftPhase'
import PackDraftPhase from '../../../src/components/PackDraftPhase'
import { getPackArtUrl } from '../../../src/utils/packArt'
import Button from '../../../src/components/Button'
import Modal from '../../../src/components/Modal'
import ConfirmModal from '../../../src/components/ConfirmModal'
import EditableTitle from '../../../src/components/EditableTitle'
import ChatPanel from '../../../src/components/ChatPanel'
import CompetitivePracticeRules from '../../../src/components/CompetitivePracticeRules'
import '../../../src/App.css'
import '../draft.css'
import '../../../src/components/SealedPod.css'
import '../../../src/components/ChatPanel.css'

interface PageProps {
  params: Promise<{ shareId: string }>
}

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
)

export default function DraftRoomPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  usePresence(user?.id)
  const [shareId, setShareId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startingDraft, setStartingDraft] = useState(false)
  const [randomizing, setRandomizing] = useState(false)
  const [randomizingPacks, setRandomizingPacks] = useState(false)
  const [addingBot, setAddingBot] = useState(false)
  const [picking, setPicking] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [togglingPause, setTogglingPause] = useState(false)
  const [showOpponentTooltip, setShowOpponentTooltip] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showDropConfirm, setShowDropConfirm] = useState(false)
  const [isDropping, setIsDropping] = useState(false)
  const [hasLeft, setHasLeft] = useState(false)
  const [removeConfirmPlayer, setRemoveConfirmPlayer] = useState<{ id: string, username: string } | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  // Get shareId from params
  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  // Use draft SSE hook for real-time updates
  const {
    draft,
    loading,
    error: syncError,
    deleted,
    connected,
    reconnect,
    refresh,
    isHost,
    isPlayer,
    players,
    myPlayer,
    draftState,
    status,
  } = useDraftSocket(shareId, { enabled: !!shareId && isAuthenticated })

  // Track whether the realtime socket has ever connected, so we only warn about
  // a *drop* (not the brief gap during initial connect). Without this, a silent
  // disconnect mid-draft looks identical to "waiting on others" — the worst
  // moment for invisible failure.
  const hasConnectedRef = useRef(false)
  useEffect(() => {
    if (connected) hasConnectedRef.current = true
  }, [connected])
  const showReconnecting = hasConnectedRef.current && !connected && status === 'active'

  // Persistent "Reconnecting…" pill for an active draft whose socket has dropped.
  // amber = caution per the design system; aria-live announces it to AT.
  const connectionBanner = showReconnecting ? (
    <div
      role="status"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9500,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 193, 7, 0.7)',
        borderRadius: '8px',
        padding: '0.5rem 0.5rem 0.5rem 0.85rem',
        color: '#FFC107',
        fontWeight: 600,
        fontSize: '0.9rem',
        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#FFC107',
          flexShrink: 0,
        }}
      />
      Reconnecting…
      <Button variant="interactive" size="sm" onClick={reconnect}>Retry</Button>
    </div>
  ) : null

  const isFormatsDraft = draft?.settings?.draftMode === 'chaos'
  const backPath = isFormatsDraft ? '/formats' : '/draft'

  // Re-evaluate the review window once per second so UI that depends on
  // review-period state (e.g. hiding the host's Cancel Draft button) updates
  // without waiting for a draftState change.
  useEffect(() => {
    if (status !== 'active' || !draft?.competitive) return
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [status, draft?.competitive])

  const isReviewPeriod = !!(
    draft?.competitive &&
    draftState?.reviewUntil &&
    new Date(draftState.reviewUntil).getTime() > nowTick + (draft?.serverTimeOffsetMs || 0)
  )

  // Detect when current user is kicked (was a player, now isn't, still in waiting)
  const wasPlayerRef = useRef(false)
  useEffect(() => {
    if (isPlayer) {
      wasPlayerRef.current = true
    } else if (wasPlayerRef.current && !isPlayer && status === 'waiting' && !hasLeft && !loading) {
      wasPlayerRef.current = false
      router.push(`${backPath}?removed=1`)
    }
  }, [isPlayer, status, hasLeft, loading, router, backPath])

  // Redirect if draft was deleted
  useEffect(() => {
    if (deleted) {
      router.push(backPath)
    }
  }, [deleted, router, backPath])

  // Redirect to deck builder when draft completes
  useEffect(() => {
    if (status === 'complete' && shareId) {
      const buildDeck = async () => {
        try {
          const response = await fetch(`/api/draft/${shareId}/pool`, {
            credentials: 'include',
          })
          if (!response.ok) {
            const data = await response.json()
            throw new Error(data.message || 'Failed to create pool')
          }
          const data = await response.json()
          const poolShareId = data.data?.poolShareId
          if (poolShareId) {
            router.push(`/pool/${poolShareId}`)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      }
      buildDeck()
    }
  }, [status, shareId, router])

  // Auto-join on load if authenticated and not already in draft
  useEffect(() => {
    if (!shareId || !isAuthenticated || loading || isPlayer || status !== 'waiting' || hasLeft) return

    const autoJoin = async () => {
      try {
        await joinDraft(shareId)
        // No refresh needed — the join API broadcasts via socket,
        // which updates public state instantly and fetches user data
      } catch (err) {
        // Ignore "already in draft" errors
        if (err instanceof Error && !err.message.includes('Already in draft')) {
          console.error('Failed to auto-join:', err)
        }
      }
    }

    autoJoin()
  }, [shareId, isAuthenticated, loading, isPlayer, status, refresh, hasLeft])

  const handleLeave = async () => {
    setHasLeft(true)
    try {
      await leaveDraft(shareId)
      router.push('/draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleStart = async () => {
    if (startingDraft) return
    setStartingDraft(true)
    setError(null)
    try {
      await startDraft(shareId)
      // WebSocket broadcast will update state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setStartingDraft(false)
    }
  }

  const handleRandomize = async () => {
    if (randomizing) return
    setRandomizing(true)
    try {
      await randomizeSeats(shareId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRandomizing(false)
    }
  }

  const handleRandomizePacks = async () => {
    if (randomizingPacks) return
    setRandomizingPacks(true)
    try {
      await randomizePacks(shareId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRandomizingPacks(false)
    }
  }

  const handleSettingsChange = async (settings: Record<string, unknown>) => {
    try {
      await updateSettings(shareId, settings)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleAddBot = async () => {
    if (addingBot) return
    setAddingBot(true)
    setError(null)
    try {
      const response = await fetch(`/api/draft/${shareId}/dev/add-bots?count=1`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to add bot')
      }
      // WebSocket broadcast will update players list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setAddingBot(false)
    }
  }

  const handlePick = async (cardId: string) => {
    if (picking) return
    setPicking(true)
    setError(null)
    try {
      await makePick(shareId, cardId)
      // WebSocket broadcast will update state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setPicking(false)
    }
  }

  const handleSelect = async (cardId: string | null) => {
    if (selecting) return
    setSelecting(true)
    setError(null)
    try {
      const result = await selectCard(shareId, cardId)
      // Handle state changed response (409) - refresh data silently
      if (result?.stateChanged) {
        await refresh()
        return
      }
      // Refresh to ensure state updates
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSelecting(false)
    }
  }

  const handleBack = () => {
    router.push(backPath)
  }

  const handleCancelDraft = async () => {
    if (!shareId) return
    setIsCancelling(true)
    try {
      const response = await fetch(`/api/draft/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (response.ok) {
        router.push(backPath)
      } else {
        console.error('Failed to cancel draft')
        setIsCancelling(false)
        setShowCancelConfirm(false)
      }
    } catch (err) {
      console.error('Failed to cancel draft:', err)
      setIsCancelling(false)
      setShowCancelConfirm(false)
    }
  }

  const handleTogglePause = async () => {
    if (togglingPause) return
    setTogglingPause(true)
    setError(null)
    try {
      await togglePause(shareId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setTogglingPause(false)
    }
  }

  const handleDropFromDraft = async () => {
    if (!shareId || isDropping) return
    setIsDropping(true)
    try {
      await dropFromDraft(shareId)
      router.push('/draft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsDropping(false)
      setShowDropConfirm(false)
    }
  }

  const handleSwitchToSolo = async () => {
    if (!shareId) return
    try {
      await fetch(`/api/draft/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch (err) {
      // Best effort — navigate regardless
    }
    router.push('/draft/solo')
  }

  const handleRemovePlayer = (userId: string) => {
    const player = players.find(p => p.id === userId)
    if (player) {
      setRemoveConfirmPlayer({ id: player.id, username: player.username || `Player` })
    }
  }

  const handleConfirmRemove = async () => {
    if (!shareId || !removeConfirmPlayer || isRemoving) return
    setIsRemoving(true)
    try {
      const response = await fetch(`/api/draft/${shareId}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId: removeConfirmPlayer.id }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to remove player')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player')
    } finally {
      setIsRemoving(false)
      setRemoveConfirmPlayer(null)
    }
  }

  // Loading auth state
  if (authLoading || !shareId) {
    return (
      <div className="draft-page-bg">
        <div className="loading-container">
          <div className="loading"></div>
        </div>
      </div>
    )
  }

  // Auth required - check before SSE loading since SSE is disabled when not authenticated
  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent(`/draft/${shareId}`)
    return (
      <div className="draft-page-bg">
        <div className="auth-prompt-container">
          <h2>Login Required</h2>
          <p>Draft requires a Discord login to track players in multiplayer.</p>
          <Button
            variant="discord"
            size="lg"
            onClick={() => { window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}` }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/></svg>
            Login with Discord
          </Button>
        </div>
      </div>
    )
  }

  // Loading draft data
  if (loading) {
    return (
      <div className="draft-page-bg">
        <div className="loading-container">
          <div className="loading"></div>
          <p>Loading draft...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (syncError && !draft) {
    return (
      <div className="draft-page-bg">
        <div className="error-container">
          <h2>Error</h2>
          <p>{syncError}</p>
        </div>
      </div>
    )
  }

  // Draft not found
  if (!draft) {
    return (
      <div className="draft-page-bg">
        <div className="error-container">
          <h2>Draft Not Found</h2>
          <p>This draft may have been deleted or the code is incorrect.</p>
        </div>
      </div>
    )
  }

  // Render based on status
  const renderContent = () => {
    if (status === 'waiting') {
      return (
        <DraftLobby
          draft={draft}
          players={players}
          isHost={isHost}
          isPlayer={isPlayer}
          onStart={handleStart}
          onRandomize={handleRandomize}
          onRandomizePacks={isFormatsDraft ? undefined : handleRandomizePacks}
          onAddBot={handleAddBot}
          onSettingsChange={handleSettingsChange}
          onLeave={handleLeave}
          onRemovePlayer={isHost ? handleRemovePlayer : undefined}
          onSwitchToSolo={handleSwitchToSolo}
          startingDraft={startingDraft}
          randomizing={randomizing}
          randomizingPacks={randomizingPacks}
          addingBot={addingBot}
          error={error}
          shareId={shareId}
          isAdmin={user?.is_admin === true}
        />
      )
    }

    if (status === 'active') {
      const phase = draftState?.phase

      if (phase === 'leader_draft') {
        return (
          <>
            {connectionBanner}
            <LeaderDraftPhase
              draft={draft}
              players={players}
              myPlayer={myPlayer}
              draftState={draftState}
              onSelect={handleSelect}
              onConfirm={handlePick}
              loading={selecting}
              confirming={picking}
              error={error}
              isHost={isHost}
              onTogglePause={handleTogglePause}
              onUpdateTimerSettings={handleSettingsChange}
              shareId={shareId}
              onTimerExpire={refresh}
            />
          </>
        )
      }

      if (phase === 'pack_draft') {
        return (
          <>
            {connectionBanner}
            <PackDraftPhase
              draft={draft}
              players={players}
              myPlayer={myPlayer}
              draftState={draftState}
              onSelect={handleSelect}
              onConfirm={handlePick}
              loading={selecting}
              confirming={picking}
              error={error}
              isHost={isHost}
              onTogglePause={handleTogglePause}
              onUpdateTimerSettings={handleSettingsChange}
              shareId={shareId}
              onTimerExpire={refresh}
            />
          </>
        )
      }
    }

    if (status === 'complete') {
      // useEffect will handle redirect to deck builder
      return <div className="loading"></div>
    }

    return <div className="loading"></div>
  }

  const packArtUrl = draft?.setArtUrl || (draft?.setCode ? getPackArtUrl(draft.setCode) : null)

  const setArtStyle = packArtUrl ? {
    backgroundImage: `url("${packArtUrl}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
  } : {}

  return (
    <div className={`page-with-chat${draft?.competitive ? ' competitive' : ''}`}>
      <div className="page-content">
        <div className="sealed-pod">
          {packArtUrl && (
            <div className="set-art-header" style={setArtStyle}></div>
          )}
          <div className="sealed-pod-content">
            <div className="draft-room">
              <div className="draft-header">
                  <div className="draft-header-center">
                  <div className="draft-title-row">
                    <h1>
                      <EditableTitle
                        value={draft.name || formatPoolLabel(draft.setName ?? draft.setCode, 'draft')}
                        isEditable={isHost && status === 'waiting'}
                        onSave={(newName) => {
                          if (newName) handleSettingsChange({ name: newName })
                        }}
                        maxLength={100}
                      />
                    </h1>
                  </div>
                  {status === 'active' && (draftState?.phase === 'leader_draft' || draftState?.phase === 'pack_draft') && (
                    <div className="draft-subhead-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="draft-round-info">
                        {draftState?.phase === 'leader_draft' ? 'Leader Drafting Phase' : 'Drafting Phase'}
                      </span>
                      {draft?.competitive && (
                        <>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            color: 'rgba(255, 215, 0, 0.9)',
                            border: '1px solid rgba(255, 215, 0, 0.4)',
                            borderRadius: '4px',
                            verticalAlign: 'middle',
                          }}>
                            COMPETITIVE
                          </span>
                          <button
                            type="button"
                            aria-label="Competitive Practice rules"
                            title="Competitive Practice rules"
                            onClick={() => setShowRulesModal(true)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '22px',
                              height: '22px',
                              padding: 0,
                              border: '1px solid rgba(255, 215, 0, 0.4)',
                              borderRadius: '50%',
                              background: 'transparent',
                              color: 'rgba(255, 215, 0, 0.9)',
                              cursor: 'pointer',
                              verticalAlign: 'middle',
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="12" y1="16" x2="12" y2="12"/>
                              <line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="draft-main">
                <div className="draft-content">
                  {error && <div className="error-message">{error}</div>}
                  {renderContent()}
                </div>
              </div>

              {/* Cancel Draft Button - bottom center during active phases (host only).
                  Hidden during the 30s between-pack review period so it doesn't
                  dominate the "Review Your Cards" screen. */}
              {isHost && status === 'active' && !isReviewPeriod && (
                <div className="draft-cancel-section">
                  <button
                    className="draft-cancel-button"
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={isCancelling}
                  >
                    Cancel Draft
                  </button>
                </div>
              )}

              {/* Drop from Draft Button - for non-host players during active phases */}
              {!isHost && isPlayer && status === 'active' && (
                <div className="draft-drop-section">
                  <button
                    className="draft-drop-button"
                    onClick={() => setShowDropConfirm(true)}
                    disabled={isDropping}
                  >
                    Drop from Draft
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cancel Confirmation Modal */}
        <ConfirmModal
          isOpen={showCancelConfirm}
          title="Cancel Draft?"
          confirmLabel="Cancel Draft"
          cancelLabel="Go Back"
          confirming={isCancelling}
          onConfirm={handleCancelDraft}
          onCancel={() => setShowCancelConfirm(false)}
        >
          <p>Are you sure you want to cancel this draft? All players will lose their progress and this action cannot be undone.</p>
        </ConfirmModal>

        {/* Drop Confirmation Modal */}
        <ConfirmModal
          isOpen={showDropConfirm}
          title="Drop from Draft?"
          confirmLabel="Drop from Draft"
          cancelLabel="Go Back"
          confirming={isDropping}
          onConfirm={handleDropFromDraft}
          onCancel={() => setShowDropConfirm(false)}
        >
          <p>Are you sure you want to drop from this draft? A bot will take over your picks and you will lose access to your drafted cards.</p>
        </ConfirmModal>
      </div>

      {/* Competitive Practice Rules Modal */}
      <Modal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
        title="Competitive Practice Rules"
      >
        <Modal.Body>
          <CompetitivePracticeRules showTitle={false} />
        </Modal.Body>
        <Modal.Actions>
          <Button variant="secondary" onClick={() => setShowRulesModal(false)}>Close</Button>
        </Modal.Actions>
      </Modal>

      {/* Remove Player Confirmation Modal */}
      <Modal
        isOpen={!!removeConfirmPlayer}
        onClose={() => setRemoveConfirmPlayer(null)}
        title="Remove Player?"
        variant="danger"
      >
        <Modal.Body>
          <p>Are you sure you want to remove <strong>{removeConfirmPlayer?.username}</strong> from the draft?</p>
        </Modal.Body>
        <Modal.Actions>
          <Button variant="secondary" onClick={() => setRemoveConfirmPlayer(null)} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmRemove} disabled={isRemoving}>
            {isRemoving ? 'Removing...' : 'Remove'}
          </Button>
        </Modal.Actions>
      </Modal>

      {!draft?.settings?.isSolo && <ChatPanel shareId={shareId} isHost={isHost} isPublic={draft?.isPublic} onMakePublic={() => handleSettingsChange({ isPublic: true })} defaultOpen={false} competitive={draft?.competitive} draftStatus={status} />}
    </div>
  )
}
