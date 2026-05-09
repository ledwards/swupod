// @ts-nocheck
'use client'

import { useEffect } from 'react'
import { useAuth } from '../../src/contexts/AuthContext'
import ImportPoolWizard from '../../src/components/ImportPool/ImportPoolWizard'
import Button from '../../src/components/Button'
import { initializeCardCache } from '../../src/utils/cardCache'
import '../../src/App.css'
import '../../src/styles/backgrounds.css'
import '../../src/components/ImportPool/ImportPool.css'

export default function ImportPoolPage() {
  const { user, isAuthenticated, isPatron, loading: authLoading } = useAuth()

  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  const handleLogin = () => {
    const returnUrl = encodeURIComponent('/import')
    window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
  }

  if (authLoading) {
    return (
      <div className="import-pool-page page-background">
        <div className="ip-skeleton">
          <div className="ip-skeleton__title" />
          <div className="ip-skeleton__steps" />
          <div className="ip-skeleton__toolbar" />
          <div className="ip-skeleton__table">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="ip-skeleton__row" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="import-pool-page page-background">
        <div className="import-pool-auth-prompt">
          <h1>Import Pool</h1>
          <p>Upload a photo of your registered competitive sealed pool sheet to bring it into the deckbuilder.</p>
          <p className="import-pool-auth-note">
            Sign in with Discord to continue. This feature is available to{' '}
            <a href="/support-the-pod">Friends of the Pod</a>.
          </p>
          <Button variant="discord" onClick={handleLogin}>
            Sign in with Discord
          </Button>
        </div>
      </div>
    )
  }

  // Authenticated but not a patron — point them at the support page where
  // they can read about every Friends-of-the-Pod feature (including this one).
  if (isPatron === false) {
    return (
      <div className="import-pool-page page-background">
        <div className="import-pool-auth-prompt">
          <h1>Import Pool</h1>
          <p>Upload a photo of your registered competitive sealed pool sheet to bring it into the deckbuilder.</p>
          <p className="import-pool-auth-note">
            This feature is available to <strong>Friends of the Pod</strong>.
          </p>
          <a href="/support-the-pod" style={{ textDecoration: 'none' }}>
            <Button variant="primary">Become a Friend of the Pod</Button>
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="import-pool-page page-background">
      <ImportPoolWizard />
    </div>
  )
}
