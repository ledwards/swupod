// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import './DraftTimer.css'

export interface DraftTimerProps {
  seconds: number
  onTimeout?: () => void
}

function DraftTimer({ seconds, onTimeout }: DraftTimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds)

  useEffect(() => {
    setTimeLeft(seconds)
  }, [seconds])

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeout?.()
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, onTimeout])

  const isUrgent = timeLeft <= 10
  const isCritical = timeLeft <= 5

  return (
    <div className={`draft-timer ${isUrgent ? 'urgent' : ''} ${isCritical ? 'critical' : ''}`}>
      <div className="timer-circle">
        <span className="timer-value">{timeLeft}</span>
        <span className="timer-label">sec</span>
      </div>
      <div className="timer-message">
        {isCritical ? 'Hurry!' : isUrgent ? 'Running out of time!' : 'You are the last to pick'}
      </div>
    </div>
  )
}

export default DraftTimer
