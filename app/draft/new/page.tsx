// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import { createDraft } from '../../../src/utils/draftApi'
import { initializeCardCache } from '../../../src/utils/cardCache'
import { trackEvent, AnalyticsEvents } from '../../../src/hooks/useAnalytics'
import SetSelection from '../../../src/components/SetSelection'
import Button from '../../../src/components/Button'
import '../../../src/App.css'
import '../draft.css'

export default function NewDraftPage() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [competitive, setCompetitive] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('competitive') === '1') {
      setCompetitive(true)
    }
  }, [])
  const [isPublic, setIsPublic] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pod-visibility')
      return saved !== null ? saved === 'public' : true
    }
    return true
  })

  const togglePublic = () => {
    const next = !isPublic
    setIsPublic(next)
    localStorage.setItem('pod-visibility', next ? 'public' : 'private')
  }

  // Preload cards on mount
  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  const handleLogin = () => {
    const returnUrl = encodeURIComponent('/draft/new')
    window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
  }

  const handleSetSelect = async (setCode: string) => {
    if (creating) return

    setCreating(true)
    setError(null)

    try {
      const result = await createDraft(setCode, { isPublic, competitive })
      trackEvent(AnalyticsEvents.DRAFT_CREATED, { set_code: setCode })
      router.push(`/draft/${result.shareId}`)
    } catch (err) {
      console.error('Failed to create draft:', err)
      setError(err instanceof Error ? err.message : 'Failed to create draft')
      setCreating(false)
    }
  }

  const handleBack = () => {
    router.push('/draft')
  }

  if (authLoading) {
    return (
      <div className="draft-page-bg">
        <div className="loading"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="draft-page-bg">
        <div className="auth-prompt-container">
          <h2>Login Required</h2>
          <p>Draft requires a Discord login to track players in multiplayer.</p>
          <Button variant="discord" size="lg" onClick={handleLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/></svg>
            Login with Discord
          </Button>
        </div>
      </div>
    )
  }

  if (creating) {
    return (
      <div className="draft-page-bg">
        <div className="loading-container">
          <div className="loading"></div>
          <p>Creating draft...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="draft-page-bg">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
          <button className="primary-button" onClick={() => setError(null)}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const lockButton = (
    <button
      className={`setting-lock ${isPublic ? 'setting-lock-open' : 'setting-lock-closed'}`}
      onClick={togglePublic}
      title={isPublic ? 'Public — visible to other players' : 'Private — only players with the link can join'}
    >
      {isPublic ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      )}
      <span>{isPublic ? 'Public Pod' : 'Private Pod'}</span>
    </button>
  )

  const headerActions = (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      {lockButton}
      {competitive && (
        <span className="setting-lock setting-lock-competitive" style={{ cursor: 'default' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/>
            <path d="M4 22h16"/>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
          </svg>
          <span>Competitive</span>
        </span>
      )}
    </div>
  )

  return (
    <div className="app">
      <SetSelection onSetSelect={handleSetSelect} onBack={handleBack} headerAction={headerActions} />
    </div>
  )
}
