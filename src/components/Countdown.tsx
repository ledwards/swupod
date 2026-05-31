// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import './Countdown.css'

interface CountdownProps {
  targetDate: Date
  className?: string
  livePastZero?: boolean
}

interface Parts {
  total: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getParts(target: number, now: number): Parts {
  const total = Math.max(0, target - now)
  return {
    total,
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * Live countdown to a target Date. Pass an already-resolved Date in the desired
 * time zone (e.g., `new Date('2026-07-10T00:00:00')` for local midnight, or
 * the UTC ISO form for absolute time).
 *
 * SSR-safe: renders empty cells on the server / first client paint, then ticks
 * up to a 1Hz interval after hydration. Past the target the cells freeze at
 * 0/0/0/0 unless `livePastZero` is set.
 */
export function Countdown({ targetDate, className = '', livePastZero = false }: CountdownProps) {
  const target = targetDate.getTime()
  const [parts, setParts] = useState<Parts | null>(null)

  useEffect(() => {
    const tick = () => setParts(getParts(target, Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])

  const live = parts ?? { total: 1, days: 0, hours: 0, minutes: 0, seconds: 0 }
  const expired = parts !== null && live.total === 0 && !livePastZero

  return (
    <div
      className={`countdown ${expired ? 'countdown--expired' : ''} ${className}`}
      role="timer"
      aria-live="off"
      aria-label="Time until prerelease"
    >
      <div className="countdown-cell">
        <span className="countdown-value">{live.days}</span>
        <span className="countdown-label">{live.days === 1 ? 'day' : 'days'}</span>
      </div>
      <span className="countdown-sep" aria-hidden="true">:</span>
      <div className="countdown-cell">
        <span className="countdown-value">{pad(live.hours)}</span>
        <span className="countdown-label">hr</span>
      </div>
      <span className="countdown-sep" aria-hidden="true">:</span>
      <div className="countdown-cell">
        <span className="countdown-value">{pad(live.minutes)}</span>
        <span className="countdown-label">min</span>
      </div>
      <span className="countdown-sep" aria-hidden="true">:</span>
      <div className="countdown-cell">
        <span className="countdown-value">{pad(live.seconds)}</span>
        <span className="countdown-label">sec</span>
      </div>
    </div>
  )
}

export default Countdown
