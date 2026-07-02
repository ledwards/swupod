// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import CountdownTimer from './CountdownTimer'
import TimerButton from './TimerButton'
import { isRoundTimerEnabled as computeRoundTimerEnabled, getDisplayPickSeconds } from '../utils/draftTimerDefaults'
import { elapsedTimerSeconds } from '../utils/serverClock'
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
  serverTimeOffsetMs?: number
  draftState?: DraftState
}

export interface TimerPanelProps {
  draft?: Draft | null
  players?: DraftPlayer[]
  compact?: boolean
  isHost?: boolean
  onTogglePause?: () => void
  onUpdateTimerSettings?: (settings: Record<string, unknown>) => void
  draftState?: DraftState | null
  onTimerExpire?: () => void
  /**
   * Cards left in the player's pack (pack draft) or leaders left (leader draft).
   * Drives the competitive Appendix C round-timer schedule. Ignored for casual.
   */
  cardsRemaining?: number
}

/**
 * Timer panel shown during active drafting
 * Shows either pick timeout or last player timer (whichever has less time remaining)
 * Both timers can be enabled/disabled independently
 */
function TimerPanel({ draft, players = [], compact = false, isHost = false, onTogglePause, onUpdateTimerSettings, draftState = null, onTimerExpire, cardsRemaining = 0 }: TimerPanelProps) {
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
  const isRoundTimerEnabled = computeRoundTimerEnabled(draft)
  const isLastPlayerTimerEnabled = draft?.timerEnabled !== false

  // Competitive pods run the official Appendix C schedule: the round timer steps
  // down as the pack/leaders deplete and is NOT host-customizable. `null` means
  // the schedule auto-picks the last pack card — nothing to time.
  const isCompetitive = draft?.competitive === true
  const displayedPickSeconds = getDisplayPickSeconds({
    competitive: isCompetitive,
    phase: draftState?.phase,
    itemsRemaining: cardsRemaining,
    roundTimeoutSeconds: pickTimeoutSeconds,
  })
  const isPaused = optimisticPaused !== null ? optimisticPaused : draft?.paused === true
  const pausedDurationSeconds = draft?.pausedDurationSeconds || 0
  const serverTimeOffsetMs = draft?.serverTimeOffsetMs || 0

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
      const elapsed = elapsedTimerSeconds({
        startedAt: pickStartedAt,
        pausedDurationSeconds,
        serverTimeOffsetMs,
      })

      const roundRemaining = isRoundTimerEnabled ? Math.max(0, pickTimeoutSeconds - elapsed) : Infinity

      // Last player timer uses its own start time (when they became the last player)
      let lastPlayerRemaining = Infinity
      if (isLastPlayerTimerEnabled && isLastPlayer && lastPlayerStartedAt) {
        const lastPlayerElapsed = elapsedTimerSeconds({
          startedAt: lastPlayerStartedAt,
          serverTimeOffsetMs,
        })
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
  }, [isDrafting, pickStartedAt, pausedDurationSeconds, serverTimeOffsetMs, isRoundTimerEnabled, isLastPlayerTimerEnabled, isLastPlayer, pickTimeoutSeconds, lastPlayerTimerSeconds, isPaused, lastPlayerStartedAt])

  // Determine what should be shown. Competitive: always show the round timer on
  // the Appendix C schedule (hidden only when the schedule auto-picks the last
  // pack card → null), and never the Last Player timer (not a sanctioned rule).
  const showRoundTimer = isCompetitive ? displayedPickSeconds !== null : isRoundTimerEnabled
  const showLastPlayerTimer = !isCompetitive && isLastPlayerTimerEnabled && isLastPlayer

  // If neither timer should be shown, render invisible placeholder to prevent layout shift
  if (!isDrafting || (!showRoundTimer && !showLastPlayerTimer)) {
    if (compact) return null
    return <div className="timer-bar-placeholder" aria-hidden="true" />
  }

  // Determine which timer to display
  const displayLastPlayer = activeTimer === 'lastPlayer' && showLastPlayerTimer

  // Wrapper component - when not compact, include timer-bar wrapper
  const wrapperClass = compact ? '' : 'timer-bar'

  // Get timer label. In competitive, the live timer IS the Appendix C round
  // timer (the per-pick timer is disabled), so it's labelled "Round Timer".
  const timerLabel = displayLastPlayer
    ? (compact ? "Last Player" : "Last Player:")
    : isCompetitive
      ? (compact ? "Round" : "Round Timer:")
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
                  serverTimeOffsetMs={serverTimeOffsetMs}
                  onExpire={onTimerExpire}
                />
              ) : (
                <CountdownTimer
                  label={timerLabel}
                  totalSeconds={displayedPickSeconds ?? pickTimeoutSeconds}
                  startedAt={pickStartedAt}
                  warningThreshold={30}
                  active={isDrafting}
                  compact={compact}
                  paused={isPaused}
                  pausedDurationSeconds={pausedDurationSeconds}
                  serverTimeOffsetMs={serverTimeOffsetMs}
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

      {/* Host timer controls — modify timers during active draft */}
      {isHost && onUpdateTimerSettings && !compact && !draft?.competitive && (
        <div className="timer-host-controls">
          <div className="timer-host-row">
            <label>
              <input
                type="checkbox"
                checked={isRoundTimerEnabled}
                onChange={(e) => onUpdateTimerSettings({ timed: e.target.checked })}
              />
              Round
            </label>
            {isRoundTimerEnabled && (
              <select
                value={pickTimeoutSeconds}
                onChange={(e) => onUpdateTimerSettings({ pickTimeoutSeconds: Number(e.target.value) })}
              >
                <option value={30}>30s</option>
                <option value={45}>45s</option>
                <option value={60}>60s</option>
                <option value={90}>90s</option>
                <option value={120}>2m</option>
                <option value={180}>3m</option>
                <option value={300}>5m</option>
                <option value={600}>10m</option>
              </select>
            )}
          </div>
          <div className="timer-host-row">
            <label>
              <input
                type="checkbox"
                checked={isLastPlayerTimerEnabled}
                onChange={(e) => onUpdateTimerSettings({ timerEnabled: e.target.checked })}
              />
              Last Player
            </label>
            {isLastPlayerTimerEnabled && (
              <select
                value={lastPlayerTimerSeconds}
                onChange={(e) => onUpdateTimerSettings({ timerSeconds: Number(e.target.value) })}
              >
                <option value={10}>10s</option>
                <option value={15}>15s</option>
                <option value={20}>20s</option>
                <option value={30}>30s</option>
                <option value={45}>45s</option>
                <option value={60}>60s</option>
                <option value={90}>90s</option>
              </select>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default TimerPanel
