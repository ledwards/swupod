'use client'

/**
 * /lobby — the lobby-as-homepage, shipped as an alternate homepage first
 * (R38). Composes the EXISTING homepage system: landing logo + subtitle
 * hero, players-online badge, `.history-item` listing rows, `.mode-button`
 * tiles with card art, and `.discord-cta` — per DESIGN.md and the style
 * guide. LandingPage itself stays untouched; promotion to `/` is a
 * separate, explicitly-approved flip.
 */
import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { usePresence } from '@/src/hooks/usePresence'
import { useOpenGamesSocket, type OpenGameListing } from '@/src/hooks/useOpenGamesSocket'
import { usePublicPodsSocket } from '@/src/hooks/usePublicPodsSocket'
import { useKarabastLobbies, type KarabastLobby } from '@/src/hooks/useKarabastLobbies'
import { useCompanionCapability } from '@/src/hooks/useCompanionCapability'
import { buildWayfinderCasualCreatePayload } from '@/src/hooks/useWayfinderCasualLaunch'
import { useToast } from '@/src/components/Toast'
import Button from '@/src/components/Button'
import { MODE_ART } from '@/src/components/LandingPage'
import LobbyBoard from '@/src/components/Lobby/LobbyBoard'
import PostGameModal from '@/src/components/Lobby/PostGameModal'
import JoinGameModal from '@/src/components/Lobby/JoinGameModal'
import '@/src/components/LandingPage.css'
import '@/app/draft/draft.css'
import '@/src/components/Lobby/Lobby.css'

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'

const CASUAL_FORMAT_TILES: Array<{ title: string; subtitle: string; href: string; art: string }> = [
  { title: 'Solo Sealed', subtitle: 'Build a deck from 6 packs', href: '/sealed', art: MODE_ART.draftSolo },
  { title: 'Solo Draft', subtitle: 'Draft against bots', href: '/draft/solo', art: MODE_ART.sealedSolo },
  { title: 'Other', subtitle: 'Chaos, Pack Wars, and more', href: '/formats', art: 'https://cdn.starwarsunlimited.com//card_SWH_01_283_Hansolo_Leader_Unit_HYP_6c91c1ab96.png' },
]

export default function LobbyPage(): React.JSX.Element {
  // useSearchParams requires a Suspense boundary for the build-time prerender.
  return (
    <Suspense fallback={<div className="landing-page" />}>
      <LobbyPageInner />
    </Suspense>
  )
}

