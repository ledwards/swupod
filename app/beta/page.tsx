// @ts-nocheck
'use client'

import { useEffect } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import { useRouter } from 'next/navigation'
import './page.css'

export default function BetaPage() {
  const { user, loading, signIn, enrollBeta, isPatron } = useAuth()
  const router = useRouter()

  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  // Force login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      signIn()
    }
  }, [loading, user, signIn])

  const handleJoinBeta = async () => {
    const success = await enrollBeta()
    if (success) {
      router.push('/sealed')
    }
  }

  if (loading || !user) {
    return (
      <div className="beta-page">
        <div className="beta-container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="beta-page">
      <div className="beta-container">
        <h1>Beta Program</h1>

        <div className="beta-info">
          <p className="beta-description">
            Be the first to try what's next. Beta testers get early access to everything before it goes live.
          </p>
          <div className="beta-features">
            <h3>What You Get</h3>
            <ul>
              <li><strong>Beta Access</strong> — Access early features and pre-release sets by becoming an exclusive beta tester</li>
              <li><strong>Pre-Release Sets</strong> — Draft and build sealed pools from upcoming sets before release</li>
            </ul>
          </div>
        </div>

        <div className="beta-actions">
          {hasBetaAccess && (
            <div className="beta-success">
              <span className="checkmark">✓</span>
              <span>You have beta access</span>
            </div>
          )}

          {!hasBetaAccess && (user?.is_admin || isPatron === true) && (
            <Button variant="primary" size="lg" onClick={handleJoinBeta}>
              Join the Beta
            </Button>
          )}

          {!hasBetaAccess && !user?.is_admin && isPatron === false && (
            <div className="beta-patron-required">
              <p>Beta access is available to Patreon supporters.</p>
              <a
                href="https://www.patreon.com/protectthepod"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="primary" size="lg">
                  Subscribe on Patreon
                </Button>
              </a>
            </div>
          )}

          {!hasBetaAccess && !user?.is_admin && isPatron === null && (
            <div className="loading">Checking eligibility...</div>
          )}
        </div>
      </div>
    </div>
  )
}
