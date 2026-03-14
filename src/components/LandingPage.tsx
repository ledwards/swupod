// @ts-nocheck
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { usePresence } from '../hooks/usePresence'
import { usePublicPodsSocket } from '../hooks/usePublicPodsSocket'
import ReleaseNotes from './ReleaseNotes'
import Button from './Button'
import './LandingPage.css'

// Card art for mode buttons (hover reveal)
const MODE_ART = {
  sealedSolo: 'https://cdn.starwarsunlimited.com//card_07020301_EN_Han_Solo_5c873340ad.png',
  draftSolo: 'https://cdn.starwarsunlimited.com//card_SWH_01_460_Han_Solo_HYP_130f92cbd3.png',
  sealedLive: 'https://cdn.starwarsunlimited.com//card_04020336_EN_Close_the_Shield_Gate_54e600004d.png',
  draftLive: 'https://cdn.starwarsunlimited.com//card_SWH_01_465_Cunning_HYP_9c76fc00ac.png',
}

interface ActiveDraft {
  shareId: string
  status: string
  setName?: string
  draftName?: string
  createdAt?: string
}

interface ActiveSealedPod {
  shareId: string
  status: string
  setName?: string
  poolName?: string
  createdAt?: string
}

function LandingPage() {
  const { user, loading, signIn } = useAuth()
  const hasBetaAccess = user?.is_beta_tester || user?.is_admin
  const router = useRouter()
  const [wasRemoved, setWasRemoved] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('removed') === '1') {
      setWasRemoved(true)
    }
  }, [])
  const playerCount = usePresence(user?.id)
  const publicPods = usePublicPodsSocket()
  const [activeDraft, setActiveDraft] = useState<ActiveDraft | null>(null)
  const [activeSealedPod, setActiveSealedPod] = useState<ActiveSealedPod | null>(null)
  const [isDiscordMember, setIsDiscordMember] = useState(true)

  const sealedPodsOpen = publicPods.filter(p => p.podType === 'sealed').length
  const draftPodsOpen = publicPods.filter(p => p.podType === 'draft').length

  // Check Discord membership and active pods when user is logged in
  useEffect(() => {
    if (!user || loading) {
      setActiveDraft(null)
      setActiveSealedPod(null)
      setIsDiscordMember(false)
      return
    }

    const checkDiscordMembership = async () => {
      try {
        const response = await fetch('/api/auth/discord-member', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          setIsDiscordMember(data.data?.isMember || false)
        }
      } catch (err) {
        // If check fails, keep hidden (default true) — better to hide than show incorrectly
        console.error('Discord membership check failed:', err)
      }
    }

    const checkActiveDrafts = async () => {
      try {
        const response = await fetch('/api/draft/history', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const active = data.pods?.find(
            (pod: ActiveDraft) => pod.status === 'waiting' || pod.status === 'leader_draft' || pod.status === 'pack_draft'
          )
          setActiveDraft(active || null)
        }
      } catch (err) {
        console.error('Failed to check active drafts:', err)
      }
    }

    const checkActiveSealedPods = async () => {
      try {
        const response = await fetch('/api/sealed/history', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const active = data.pods?.find(
            (pod: ActiveSealedPod) => pod.status === 'waiting'
          )
          setActiveSealedPod(active || null)
        }
      } catch (err) {
        console.error('Failed to check active sealed pods:', err)
      }
    }

    checkDiscordMembership()
    checkActiveDrafts()
    checkActiveSealedPods()
  }, [user, loading])

  return (
    <div className="landing-page">
      <ReleaseNotes />
      {wasRemoved && (
        <div className="removed-banner">You were removed from the pod by the host.</div>
      )}
      <div className="landing-content">
        <a href="/">
          <img className="landing-logo" src="/ptp_logo400.png" alt="Protect the Pod Logo" />
        </a>
        <h1 className="visually-hidden">Protect the Pod</h1>
        <h2 className="subtitle">
          The Star Wars Unlimited<br />
          Limited Simulator
        </h2>
        {!loading && !user && (
          <button className="discord-cta" onClick={signIn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor" />
            </svg>
            Login with Discord
          </button>
        )}
        {!loading && user && !isDiscordMember && (
          <a
            className="discord-cta"
            href={process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor" />
            </svg>
            Join the Discord
          </a>
        )}
        {activeDraft && (
          <div className="active-draft-banner">
            <span>Live Pod: {activeDraft.draftName || activeDraft.setName || ''} Draft{activeDraft.createdAt ? ` ${new Date(activeDraft.createdAt).toLocaleDateString()}` : ''}</span>
            <Button
              variant="primary"
              size="sm"
              className="rejoin-button"
              onClick={() => router.push(`/draft/${activeDraft.shareId}`)}
            >
              Rejoin?
            </Button>
          </div>
        )}
        {activeSealedPod && (
          <div className="active-draft-banner">
            <span>Live Pod: {activeSealedPod.poolName || activeSealedPod.setName || ''} Sealed{activeSealedPod.createdAt ? ` ${new Date(activeSealedPod.createdAt).toLocaleDateString()}` : ''}</span>
            <Button
              variant="primary"
              size="sm"
              className="rejoin-button"
              onClick={() => router.push(`/sealed/${activeSealedPod.shareId}`)}
            >
              Rejoin?
            </Button>
          </div>
        )}
        <div className="mode-sections-row">
          <div className="mode-section">
            <h3 className="mode-section-header">Solo</h3>
            <div className="mode-column">
              <button className="mode-button art-unit" onClick={() => router.push('/sealed')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.sealedSolo}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Sealed</span>
                  <span className="mode-button-subtitle">Build a deck from 6 packs</span>
                </div>
              </button>
              <button className="mode-button art-unit" onClick={() => router.push('/draft/solo')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.draftSolo}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Draft</span>
                  <span className="mode-button-subtitle">Draft against bots</span>
                </div>
              </button>
              <button className="mode-button art-unit" onClick={() => router.push('/formats')}>
                <div
                  className="mode-button-art"
                  style={{ backgroundImage: `url("https://cdn.starwarsunlimited.com//card_0302467_EN_Jar_Jar_Binks_0e94fbc644.png")` }}
                />
                <div className="mode-button-content">
                  <span className="mode-button-title">Other</span>
                  <span className="mode-button-subtitle">Chaos, Pack Wars, and more</span>
                </div>
              </button>
            </div>
          </div>
          <div className="mode-section">
            <h3 className="mode-section-header">Live Pod</h3>
            <div className="mode-column">
              <button className="mode-button art-event" onClick={() => router.push('/sealed/pod')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.sealedLive}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Sealed</span>
                  <span className="mode-button-subtitle">Play with friends</span>
                  {sealedPodsOpen > 0 && (
                    <span className="pods-open-badge">{sealedPodsOpen} pod{sealedPodsOpen !== 1 ? 's' : ''} open</span>
                  )}
                </div>
              </button>
              <button className="mode-button art-event" onClick={() => router.push('/draft')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.draftLive}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Draft</span>
                  <span className="mode-button-subtitle">8-player booster draft</span>
                  {draftPodsOpen > 0 && (
                    <span className="pods-open-badge">{draftPodsOpen} pod{draftPodsOpen !== 1 ? 's' : ''} open</span>
                  )}
                </div>
              </button>
              <button className="mode-button art-event" onClick={() => router.push('/formats')}>
                <div
                  className="mode-button-art"
                  style={{ backgroundImage: `url("https://cdn.starwarsunlimited.com//card_0302467_EN_Jar_Jar_Binks_0e94fbc644.png")` }}
                />
                <div className="mode-button-content">
                  <span className="mode-button-title">Other</span>
                  <span className="mode-button-subtitle">Chaos, Pack Wars, and more</span>
                </div>
              </button>
            </div>
          </div>
        </div>
        {playerCount > 0 && (
          <div className="players-online-landing">
            <span className="online-dot-landing" />
            <span>{playerCount} player{playerCount !== 1 ? 's' : ''} online</span>
          </div>
        )}
      </div>
      <div className="landing-disclaimer">
        <div className="landing-footer-links">
          <a href="/stats" onClick={(e) => { e.preventDefault(); router.push('/stats') }}>Stats</a>
          <span className="footer-separator">·</span>
          <a href="/qa" onClick={(e) => { e.preventDefault(); router.push('/qa') }}>QA</a>
          <span className="footer-separator">·</span>
          <a href="/api" onClick={(e) => { e.preventDefault(); router.push('/api') }}>API</a>
          <span className="footer-separator">·</span>
          <a href="https://github.com/ledwards/swupod" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="footer-separator">·</span>
          <a href="https://patreon.com/ProtectthePod" target="_blank" rel="noopener noreferrer">Patreon</a>
          <span className="footer-separator">·</span>
          <a href="https://swag.protectthepod.com" target="_blank" rel="noopener noreferrer">Swag</a>
          <span className="footer-separator">·</span>
          <a href="/support-the-pod" onClick={(e) => { e.preventDefault(); router.push('/support-the-pod') }}>Support the Pod</a>
          <span className="footer-separator">·</span>
          <a href="/terms-of-service" onClick={(e) => { e.preventDefault(); router.push('/terms-of-service') }}>Terms</a>
          <span className="footer-separator">·</span>
          <a href="/privacy-policy" onClick={(e) => { e.preventDefault(); router.push('/privacy-policy') }}>Privacy</a>
        </div>
        <p>Protect the Pod is in no way affiliated with Disney or Fantasy Flight Games. Star Wars characters, cards, logos, and art are property of Disney and/or Fantasy Flight Games.</p>
      </div>
    </div>
  )
}

export default LandingPage