function LobbyPageInner(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  // AuthContext is untyped JSX; the user object is snake_case (documented trap).
  const { user } = useAuth() as { user: { id: string; username?: string } | null }
  const playerCount = usePresence(user?.id)
  const board = useOpenGamesSocket()
  const pods = usePublicPodsSocket()
  const karabast = useKarabastLobbies()
  const { casualCapable } = useCompanionCapability()
  const { showToast } = useToast()
  const [formatsOpen, setFormatsOpen] = useState(false)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [joinTarget, setJoinTarget] = useState<OpenGameListing | null>(null)
  const [playNowBusy, setPlayNowBusy] = useState(false)
  // R35: play-page CTA arrives as /lobby?pool=<shareId>#new-game
  const preselectPool = searchParams.get('pool')

  // R26: anonymous action clicks round-trip through Discord OAuth and land
  // back in the lobby. The destination re-validates state on return.
  const requireLogin = useCallback((intent?: string): boolean => {
    if (user) return true
    const returnTo = intent ? `/lobby${intent}` : '/lobby'
    window.location.href = `/api/auth/signin/discord?return_to=${encodeURIComponent(returnTo)}`
    return false
  }, [user])

  // Hash-anchor deep links (house rule: hash, not ?tab=): #new-game opens the
  // modal, including the post-OAuth return trip.
  useEffect(() => {
    if (user && window.location.hash === '#new-game') {
      setNewGameOpen(true)
    }
  }, [user])

  const handleNewGame = useCallback(() => {
    if (!requireLogin('#new-game')) return
    setNewGameOpen(true)
  }, [requireLogin])

  // Play Now (R8/AE1/AE2): one click with the most recent eligible deck —
  // the server accepts the oldest compatible listing or posts/keeps a seek.
  const handlePlayNow = useCallback(async () => {
    if (!requireLogin('#play-now')) return
    if (playNowBusy) return
    setPlayNowBusy(true)
    try {
      const decksRes = await fetch('/api/open-games/eligible-decks', { credentials: 'include' })
      const decksJson = await decksRes.json().catch(() => null)
      const decks = (decksJson?.data || decksJson)?.decks || []
      const deck = decks[0]
      if (!deck) {
        // R22: the no-deck funnel — get a deck first, then post it.
        showToast({
          text: 'You need a built deck first — run a Solo Sealed and hit Play when your deck is ready.',
          kind: 'info',
          href: '/sealed',
          actionLabel: 'Start Solo Sealed',
          durationMs: 12000,
        })
        return
      }
      const res = await fetch('/api/open-games/play-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolShareId: deck.poolShareId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message || 'Play Now failed')
      const { action, game } = json.data || json
      if (action === 'joined') {
        router.push(`/g/${game.shareId}`)
      } else {
        showToast({
          text: action === 'posted'
            ? `You're on the board with ${deck.name || deck.setCode} — we'll ping you when someone joins.`
            : 'Still on the board — waiting for an opponent.',
          kind: 'success',
          href: `/g/${game.shareId}`,
          actionLabel: 'View game',
        })
      }
    } catch (error) {
      showToast({ text: error instanceof Error ? error.message : 'Play Now failed', kind: 'danger' })
    } finally {
      setPlayNowBusy(false)
    }
  }, [requireLogin, playNowBusy, router, showToast])

  const handleJoin = useCallback(
    (listing: OpenGameListing) => {
      if (!requireLogin()) return
      setJoinTarget(listing)
    },
    [requireLogin]
  )

  // R34 create-at-post: after creating, a capable Companion pre-creates the
  // public Karabast lobby before anyone joins.
  const handleCreated = useCallback(
    async (game: { shareId: string; visibility: string }, createKarabastLobby: boolean) => {
      setNewGameOpen(false)
      if (createKarabastLobby) {
        try {
          const res = await fetch(`/api/open-games/${game.shareId}/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ companionCapable: true }),
          })
          const json = await res.json().catch(() => null)
          const claim = (json?.data || json)?.claim
          if (claim?.action === 'create_lobby') {
            window.postMessage(
              buildWayfinderCasualCreatePayload({
                openGameShareId: game.shareId,
                poolShareId: '',
                deckUrl: `${window.location.origin}/g/${game.shareId}`,
                lobbyName: claim.lobbyName || 'protectthepod.com',
                visibility: 'public',
              }),
              '*'
            )
          }
        } catch {
          // Lobby pre-creation is best-effort; the match-time handshake covers it.
        }
      }
      router.push(`/g/${game.shareId}`)
    },
    [router]
  )

  const handleJoinKarabast = useCallback((lobby: KarabastLobby) => {
    // Joining a Karabast lobby happens on Karabast; the Companion handles
    // deck load + linkback (R33/R37). Plain navigation, no gating.
    window.open('https://karabast.net/', '_blank', 'noopener')
    void lobby
  }, [])

  return (
    <div className="landing-page">
      <div className="landing-content">
        <a href="/">
          <img className="landing-logo" src="/ptp_logo400.png" alt="Protect the Pod Logo" />
        </a>
        <h1 className="visually-hidden">Protect the Pod — Lobby</h1>
        <h2 className="subtitle">
          The Star Wars Unlimited<br />
          Limited Lobby
        </h2>

        {playerCount > 0 && (
          <div className="players-online-landing">
            <span className="online-dot-landing" />
            <span>{playerCount} player{playerCount !== 1 ? 's' : ''} online</span>
          </div>
        )}

        <div className="lobby-verbs">
          <Button variant="primary" size="lg" disabled={playNowBusy} onClick={handlePlayNow}>
            Play Now
          </Button>
          <Button variant="secondary" size="lg" disabled={playNowBusy} onClick={handleNewGame}>
            New Game
          </Button>
        </div>
        <div className="lobby-live-strip">
          {board.listings.length} open {board.listings.length === 1 ? 'game' : 'games'} ·{' '}
          {pods.length} {pods.length === 1 ? 'pod' : 'pods'} forming
        </div>

        <LobbyBoard
          board={board}
          pods={pods}
          karabast={karabast}
          onJoin={handleJoin}
          onNewGame={handleNewGame}
          onJoinKarabast={handleJoinKarabast}
        />

        <div className="mode-sections-row lobby-formats-row">
          <div className="mode-section">
            <h3 className="mode-section-header">Casual Formats</h3>
            <div className="mode-column">
              {(formatsOpen ? CASUAL_FORMAT_TILES : CASUAL_FORMAT_TILES.slice(0, 1)).map(tile => (
                <button key={tile.title} className="mode-button art-unit" onClick={() => router.push(tile.href)}>
                  <div className="mode-button-art" style={{ backgroundImage: `url("${tile.art}")` }} />
                  <div className="mode-button-content">
                    <span className="mode-button-title">{tile.title}</span>
                    <span className="mode-button-subtitle">{tile.subtitle}</span>
                  </div>
                </button>
              ))}
              {!formatsOpen && (
                <Button variant="secondary" size="sm" onClick={() => setFormatsOpen(true)}>
                  More Formats
                </Button>
              )}
            </div>
          </div>

          <div className="mode-section">
            <h3 className="mode-section-header">More</h3>
            <div className="mode-column">
              <button className="mode-button art-unit" onClick={() => router.push('/deckbuilder')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.deckbuilder}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">Deckbuilder</span>
                  <span className="mode-button-subtitle">Infinite copies of every card in a set</span>
                </div>
              </button>
              <button className="mode-button art-unit" onClick={() => router.push('/history')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.history}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">History</span>
                  <span className="mode-button-subtitle">Your past pools and decks</span>
                </div>
              </button>
              <button className="mode-button art-unit" onClick={() => router.push('/me')}>
                <div className="mode-button-art" style={{ backgroundImage: `url("${MODE_ART.myStats}")` }} />
                <div className="mode-button-content">
                  <span className="mode-button-title">My Stats</span>
                  <span className="mode-button-subtitle">Your performance and history</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <a
          className="discord-cta"
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor" />
          </svg>
          Join the Discord
        </a>
      </div>

      <PostGameModal
        isOpen={newGameOpen}
        onClose={() => setNewGameOpen(false)}
        onCreated={handleCreated}
        companionCapable={casualCapable}
        initialPoolShareId={preselectPool}
      />

      <JoinGameModal
        isOpen={joinTarget != null}
        onClose={() => setJoinTarget(null)}
        game={
          joinTarget
            ? {
              shareId: joinTarget.shareId,
              setCode: joinTarget.setCode,
              format: joinTarget.format,
              hostUsername: joinTarget.host.username,
            }
            : null
        }
        onJoined={game => {
          setJoinTarget(null)
          router.push(`/g/${game.shareId}`)
        }}
      />
    </div>
  )
}
