// @ts-nocheck
'use client'

import { useEffect, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import { usePresence } from '../hooks/usePresence'
import { usePublicPodsSocket } from '../hooks/usePublicPodsSocket'
import { formatPoolLabel } from '../utils/poolDisplayName'
import ReleaseNotes from './LegacyReleaseNotes'
import HomepagePromoBanner from './HomepagePromoBanner'
import SiteFooter from './SiteFooter'
import NativePlayEntry from './Lobby/NativePlayEntry'
import './Lobby/Lobby.css'
import Button from './Button'
import './LandingPage.css'

// Card art for mode buttons (hover reveal)
export const MODE_ART = {
  sealedSolo: 'https://cdn.starwarsunlimited.com//card_SWH_01_465_Cunning_HYP_9c76fc00ac.png',
  draftSolo: 'https://cdn.starwarsunlimited.com//card_07020301_EN_Han_Solo_5c873340ad.png',
  sealedLive: 'https://cdn.starwarsunlimited.com//card_04020336_EN_Close_the_Shield_Gate_54e600004d.png',
  draftLive: 'https://cdn.starwarsunlimited.com//card_07020493_EN_The_Master_Codebreaker_fb7127ab41.png',
  history: 'https://cdn.starwarsunlimited.com//card_05020502_EN_Darth_Revan_s_Lightsabers_d4bd32215b.png',
  deckbuilder: 'https://cdn.starwarsunlimited.com//card_04030998_EN_Grand_Admiral_Thrawn_Leader_Unit_eba4967d61.png',
  stats: 'https://cdn.starwarsunlimited.com//card_SWH_01_493_AT_ST_HYP_ff73b562a5.png',
  // My Stats tile: R2-D2 (TWI) hyperspace art, non-foil.
  myStats: 'https://cdn.starwarsunlimited.com//card_0302458_EN_R2_D2_a755624266.png',
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
  const presence = usePresence(user?.id)
  const playerCount = presence.count
  // One instance each, shared with the board below: these hooks each open
  // their own socket, so calling them twice on one page would double up.
  const publicPods = usePublicPodsSocket()
  const [activeDraft, setActiveDraft] = useState<ActiveDraft | null>(null)
  const [activeSealedPod, setActiveSealedPod] = useState<ActiveSealedPod | null>(null)
  const [isDiscordMember, setIsDiscordMember] = useState(true)

  // "NEW" tag + golden glow on the My Stats tile until the user first opens /me.
  // Defaults to seen (no flash) and reads the real flag after mount.
  const [meStatsSeen, setMeStatsSeen] = useState(true)
  useEffect(() => {
    try { setMeStatsSeen(localStorage.getItem('ptp:me-visited') === '1') } catch {}
  }, [])
  const openMyStats = () => {
    try { localStorage.setItem('ptp:me-visited', '1') } catch {}
    setMeStatsSeen(true)
    router.push('/me')
  }

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

  const hasActiveDraft = Boolean(activeDraft || activeSealedPod)

  return (
    <div className="landing-page">
      <HomepagePromoBanner hasActiveDraft={hasActiveDraft} />
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
          <button className="discord-cta discord-cta--signin" onClick={signIn}>
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
        {playerCount > 0 && (
          <div className="players-online-landing">
            <span className="online-dot-landing" />
            {/* A bare total reads as a room full of people refusing to play with
                you. The breakdown says what they're actually doing, and a zero is
                never a line item — an omission reads as a gap you can fill. */}
            <span className="landing-live-line">
              <strong>{playerCount}</strong> online
              {[

                publicPods.length > 0 && <><strong>{publicPods.length}</strong> {publicPods.length === 1 ? 'pod' : 'pods'} forming</>,
                presence.drafting > 0 && <><strong>{presence.drafting}</strong> drafting</>,
                presence.building > 0 && <><strong>{presence.building}</strong> building</>,
                presence.browsing > 0 && <><strong>{presence.browsing}</strong> solo play</>,
              ].filter(Boolean).map((bit, i) => (
                <Fragment key={i}> · {bit}</Fragment>
              ))}
            </span>
          </div>
        )}
        {activeDraft && (
          <div className="active-draft-banner">
            <span>Live Pod: {activeDraft.draftName || formatPoolLabel(activeDraft.setName ?? activeDraft.setCode, 'draft')}{activeDraft.createdAt ? ` ${new Date(activeDraft.createdAt).toLocaleDateString()}` : ''}</span>
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
        {/* Above the mode buttons: what's actually happening comes before the
            menu of things you could start. Carries .mode-sections-row's own
            max-width so its edges line up with the buttons below it. */}
        <section className="landing-board" aria-label="Open games">
          <h3 className="mode-section-header">Play Now!</h3>
          <NativePlayEntry pods={publicPods} />
        </section>
        <div className="mode-sections-row">
          <div className="mode-section">
            <h3 className="mode-section-header">Solo</h3>
            <div className="mode-column">
              <button className="mode-button art-unit" onClick={() => router.push('/sealed')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.draftSolo}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Sealed</span>
                  <span className="mode-button-subtitle">Build a deck from 6 or 8 packs</span>
                </div>
              </button>
              <button className="mode-button art-event" onClick={() => router.push('/draft/solo')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.sealedSolo}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Draft</span>
                  <span className="mode-button-subtitle">Draft against bots</span>
                </div>
              </button>
              <button className="mode-button art-leader-unit" onClick={() => router.push('/formats')}>
                <div
                  className="mode-button-art"
                  style={{ backgroundImage: `url("https://cdn.starwarsunlimited.com//card_SWH_01_283_Hansolo_Leader_Unit_HYP_6c91c1ab96.png")` }}
                />
                <div className="mode-button-content">
                  <span className="mode-button-title">Other</span>
                  <span className="mode-button-subtitle">Chaos, Pack Wars, and more</span>
                </div>
              </button>
            </div>
          </div>
          <div className="mode-section">
            <h3 className="mode-section-header">With Friends</h3>
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
              <button className="mode-button art-unit" onClick={() => router.push('/draft')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.draftLive}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Draft</span>
                  <span className="mode-button-subtitle">8-player booster draft</span>
                  {draftPodsOpen > 0 && (
                    <span className="pods-open-badge">{draftPodsOpen} pod{draftPodsOpen !== 1 ? 's' : ''} open</span>
                  )}
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
            <h3 className="mode-section-header">Deckbuilder</h3>
            <div className="mode-column">
              <button className="mode-button art-unit mode-button-deckbuilder" onClick={() => router.push('/deckbuilder')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.deckbuilder}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Limited</span>
                  <span className="mode-button-subtitle">Infinite copies of every card in a set</span>
                </div>
              </button>
              {user && (
                <button className="mode-button art-unit" onClick={() => router.push('/history')}>
                  <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.history}")` }} />
                  <div className="mode-button-content">
                    <span className="mode-button-title">History</span>
                    <span className="mode-button-subtitle">Your past pools and decks</span>
                  </div>
                </button>
              )}
              <button className={`mode-button art-unit${!meStatsSeen ? ' mode-button--new' : ''}`} onClick={openMyStats}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.myStats}")` }} />
                {!meStatsSeen && <span className="mode-button-new-badge">NEW</span>}
                <div className="mode-button-content">
                  <span className="mode-button-title">My Stats</span>
                  <span className="mode-button-subtitle">Your performance and history</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}

export default LandingPage
