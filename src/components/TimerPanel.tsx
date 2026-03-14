// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import CountdownTimer from './CountdownTimer'
import TimerButton from './TimerButton'
import './TimerPanel.css'

interface DraftPlayer {
  pickStatus: string
}

interface DraftState {
  phase?: string
  leaderRound?: number
  packNumber?: number
  pickInPack?: number
  lastPlayerStartedAt?: string | null
}

interface Draft {
  pickTimeoutSeconds?: number
  timerSeconds?: number
  pickStartedAt?: string | null
  status?: string
  timed?: boolean
  timerEnabled?: boolean
  paused?: boolean
  pausedDurationSeconds?: number
  draftState?: DraftState
}

export interface TimerPanelProps {
  draft?: Draft | null
  players?: DraftPlayer[]
  compact?: boolean
  isHost?: boolean
  onTogglePause?: () => void
  draftState?: DraftState | null
  onTimerExpire?: () => void
}

/**
 * Timer panel shown during active drafting
 * Shows either pick timeout or last player timer (whichever has less time remaining)
 * Both timers can be enabled/disabled independently
 */
function TimerPanel({ draft, players = [], compact = false, isHost = false, onTogglePause, draftState = null, onTimerExpire }: TimerPanelProps) {
  const [activeTimer, setActiveTimer] = useState<'round' | 'lastPlayer'>('round')
  const [optimisticPaused, setOptimisticPaused] = useState<boolean | null>(null)

  // Calculate if only one player left to pick (for last player timer)
  const playersStillPicking = players.filter(p => p.pickStatus === 'picking').length
  const isLastPlayer = playersStillPicking === 1

  // Timer settings
  const pickTimeoutSeconds = draft?.pickTimeoutSeconds || 120
  const lastPlayerTimerSeconds = draft?.timerSeconds || 30
  const pickStartedAt = draft?.pickStartedAt
  const isDrafting = draft?.status === 'active'
  const isRoundTimerEnabled = draft?.timed !== false
  const isLastPlayerTimerEnabled = draft?.timerEnabled !== false
  const isPaused = optimisticPaused !== null ? optimisticPaused : draft?.paused === true
  const pausedDurationSeconds = draft?.pausedDurationSeconds || 0

  // Reset optimistic state when server state changes
  useEffect(() => {
    if (optimisticPaused !== null && draft?.paused !== undefined) {
      setOptimisticPaused(null)
    }
  }, [draft?.paused, optimisticPaused])

  // Handler that optimistically updates UI before server responds
  const handleTogglePause = () => {
    if (onTogglePause) {
      setOptimisticPaused(!isPaused)
      onTogglePause()
    }
  }

  // Get lastPlayerStartedAt from server-provided draft state
  // This ensures consistency between client timer display and server timeout enforcement
  const lastPlayerStartedAt = draft?.draftState?.lastPlayerStartedAt || null

  // Calculate which timer to show based on remaining time
  useEffect(() => {
    if (!isDrafting || !pickStartedAt) return

    const calculateActiveTimer = () => {
      const startTime = new Date(pickStartedAt).getTime()
      const now = Date.now()
      const timeSinceStart = Math.floor((now - startTime) / 1000)

      // If pausedDurationSeconds exceeds time since pick started, it's stale data - ignore it
      const effectivePausedDuration = pausedDurationSeconds > timeSinceStart ? 0 : pausedDurationSeconds
      const elapsed = timeSinceStart - effectivePausedDuration

      const roundRemaining = isRoundTimerEnabled ? Math.max(0, pickTimeoutSeconds - elapsed) : Infinity

      // Last player timer uses its own start time (when they became the last player)
      let lastPlayerRemaining = Infinity
      if (isLastPlayerTimerEnabled && isLastPlayer && lastPlayerStartedAt) {
        const lastPlayerStart = new Date(lastPlayerStartedAt).getTime()
        const lastPlayerElapsed = Math.floor((now - lastPlayerStart) / 1000)
        lastPlayerRemaining = Math.max(0, lastPlayerTimerSeconds - lastPlayerElapsed)
      }

      // Show whichever has less time remaining
      if (lastPlayerRemaining <= roundRemaining && lastPlayerRemaining !== Infinity) {
        setActiveTimer('lastPlayer')
      } else if (roundRemaining !== Infinity) {
        setActiveTimer('round')
      }
    }

    calculateActiveTimer()

    if (!isPaused) {
      const interval = setInterval(calculateActiveTimer, 1000)
      return () => clearInterval(interval)
    }
  }, [isDrafting, pickStartedAt, pausedDurationSeconds, isRoundTimerEnabled, isLastPlayerTimerEnabled, isLastPlayer, pickTimeoutSeconds, lastPlayerTimerSeconds, isPaused, lastPlayerStartedAt])

  // Determine what should be shown
  const showRoundTimer = isRoundTimerEnabled
  const showLastPlayerTimer = isLastPlayerTimerEnabled && isLastPlayer

  // If neither timer should be shown, return null (hides entire container)
  if (!isDrafting || (!showRoundTimer && !showLastPlayerTimer)) return null

  // Determine which timer to display
  const displayLastPlayer = activeTimer === 'lastPlayer' && showLastPlayerTimer

  // Wrapper component - when not compact, include timer-bar wrapper
  const wrapperClass = compact ? '' : 'timer-bar'

  // Get timer label
  const timerLabel = displayLastPlayer
    ? (compact ? "Last Player" : "Last Player:")
    : (compact ? "Pick" : "Pick Timeout:")
  const totalLeaderRounds = draftState?.totalPacks || draft?.settings?.chaosSets?.length || 3

  return (
    <>
      {/* Round/Pick info displayed ABOVE the timer box */}
      {draftState?.phase === 'leader_draft' && (
        <div className="round-pick-info">
          Leader {draftState?.leaderRound || 1}/{totalLeaderRounds}
        </div>
      )}
      {draftState?.phase === 'pack_draft' && (
        <div className="round-pick-info">
          Pack {draftState?.packNumber || 1} - Pick {draftState?.pickInPack || 1}
        </div>
      )}

      <div className={wrapperClass}>
        <div className={`timer-panel ${compact ? 'compact' : ''} ${isPaused ? 'paused' : ''}`}>
          {isPaused ? (
            <>
              {/* When paused: show label + "PAUSED" instead of time + play button */}
              <div className="countdown-timer paused-timer">
                <span className="timer-label">{timerLabel}</span>
                <span className="timer-value paused-value">PAUSED</span>
              </div>
              {isHost && onTogglePause && (
                <TimerButton isPaused={true} onClick={handleTogglePause} />
              )}
            </>
          ) : (
            <>
              {displayLastPlayer ? (
                <CountdownTimer
                  label={timerLabel}
                  totalSeconds={lastPlayerTimerSeconds}
                  startedAt={lastPlayerStartedAt || pickStartedAt}
                  warningThreshold={30}
                  active={true}
                  compact={compact}
                  paused={isPaused}
                  pausedDurationSeconds={0}
                  onExpire={onTimerExpire}
                />
              ) : (
                <CountdownTimer
                  label={timerLabel}
                  totalSeconds={pickTimeoutSeconds}
                  startedAt={pickStartedAt}
                  warningThreshold={30}
                  active={isDrafting}
                  compact={compact}
                  paused={isPaused}
                  pausedDurationSeconds={pausedDurationSeconds}
                  onExpire={onTimerExpire}
                />
              )}
              {isHost && onTogglePause && (
                <TimerButton isPaused={false} onClick={handleTogglePause} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default TimerPanel
