// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import { createDraft } from '../../../src/utils/draftApi'
import { initializeCardCache } from '../../../src/utils/cardCache'
import { trackEvent, AnalyticsEvents } from '../../../src/hooks/useAnalytics'
import { getOrCreateLimitedFlowId, LimitedAnalyticsEvents } from '../../../src/analytics/limitedEvents'
import SetSelection from '../../../src/components/SetSelection'
import '../../../src/App.css'
import '../draft.css'

export default function SoloDraftPage() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  const handleSetSelect = async (setCode: string) => {
    if (creating) return

    // If not logged in, redirect to Discord login and come back
    if (!isAuthenticated) {
      const returnUrl = encodeURIComponent('/draft/solo')
      window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
      return
    }

    setCreating(true)
    setError(null)
    const flowId = getOrCreateLimitedFlowId('draft:solo')
    trackEvent(LimitedAnalyticsEvents.LIMITED_FLOW_STARTED, {
      format: 'draft',
      mode: 'solo',
      surface: 'solo_draft_set_selection',
      source_route: '/draft/solo',
      flow_id: flowId,
      set_code: setCode,
    })

    try {
      // Create draft
      const result = await createDraft(setCode, { isPublic: false, flowId, settings: { isSolo: true } })
      trackEvent(AnalyticsEvents.DRAFT_CREATED, { set_code: setCode, solo: true })

      // Auto-add 7 bots
      await fetch(`/api/draft/${result.shareId}/dev/add-bots?count=7`, {
        method: 'POST',
        credentials: 'include',
      })

      // Navigate to the draft lobby
      router.push(`/draft/${result.shareId}`)
    } catch (err) {
      console.error('Failed to create solo draft:', err)
      setError(err instanceof Error ? err.message : 'Failed to create draft')
      setCreating(false)
    }
  }

  const handleBack = () => {
    router.push('/')
  }

  if (creating) {
    return (
      <div className="draft-page-bg">
        <div className="loading-container">
          <div className="loading"></div>
          <p>Creating solo draft...</p>
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

  return (
    <div className="app">
      <SetSelection onSetSelect={handleSetSelect} onBack={handleBack} title="Solo Draft" />
    </div>
  )
}
