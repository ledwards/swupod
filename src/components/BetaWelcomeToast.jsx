'use client'

import { useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Button from './Button'
import './BetaWelcomeToast.css'

const AUTO_DISMISS_MS = 8000

export default function BetaWelcomeToast() {
  const { showBetaWelcome, dismissBetaWelcome } = useAuth()

  useEffect(() => {
    if (!showBetaWelcome) return
    const t = setTimeout(() => dismissBetaWelcome(), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [showBetaWelcome, dismissBetaWelcome])

  if (!showBetaWelcome) return null

  return (
    <div className="beta-welcome-toast" role="status" aria-live="polite">
      <span className="beta-welcome-toast-icon" aria-hidden="true">✓</span>
      <div className="beta-welcome-toast-text">
        <strong>Welcome to the beta!</strong>
        <span>Patron access unlocked — early sets and features are yours.</span>
      </div>
      <Button
        variant="icon"
        size="sm"
        onClick={dismissBetaWelcome}
        aria-label="Dismiss welcome message"
      >
        ×
      </Button>
    </div>
  )
}
