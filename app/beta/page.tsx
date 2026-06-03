// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import { useRouter } from 'next/navigation'
import { PATREON_URL } from '@/src/utils/membership'
import './page.css'

const DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'

export default function BetaPage() {
  const { user, loading, signIn, enrollBeta, isPatron, patronMessage } = useAuth()
  const router = useRouter()

  const hasBetaAccess = user?.is_beta_tester || user?.is_admin
  // null = not yet checked, true/false = resolved. Defaults to true (i.e.,
  // assume member) so the Discord CTA only renders after we have a negative
  // confirmation — avoids a "join Discord" flash for actual members.
  const [isDiscordMember, setIsDiscordMember] = useState<boolean | null>(null)

  // Force login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      signIn()
    }
  }, [loading, user, signIn])

  // Check Discord guild membership for the post-enrollment CTA. Only meaningful
  // when the user already has beta access (the success branch); skip otherwise.
  useEffect(() => {
    if (!user || !hasBetaAccess) {
      setIsDiscordMember(null)
      return
    }
    fetch('/api/auth/discord-member', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) setIsDiscordMember(Boolean(data.data.isMember))
      })
      .catch(() => {
        // Network/API failure — leave null so we don't pitch Discord on a flaky read.
      })
  }, [user?.id, hasBetaAccess])

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
            <>
              <div className="beta-success">
                <span className="checkmark">✓</span>
                <span>You have beta access</span>
              </div>

              {isDiscordMember === false && (
                <div className="beta-discord-cta">
                  <p className="beta-discord-cta-copy">
                    One more thing — join the Pod Discord to connect with other
                    supporters, vote on community polls, and get your Friend of
                    the Pod role.
                  </p>
                  <a
                    href={DISCORD_INVITE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="beta-discord-cta-link"
                  >
                    <Button variant="primary" size="lg">
                      Join the Discord
                    </Button>
                  </a>
                </div>
              )}
            </>
          )}

          {!hasBetaAccess && (user?.is_admin || isPatron === true) && (
            <Button variant="primary" size="lg" onClick={handleJoinBeta}>
              Join the Beta
            </Button>
          )}

          {!hasBetaAccess && !user?.is_admin && isPatron === false && (
            <div className="beta-patron-required">
              {patronMessage ? (
                <>
                  <p className="beta-patron-warning">{patronMessage}</p>
                  <p>After linking, refresh this page to get access.</p>
                </>
              ) : (
                <>
                  <p>Beta access is available to Patreon supporters.</p>
                  <a
                    href={PATREON_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="primary" size="lg">
                      Subscribe on Patreon
                    </Button>
                  </a>
                </>
              )}
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
