'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import { SiteTitle } from '@/src/components/SiteTheme'
import { PATREON_URL } from '@/src/utils/membership'
import './beta-program.css'

const DISCORD_INVITE_URL = process.env['NEXT_PUBLIC_DISCORD_INVITE_URL'] || 'https://discord.gg/u6fkdDzWqF'
const PATREON_CONNECTIONS_URL = 'https://www.patreon.com/settings/apps'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'notFound'
interface BetaAuth {
  user: { id?: string; is_beta_tester?: boolean; is_admin?: boolean } | null
  loading: boolean
  signIn: () => void
  enrollBeta: () => Promise<boolean>
  isPatron: boolean | null
  patronMessage: string | null
  refreshPatronStatus: () => Promise<{ isPatron: boolean }>
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
}

/**
 * The themed Beta Program page (alpha). Same flow as the legacy page: sign in,
 * join if you're a patron (or check the Patreon connection), and anyone who
 * already has beta access moves on to Sealed.
 */
export default function BetaProgram() {
  const { user, loading, signIn, enrollBeta, isPatron, patronMessage, refreshPatronStatus } = useAuth() as BetaAuth
  const router = useRouter()
  const hasBetaAccess = Boolean(user?.is_beta_tester || user?.is_admin)
  // null until checked, so the Discord pitch only shows after a confirmed "not a member".
  const [isDiscordMember, setIsDiscordMember] = useState<boolean | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')

  useEffect(() => {
    if (!loading && !user) signIn()
  }, [loading, user, signIn])

  // Beta access is automatic for patrons, so anyone who has it moves on to Sealed.
  useEffect(() => {
    if (!hasBetaAccess) return
    const cameFromManualConnection = connectionStatus === 'connecting' || connectionStatus === 'connected'
    const timer = window.setTimeout(() => router.replace('/sealed'), cameFromManualConnection ? 2000 : 0)
    return () => window.clearTimeout(timer)
  }, [connectionStatus, hasBetaAccess, router])

  useEffect(() => {
    if (!user || !hasBetaAccess) {
      setIsDiscordMember(null)
      return
    }
    fetch('/api/auth/discord-member', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data?.data) setIsDiscordMember(Boolean(data.data.isMember)) })
      .catch(() => { /* Leave it unknown so a flaky read never pitches Discord. */ })
  }, [user?.id, hasBetaAccess])

  const joinBeta = async () => {
    if (await enrollBeta()) router.push('/sealed')
  }

  const checkConnection = async () => {
    setConnectionStatus('connecting')
    try {
      const result = await refreshPatronStatus()
      setConnectionStatus(result.isPatron ? 'connected' : 'notFound')
    } catch {
      setConnectionStatus('notFound')
    }
  }

  const ready = !loading && user
  const canJoin = !hasBetaAccess && (user?.is_admin || isPatron === true)
  const needsPatron = !hasBetaAccess && !user?.is_admin && isPatron === false

  return (
    <div className="bp-page">
      <SiteTitle subtitle="Early access for Friends of the Pod">Beta Program</SiteTitle>

      <p className="bp-lede">Be the first to try what&apos;s next. Beta testers get early access to everything before it goes live.</p>

      <section className="bp-panel bp-labeled" aria-labelledby="bp-features">
        <h2 id="bp-features" className="bp-label">What You Get</h2>
        <ul className="bp-features">
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6.5v5c0 4.5 3.3 8.3 8 9.5 4.7-1.2 8-5 8-9.5v-5Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
            <div><strong>Beta Access</strong><span>Access early features and pre-release sets by becoming an exclusive beta tester.</span></div>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="11" height="15" rx="1.5" /><path d="M9 21h9a1.5 1.5 0 0 0 1.5-1.5V7" /></svg>
            <div><strong>Pre-Release Sets</strong><span>Draft and build sealed pools from upcoming sets before release.</span></div>
          </li>
        </ul>
      </section>

      <section className="bp-panel bp-actions" aria-label="Your Beta Access">
        {!ready && <ContentSkeleton kind="control" />}

        {ready && hasBetaAccess && (
          <>
            <p className="bp-status bp-status--success" role="status"><CheckIcon />You have beta access</p>
            {connectionStatus === 'connected' && <p className="bp-status bp-status--success" role="status" aria-live="polite"><CheckIcon />Connected! Access unlocked.</p>}
            {isDiscordMember === false && (
              <>
                <p className="bp-note">One more thing: join the Pod Discord to connect with other supporters, vote on community polls, and get your Friend of the Pod role.</p>
                <a className="btn btn--primary btn--lg" href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Join the Discord</a>
              </>
            )}
          </>
        )}

        {ready && canJoin && (
          <>
            {isPatron === true && <p className="bp-note">Your Friend of the Pod membership is active.</p>}
            <Button variant="primary" size="lg" onClick={joinBeta}>Join the Beta</Button>
          </>
        )}

        {ready && needsPatron && (
          <>
            <p>Beta access is available to Patreon supporters.</p>
            <a className="btn btn--primary btn--lg" href={PATREON_URL} target="_blank" rel="noopener noreferrer">Subscribe on Patreon</a>
            <hr className="bp-divider" />
            {patronMessage && <p className="bp-status bp-status--warning">{patronMessage}</p>}
            <p className="bp-note">Already a supporter? Link Discord on Patreon, then check the connection here.</p>
            <div className="bp-row">
              <a className="btn btn--secondary btn--sm" href={PATREON_CONNECTIONS_URL} target="_blank" rel="noopener noreferrer">Open Patreon Connections</a>
              <Button size="sm" onClick={checkConnection} disabled={connectionStatus === 'connecting'}>Check Connection</Button>
            </div>
            {connectionStatus === 'connecting' && <div role="status" aria-label="Connecting your account" className="bp-pending"><ContentSkeleton kind="text" /></div>}
            {connectionStatus === 'connected' && <p className="bp-status bp-status--success" role="status" aria-live="polite"><CheckIcon />Connected! Access unlocked.</p>}
            {connectionStatus === 'notFound' && <p className="bp-status bp-status--warning" role="status" aria-live="polite">Still waiting on Patreon. Give it a few seconds, then check again.</p>}
          </>
        )}

        {ready && !hasBetaAccess && !user?.is_admin && isPatron === null && <ContentSkeleton kind="control" />}
      </section>
    </div>
  )
}
