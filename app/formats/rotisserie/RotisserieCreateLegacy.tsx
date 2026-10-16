// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { trackEvent, AnalyticsEvents } from '@/src/hooks/useAnalytics'
import './page.css'

export default function RotisseriePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const hasCreated = useRef(false)

  useEffect(() => {
    // Wait for auth to load
    if (authLoading) return

    // Need to be logged in
    if (!user) {
      router.push('/api/auth/signin/discord?return_to=/formats/rotisserie')
      return
    }

    // Only create once
    if (hasCreated.current) return
    hasCreated.current = true

    const createDraft = async () => {
      try {
        const response = await fetch('/api/formats/rotisserie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({})
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.message || result.data?.error || 'Failed to create draft')
        }

        const result = await response.json()
        trackEvent(AnalyticsEvents.ROTISSERIE_CREATED)
        router.replace(`/formats/rotisserie/${result.data.shareId}`)
      } catch (err) {
        setError(err.message || 'Failed to create draft')
      }
    }

    createDraft()
  }, [user, authLoading, router])

  if (error) {
    return (
      <div className="rotisserie-page">
        <div className="rotisserie-container">
          <div className="error-state">
            <h2>Error</h2>
            <p>{error}</p>
            <button onClick={() => router.push('/formats')}>Back to Formats</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rotisserie-page">
      <div className="rotisserie-container">
        <div className="loading">Creating draft...</div>
      </div>
    </div>
  )
}
