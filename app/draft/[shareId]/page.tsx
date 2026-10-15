// @ts-nocheck
'use client'
import { draftCompletionPath } from '../../../src/utils/draftCompletionPath'

import ContentSkeleton from '../../../src/components/ContentSkeleton'

import { useState, useEffect, useRef, useCallback, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import DiscordLoginButton from '../../../src/components/DiscordLoginButton'
import { useAlphaUi } from '../../../src/contexts/AlphaUiContext'
import { useDraftSocket } from '../../../src/hooks/useDraftSocket'
import { usePresence } from '../../../src/hooks/usePresence'
import { joinDraft, leaveDraft, startDraft, beginPicking, randomizeSeats, randomizePacks, makePick, selectCard, confirmSelection, updateSettings, togglePause, dropFromDraft, setLobbyReady } from '../../../src/utils/draftApi'
import useVoicePackAudio from '../../../src/hooks/useVoicePackAudio'
import { formatPoolLabel } from '../../../src/utils/poolDisplayName'
import DraftLobby from '../../../src/components/DraftLobby'
import LeaderPreviewPhase from '../../../src/components/LeaderPreviewPhase'
import LeaderDraftPhase from '../../../src/components/LeaderDraftPhase'
import PackDraftPhase from '../../../src/components/PackDraftPhase'
import DraftVoiceSetup from '../../../src/components/DraftVoiceSetup'
import DraftMuteButton from '../../../src/components/DraftMuteButton'
import { isDraftAudioMuted } from '../../../src/hooks/useVoicePackAudio'
import DraftTableSetup from '../../../src/components/DraftTable/DraftTableSetup'
import DraftTable from '../../../src/components/DraftTable/DraftTable'
import { getPackArtUrl } from '../../../src/utils/packArt'
import Button from '../../../src/components/Button'
import Modal from '../../../src/components/Modal'
import ConfirmModal from '../../../src/components/ConfirmModal'
import EditableTitle from '../../../src/components/EditableTitle'
import {SiteTitle} from '../../../src/components/SiteTheme'
import ChatPanel from '../../../src/components/ChatPanel'
import CompetitivePracticeRules from '../../../src/components/CompetitivePracticeRules'
import '../../../src/App.css'

/**
 * How long to wait for the dealing sound before saying the line anyway. The clip
 * runs about a second at 4x; this only matters when neither `ended` nor `error`
 * ever fires, which some browsers manage when a tab is backgrounded mid-load.
 */
const DEALING_SOUND_MAX_MS = 4000
import '../draft.css'
import '../../../src/components/SealedPod.css'
import '../../../src/components/ChatPanel.css'
import { usePresenceActivity } from '../../../src/hooks/usePresenceActivity'

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
  // Alpha testers get the reworked draft room; everyone else the pre-alpha one.
  const { enabled: alphaUi } = useAlphaUi()
  usePresence(user?.id)
  usePresenceActivity('drafting')
  const [shareId, setShareId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startingDraft, setStartingDraft] = useState(false)
  const [beginningPicking, setBeginningPicking] = useState(false)
  const [randomizing, setRandomizing] = useState(false)
  const [randomizingPacks, setRandomizingPacks] = useState(false)
  const [addingBot, setAddingBot] = useState(false)
  const [picking, setPicking] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [togglingPause, setTogglingPause] = useState(false)
  const [showOpponentTooltip, setShowOpponentTooltip] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [showDropConfirm, setShowDropConfirm] = useState(false)
  const [isDropping, setIsDropping] = useState(false)
  const [hasLeft, setHasLeft] = useState(false)
  const [removeConfirmPlayer, setRemoveConfirmPlayer] = useState<{ id: string, username: string } | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [togglingReady, setTogglingReady] = useState(false)
  const [nowTick, setNowTick] = useState(() => Date.now())

  // Get shareId from params
  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  // Use draft SSE hook for real-time updates
  const {
    draft: syncedDraft,
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
  } = useDraftSocket(shareId, { enabled: !!shareId && !authLoading })

  // Host settings show the new value the moment they change. The save runs in
  // the background; the overlay drops once the server copy is refreshed, or
  // on failure, which puts the server's value back.
  const [pendingSettings, setPendingSettings] = useState<Record<string, unknown>>({})
  const settingsSeqRef = useRef<Record<string, number>>({})
  const draft = useMemo(
    () => (syncedDraft && Object.keys(pendingSettings).length ? { ...syncedDraft, ...pendingSettings } : syncedDraft),
    [syncedDraft, pendingSettings],
  )

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

  // --- Voice cues -------------------------------------------------------
  // The pack is whatever the pod selected; the field may be absent (creator
  // voice packs ship separately) and that just means the built-in pack.
  const voicePackId = draft?.voicePackId ?? draft?.settings?.voicePackId ?? null
  const { play: playCue, prime: primeCues } = useVoicePackAudio(voicePackId)

  // The same dealing sound the pack-opening screen uses, at the same 4x speed.
  // It is a plain Audio element, not a voice-pack clip, so it is not gated on the
  // cue mute (which governs the announcer's voice) and the speaker does not know
  // about it.
  //
  // `onEnded` runs when the cards have finished shuffling — the announcer talks
  // over the deal otherwise. It is called exactly once, and it is called even
  // when the sound cannot play at all: a missing file or a browser that refuses
  // autoplay must not swallow the spoken call that follows it. The timeout is the
  // backstop for the case where neither `ended` nor `error` ever fires.
  const playDealingSound = useCallback((onEnded?: () => void) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      onEnded?.()
    }
    let timer: ReturnType<typeof setTimeout> | null = null

    if (typeof window === 'undefined' || isDraftAudioMuted()) {
      finish()
      return
    }
    try {
      const sound = new Audio('/sounds/card-mixing.mp3')
      sound.volume = 0.5
      sound.preservesPitch = false
      sound.playbackRate = 4.0
      sound.addEventListener('ended', finish, { once: true })
      sound.addEventListener('error', finish, { once: true })
      sound.addEventListener('canplaythrough', () => {
        sound.playbackRate = 4.0
        // A 4x deal is about a second; if it will not start, say the line anyway.
        sound.play().catch(finish)
      }, { once: true })
      timer = setTimeout(finish, DEALING_SOUND_MAX_MS)
      sound.load()
    } catch {
      finish()
    }
  }, [])

  // Phase transitions are announced from the socket broadcast, so every client
  // hears them at the same moment (rather than only whoever clicked).
  const phaseKey = status === 'waiting' ? 'lobby' : (draftState?.phase ?? null)
  const previousPhaseRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (loading || !draft) return
    const previous = previousPhaseRef.current
    previousPhaseRef.current = phaseKey
    // First settled render: adopt the phase silently. Opening a page that is
    // already in the leader preview must not announce a deal that happened
    // before you arrived.
    if (previous === undefined || previous === phaseKey) return
    if (phaseKey === 'leader_preview') {
      // Packs have just been dealt and the leaders are on screen. The announcer
      // waits for the shuffle to finish rather than talking over it.
      playDealingSound(() => playCue('ready-the-draft'))
    } else if (previous === 'leader_preview' && phaseKey === 'leader_draft') {
      playCue('start-the-draft')
    }
  }, [phaseKey, loading, draft, playCue, playDealingSound])

  // Pause/resume is a host action every seat should hear, so it rides the
  // broadcast the same way phase changes do rather than firing for whoever
  // clicked. First settled render adopts the state silently — arriving at an
  // already-paused draft must not announce a pause that happened before you.
  const isPaused = draft?.paused === true
  const previousPausedRef = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (loading || !draft) return
    const previous = previousPausedRef.current
    previousPausedRef.current = isPaused
    if (previous === undefined || previous === isPaused) return
    playCue(isPaused ? 'timer-paused' : 'timer-resumed')
  }, [isPaused, loading, draft, playCue])

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
            router.replace(draftCompletionPath(window.location.search, poolShareId))
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

  // The Ready click is also the user gesture that unlocks audio in this
  // browser: primeCues() plays every clip muted and pauses it, so the later
  // programmatic .play() calls (phase cues, countdowns) are allowed. It MUST
  // run synchronously inside the click handler — after an await the gesture is
  // spent and the browser blocks playback for the rest of the draft.
  //
  // `announce` makes the greeting audible rather than silent, so pressing
  // Ready proves the sound actually works instead of leaving the player
  // wondering whether anything happened.
  const handleToggleReady = async () => {
    if (togglingReady) return
    // Readying is one-way, so this only ever runs on the way in and the greeting
    // is unconditional. It also has to be the FIRST thing here, synchronously:
    // this click is the user gesture that unlocks audio for the whole page.
    primeCues(voicePackId, { announce: 'greeting' })
    setTogglingReady(true)
    setError(null)
    try {
      await setLobbyReady(shareId)
      // WebSocket broadcast will update state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setTogglingReady(false)
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

  // Leader preview → leader draft: host opens picking and starts timers
  const handleBeginPicking = async () => {
    if (beginningPicking) return
    setBeginningPicking(true)
    setError(null)
    try {
      await beginPicking(shareId)
      // WebSocket broadcast will update state
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setBeginningPicking(false)
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
    const keys = Object.keys(settings)
    const seq: Record<string, number> = {}
    for (const key of keys) seq[key] = settingsSeqRef.current[key] = (settingsSeqRef.current[key] ?? 0) + 1
    setPendingSettings(prev => ({ ...prev, ...settings }))
    // Only the latest change to a key clears it; an older save finishing late must not.
    const settle = () => setPendingSettings(prev => {
      const next = { ...prev }
      for (const key of keys) if (settingsSeqRef.current[key] === seq[key]) delete next[key]
      return next
    })
    try {
      await updateSettings(shareId, settings)
      void refresh()
      // Normally the synced copy catches up first (see the effect below).
      setTimeout(settle, 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      settle()
    }
  }

  // Drop each pending value once the server's copy agrees with it.
  useEffect(() => {
    if (!syncedDraft) return
    setPendingSettings(prev => {
      const keys = Object.keys(prev).filter(key => syncedDraft[key] === prev[key])
      if (!keys.length) return prev
      const next = { ...prev }
      for (const key of keys) delete next[key]
      return next
    })
  }, [syncedDraft])

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

  const handleSelect = async (cardId: string) => {
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
      // The write is acknowledged. Socket state can enable confirmation while
      // the full snapshot refresh runs; confirmation still validates on the server.
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSelecting(false)
    }
  }

  // Second half of the two-step pick: lock in the staged card. The round only
  // advances once every player has done this.
  const handleConfirm = async () => {
    if (selecting) return
    setSelecting(true)
    setError(null)
    try {
      const result = await confirmSelection(shareId)
      if (result?.stateChanged) {
        await refresh()
        return
      }
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
    if (!shareId || isCancelling) return
    setIsCancelling(true)
    setCancelError(null)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`/api/draft/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
        signal: controller.signal,
      })
      // A timed-out attempt may already have deleted the draft.
      if (response.ok || response.status === 404) {
        window.location.assign(backPath)
        return
      }
      setCancelError('Couldn’t cancel this draft. Please try again.')
    } catch {
      setCancelError('Couldn’t confirm the draft was cancelled. Please try again.')
    } finally {
      window.clearTimeout(timeout)
      setIsCancelling(false)
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

  // Signed-out visitors see the login prompt, except a guest playing their own
  // solo draft (the server recognizes them as a player in it).
  if (!isAuthenticated && !loading && !isPlayer) {
    return (
      <div className="draft-page-bg">
        <div className="auth-prompt-container">
          <h2>Login Required</h2>
          <p>Draft requires a Discord login to track players in multiplayer.</p>
          <DiscordLoginButton returnTo={`/draft/${shareId}`} />
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
          <ContentSkeleton kind="text"/>
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
          onToggleReady={handleToggleReady}
          togglingReady={togglingReady}
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

      if (phase === 'leader_preview') {
        return (
          <>
            {connectionBanner}
            <LeaderPreviewPhase
              draft={draft}
              players={players}
              myPlayer={myPlayer}
              isHost={isHost}
              onBeginPicking={handleBeginPicking}
              beginningPicking={beginningPicking}
              error={error}
              totalPacks={draftState?.totalPacks}
            />
          </>
        )
      }

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
              onConfirm={handleConfirm}
              loading={selecting}
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
              onConfirm={handleConfirm}
              loading={selecting}
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

  const subheadRow = status === 'active' && (draftState?.phase === 'leader_preview' || draftState?.phase === 'leader_draft' || draftState?.phase === 'pack_draft') && (
    <div className="draft-subhead-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span className="draft-round-info">
        {draftState?.phase === 'leader_preview'
          ? 'Leaders Revealed'
          : draftState?.phase === 'leader_draft' ? 'Leader Drafting Phase' : 'Drafting Phase'}
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
  )
  const cancelDraftButton = (
    <button
      className="draft-cancel-button"
      onClick={() => setShowCancelConfirm(true)}
      disabled={isCancelling}
    >
      Cancel Draft
    </button>
  )

  return (
    <div className={alphaUi
      ? `page-with-chat draft-room-page${status === 'active' ? ' draft-active' : ''}${draft?.competitive ? ' competitive' : ''}${draftState?.phase === 'leader_preview' ? ' draft-preview' : ''}`
      : `page-with-chat${draft?.competitive ? ' competitive' : ''}`}>
      <div className="page-content">
        <div className="sealed-pod">
          {packArtUrl && (
            <div className="set-art-header" style={setArtStyle}></div>
          )}
          <div className="sealed-pod-content">
            <div className="draft-room">
              <div className="draft-header">
                {alphaUi && <div id="draft-header-leaders" className="draft-header-leaders" />}
                <div className="draft-header-center">
                  <div className="draft-title-row">
                    <SiteTitle className="draft-site-title">
                      <EditableTitle
                        value={draft.name || formatPoolLabel(draft.setName ?? draft.setCode, 'draft')}
                        isEditable={isHost && status === 'waiting'}
                        onSave={(newName) => {
                          if (newName) handleSettingsChange({ name: newName })
                        }}
                        maxLength={100}
                      />
                      {isHost && status === 'waiting' && (
                        <button type="button" className="draft-title-cancel" onClick={() => setShowCancelConfirm(true)} disabled={isCancelling}>
                          Cancel Draft
                        </button>
                      )}
                    </SiteTitle>
                  </div>
                  {!alphaUi && subheadRow}
                </div>
                {alphaUi && <div className="draft-header-actions">
                  {status === 'active' && (draftState?.phase === 'leader_preview' || draftState?.phase === 'leader_draft' || draftState?.phase === 'pack_draft') && (
                    <div className="draft-subhead-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="draft-round-info">
                        {draftState?.phase === 'leader_preview'
                          ? 'Open Leaders'
                          : draftState?.phase === 'leader_draft' ? 'Leader Drafting Phase' : 'Drafting Phase'}
                      </span>
                      {draft?.competitive && (
                        <>
                          <span className="draft-competitive-badge">
                            COMPETITIVE
                            <button type="button" className="draft-competitive-info" aria-label="Competitive Practice rules" title="Competitive Practice rules" onClick={() => setShowRulesModal(true)}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <line x1="12" y1="16" x2="12" y2="11"/>
                                <line x1="12" y1="7.5" x2="12.01" y2="7.5"/>
                              </svg>
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                  )}
                {/* The lobby's one mute sits where picking puts it, for host and players alike. */}
                {status === 'waiting' && (
                  <div className="draft-cancel-section">
                    {!draft?.settings?.isSolo && <DraftTableSetup />}
                    <DraftMuteButton packId={draft?.voicePackId ?? draft?.settings?.voicePackId ?? null} />
                  </div>
                )}
                {/* Keep cancellation reachable; omit it during inter-pack review. */}
                {!isHost && status === 'active' && (
                  <div className="draft-cancel-section">
                    <DraftMuteButton packId={draft?.voicePackId ?? draft?.settings?.voicePackId ?? null} />
                  </div>
                )}
                {isHost && status === 'active' && !isReviewPeriod && (
                  <div className="draft-cancel-section">
                    <DraftTableSetup />
                    <DraftMuteButton packId={draft?.voicePackId ?? draft?.settings?.voicePackId ?? null} />
                    <button
                      className="draft-cancel-button"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={isCancelling}
                    >
                      Cancel Draft
                    </button>
                  </div>
                )}
              </div>}
              </div>

              <div className="draft-main">
                {alphaUi ? (
                  <DraftTable>
                    {error && <div className="error-message">{error}</div>}
                    {renderContent()}
                  </DraftTable>
                ) : (
                  <div className="draft-content">
                    {error && <div className="error-message">{error}</div>}
                    {renderContent()}
                  </div>
                )}
              </div>

              {/* Cancel Draft Button - bottom center during active phases (host only).
                  Hidden during the 30s between-pack review period so it doesn't
                  dominate the "Review Your Cards" screen. */}
              {!alphaUi && isHost && status === 'active' && !isReviewPeriod && (
                <div className="draft-cancel-section">
                  {cancelDraftButton}
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
          {cancelError && <p role="alert">{cancelError}</p>}
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
        variant="wide"
        className="cpm-rules-modal"
      >
        <Modal.Body className="cpm-rules-modal-body">
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
