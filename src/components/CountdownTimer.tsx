// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { remainingTimerSeconds } from '../utils/serverClock'
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
}: CountdownTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds)
  const hasExpiredRef = useRef(false)

  // Reset expired flag when timer restarts (new startedAt)
  useEffect(() => {
    hasExpiredRef.current = false
  }, [startedAt])

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
  }, [totalSeconds, startedAt, active, paused, pausedDurationSeconds, serverTimeOffsetMs, onExpire])

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
