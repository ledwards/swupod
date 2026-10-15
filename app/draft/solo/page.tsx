// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import { createDraft, startDraft } from '../../../src/utils/draftApi'
import { initializeCardCache } from '../../../src/utils/cardCache'
import { trackEvent, AnalyticsEvents } from '../../../src/hooks/useAnalytics'
import { getOrCreateLimitedFlowId, LimitedAnalyticsEvents } from '../../../src/analytics/limitedEvents'
import ContentSkeleton from '../../../src/components/ContentSkeleton'
import SetSelection from '../../../src/components/SetSelection'
import '../../../src/App.css'
import '../draft.css'

export default function SoloDraftPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const autoStarted = useRef(false)
  const createdPod = useRef<string | null>(null)
  const botsAdded = useRef(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  const handleSetSelect = async (setCode: string, direct = false) => {
    if (creating) return

    // If not logged in, redirect to Discord login and come back
    if (!isAuthenticated && !direct) {
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
      const result = createdPod.current ? {shareId: createdPod.current} : await createDraft(setCode, { isPublic: false, flowId, settings: { isSolo: true } })
      createdPod.current = result.shareId
      trackEvent(AnalyticsEvents.DRAFT_CREATED, { set_code: setCode, solo: true })

      // Auto-add 7 bots
      if (!botsAdded.current) {
      const bots = await fetch(`/api/draft/${result.shareId}/dev/add-bots?count=7`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!bots.ok) throw new Error('Your draft was created, but the bots could not join.')
      botsAdded.current = true
      }
      if (direct) await startDraft(result.shareId)
      const target = new URL(`/draft/${result.shareId}`, window.location.origin)
      if (direct) target.searchParams.set('returnTo', `/play?format=draft&set=${encodeURIComponent(setCode)}`)
      router.replace(target.pathname + target.search)
    } catch (err) {
      console.error('Failed to create solo draft:', err)
      setError(err instanceof Error ? err.message : 'Failed to create draft')
      setCreating(false)
    }
  }

  useEffect(() => {
    if (authLoading || autoStarted.current) return
    const selected = params.get('set')
    if (params.get('start') !== '1' || !selected) return
    autoStarted.current = true
    void handleSetSelect(selected, true)
  }, [authLoading, params])

  const handleBack = () => {
    router.push('/')
  }

  if (creating || (!error && params.get('start') === '1' && !!params.get('set'))) {
    return (
      <div className="draft-page-bg">
        <div className="loading-container">
          <ContentSkeleton />
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
          <button className="primary-button" onClick={() => { const params = new URLSearchParams(window.location.search); if (params.get('start') === '1' && params.get('set')) void handleSetSelect(params.get('set')!, true); else setError(null) }}>
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
