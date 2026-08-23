// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { remainingTimerSeconds } from '../utils/serverClock'
import {
  countdownCueClip,
  crossedCountdownThresholds,
  openingCountdownThreshold,
} from '../services/countdownCues'
import useVoicePackAudio from '../hooks/useVoicePackAudio'
import './CountdownTimer.css'

export interface CountdownTimerProps {
  totalSeconds: number
  startedAt?: string | null
  warningThreshold?: number
  active?: boolean
  label?: string
  compact?: boolean
  paused?: boolean
  pausedDurationSeconds?: number
  serverTimeOffsetMs?: number
  onExpire?: () => void
  /**
   * Opt in to spoken countdown cues (count-30/15/5 + time-is-up). Off by
   * default: this component renders more than once per page and every enabled
   * instance speaks, so only ONE may turn it on (see TimerPanel).
   */
  cues?: boolean
  /** Voice pack for the cues; null/undefined → the default pack. */
  cuePackId?: string | null
}

/**
 * Countdown timer that shows remaining time
 * @param totalSeconds - Total seconds for the timer
 * @param startedAt - ISO timestamp when the timer started
 * @param warningThreshold - Seconds at which to show warning (red/flash)
 * @param active - Whether the timer is active
 * @param label - Label to show before the timer
 * @param paused - Whether the timer is paused
 * @param pausedDurationSeconds - Total seconds the timer has been paused
 * @param serverTimeOffsetMs - Delta between the server clock and this browser clock
 * @param onExpire - Callback when timer expires (reaches 0)
 * @param cues - Opt in to spoken countdown cues (single instance only)
 * @param cuePackId - Voice pack id for the cues
 */
function CountdownTimer({
  totalSeconds,
  startedAt,
  warningThreshold = 30,
  active = true,
  label,
  compact = false,
  paused = false,
  pausedDurationSeconds = 0,
  serverTimeOffsetMs = 0,
  onExpire,
  cues = false,
  cuePackId = null,
}: CountdownTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds)
  const hasExpiredRef = useRef(false)
  const { play, playSequence } = useVoicePackAudio(cuePackId)
  // Cue bookkeeping. This component is the ONLY place that knows how many
  // seconds are left, so the countdown cues live here — but each threshold
  // fires at most once per timer period, hence the refs.
  const previousRemainingRef = useRef<number | null>(null)
  const firedThresholdsRef = useRef<Set<number>>(new Set())
  const spokeExpiryRef = useRef(false)
  const spokeOpeningRef = useRef(false)
  // Whether this component has already lived through a period. The first one is
  // the pick you arrived on — either you have just been told "start the draft",
  // or you opened the page mid-pick — and neither wants a "next pick begins" on
  // top of it.
  const seenAPeriodRef = useRef(false)

  // Reset expired flag when timer restarts (new startedAt)
  useEffect(() => {
    hasExpiredRef.current = false
  }, [startedAt])

  // A new period (new pick, or a new Appendix C allowance for the same pack)
  // gets a clean slate of cues.
  useEffect(() => {
    if (previousRemainingRef.current !== null) seenAPeriodRef.current = true
    previousRemainingRef.current = null
    firedThresholdsRef.current = new Set()
    spokeExpiryRef.current = false
    spokeOpeningRef.current = false
  }, [startedAt, totalSeconds])

  useEffect(() => {
    if (!active || !startedAt) {
      setRemainingSeconds(totalSeconds)
      return
    }

    const calculateRemaining = () => {
      const remaining = remainingTimerSeconds({
        totalSeconds,
        startedAt,
        pausedDurationSeconds,
        serverTimeOffsetMs,
      })
      setRemainingSeconds(remaining)

      if (cues) {
        // A fresh period opens with the next-pick call, and — when the period's
        // length is itself a countdown mark — the mark right behind it, because
        // the clock can never be watched crossing a mark it starts on. That pair
        // is one sentence: "next pick begins", "thirty seconds remaining".
        if (
          !spokeOpeningRef.current &&
          previousRemainingRef.current === null &&
          seenAPeriodRef.current &&
          // Only when we caught the start. Landing on a pick already half gone
          // must not announce it as new.
          remaining >= totalSeconds - 1
        ) {
          spokeOpeningRef.current = true
          const opening = openingCountdownThreshold(totalSeconds)
          if (opening === null) {
            play('next-pick')
          } else {
            firedThresholdsRef.current.add(opening)
            playSequence(['next-pick', countdownCueClip(opening)])
          }
        }

        const crossed = crossedCountdownThresholds({
          previousSeconds: previousRemainingRef.current,
          currentSeconds: remaining,
          totalSeconds,
          firedThresholds: Array.from(firedThresholdsRef.current),
        })
        for (const threshold of crossed) {
          firedThresholdsRef.current.add(threshold)
          play(countdownCueClip(threshold))
        }
        // Only announce an expiry we actually watched happen — a client that
        // loads onto an already-expired clock should not shout "time is up".
        if (remaining === 0 && previousRemainingRef.current !== null && !spokeExpiryRef.current) {
          spokeExpiryRef.current = true
          play('time-is-up')
        }
      }
      previousRemainingRef.current = remaining

      // Call onExpire callback when timer hits 0 (only once per timer period)
      if (remaining === 0 && !hasExpiredRef.current && onExpire) {
        hasExpiredRef.current = true
        onExpire()
      }
    }

    // Calculate immediately
    calculateRemaining()

    // Only update every second if not paused
    if (!paused) {
      const interval = setInterval(calculateRemaining, 1000)
      return () => clearInterval(interval)
    }
  }, [totalSeconds, startedAt, active, paused, pausedDurationSeconds, serverTimeOffsetMs, onExpire, cues, play])

  const isWarning = remainingSeconds <= warningThreshold && remainingSeconds > 0
  const isCaution = remainingSeconds <= totalSeconds * 0.5 && remainingSeconds > warningThreshold
  const isExpired = remainingSeconds === 0

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!active) {
    return (
      <div className={`countdown-timer inactive ${compact ? 'compact' : ''}`}>
        {label && <span className="timer-label">{label}</span>}
        <span className="timer-value">--</span>
      </div>
    )
  }

  return (
    <div className={`countdown-timer ${isExpired ? 'expired' : isWarning ? 'warning' : isCaution ? 'caution' : ''} ${compact ? 'compact' : ''}`}>
      {label && <span className="timer-label">{label}</span>}
      <span className="timer-value">{formatTime(remainingSeconds)}</span>
    </div>
  )
}

export default CountdownTimer
