// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../../src/contexts/AuthContext'
import '../../../../src/App.css'
import '../../draft.css'

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function DraftDeckPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [shareId, setShareId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get shareId from params
  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  // Get or create pool and redirect
  useEffect(() => {
    if (!shareId || !isAuthenticated || authLoading) return

    const getOrCreatePool = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/draft/${shareId}/pool`, {
          credentials: 'include',
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.message || 'Failed to get pool')
        }

        const data = await response.json()
        // Redirect to the pool's deck builder
        router.replace(`/pools/${data.poolShareId}/deck`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load draft pool')
        setLoading(false)
      }
    }

    getOrCreatePool()
  }, [shareId, isAuthenticated, authLoading, router])

  if (authLoading || !shareId || loading) {
    return (
      <div className="draft-page-bg">
        <div className="loading-container">
          <div className="loading"></div>
          <p>Loading draft pool...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    const returnTo = shareId ? encodeURIComponent(`/draft/${shareId}/deck`) : '/'
    return (
      <div className="draft-page-bg">
        <div className="login-required">
          <h2>Sign In Required</h2>
          <p>Please sign in to access your draft deck</p>
          <button
            className="discord-login-button"
            onClick={() => window.location.href = `/api/auth/signin/discord?return_to=${returnTo}`}
          >
            Sign in with Discord
          </button>
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
        </div>
      </div>
    )
  }

  return (
    <div className="app draft-page-bg">
      <div className="loading-container">
        <div className="loading"></div>
        <p>Redirecting to deck builder...</p>
      </div>
    </div>
  )
}
