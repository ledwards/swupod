'use client'

/**
 * /lobby — the lobby-as-homepage, shipped as an alternate homepage first
 * (R38). Direction A v3 skeleton on the homepage's own visual system:
 * `.landing-page` starfield background, `.mode-button` art buttons
 * (hyperspace variants, art visible at rest and fading out on hover under
 * the rainbow ring), glass board boxes. LandingPage itself stays untouched;
 * promotion to `/` is a separate, explicitly-approved flip.
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
import { MODE_ART } from '@/src/components/LandingPage'
import LobbyBoard from '@/src/components/Lobby/LobbyBoard'
import PostGameModal from '@/src/components/Lobby/PostGameModal'
import JoinGameModal from '@/src/components/Lobby/JoinGameModal'
import '@/src/components/LandingPage.css'
import '@/src/components/Lobby/Lobby.css'

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'

// All art is HYPERSPACE variants from the card catalog; the art-* class must
// match the card's type (unit/event/leader) for correct framing.
const VERB_ART = {
  // Millennium Falcon — Piece of Junk (SOR-455, Unit, HYP): jump in and go.
  playNow: 'https://cdn.starwarsunlimited.com//card_SWH_01_455_Millennium_Falcon_HYP_874755c830.png',
  // Spark of Rebellion (SOR-462, Event, HYP): the spark that starts it.
  newGame: 'https://cdn.starwarsunlimited.com//card_SWH_01_462_Spark_Of_Rebellion_HYP_9986103388.png',
}

interface LobbyTile {
  title: string
  sub?: string
  href: string
  art: string
  /** mode-button art framing class per the card's type. */
  artClass: 'art-unit' | 'art-event' | 'art-leader-unit'
}

// Tile row 1 (Lee's third design pass): the two solo modes + Other Formats.
// No section headers — spacing alone separates the rows from the board.
const SOLO_TILES: LobbyTile[] = [
  // Same art the homepage's Solo section uses today.
  { title: 'Solo Sealed', sub: 'Build a deck from 6 or 8 packs', href: '/sealed', art: MODE_ART.draftSolo, artClass: 'art-unit' },
  { title: 'Solo Draft', sub: 'Draft against bots', href: '/draft/solo', art: MODE_ART.sealedSolo, artClass: 'art-event' },
  // Han Solo (SOR-283 HYP) — UNIT side, as on the homepage's Other card.
  { title: 'Other Formats', sub: 'Chaos, Pack Wars, and more', href: '/formats', art: 'https://cdn.starwarsunlimited.com//card_SWH_01_283_Hansolo_Leader_Unit_HYP_6c91c1ab96.png', artClass: 'art-leader-unit' },
]

// Tile row 2: everything else, plus the Discord CTA appended in JSX.
const OTHER_TILES: LobbyTile[] = [
  // R2-D2 (TWI, Unit, HYP) — existing homepage art.
  { title: 'My Stats', sub: 'Your performance and history', href: '/me', art: MODE_ART.myStats, artClass: 'art-unit' },
  // AT-ST (SOR-493, Unit, HYP) — existing homepage art.
  { title: 'Meta Stats', sub: 'What the field is playing', href: '/stats', art: MODE_ART.stats, artClass: 'art-unit' },
  // Darth Revan's Lightsabers — the homepage's History art.
  { title: 'History', sub: 'Your past pools and decks', href: '/history', art: MODE_ART.history, artClass: 'art-unit' },
  // Constructed Lightsaber (LOF-525, Upgrade, HYP) — build your weapon.
  { title: 'Deckbuilder', sub: 'Infinite copies of every card', href: '/deckbuilder', art: 'https://cdn.starwarsunlimited.com//card_05020525_EN_Constructed_Lightsaber_4cc328aeec.png', artClass: 'art-unit' },
]

// Discord CTA label memory: once you've clicked through (or you're already a
// member of the server) the pitch flips from "Join" to "Chat".
const DISCORD_CTA_CLICKED_KEY = 'ptp-discord-cta-clicked'

// The Discord mark, used twice on the tile: inline at title size, and blown
// up as the tile's "card art" in the same slot its neighbors put card art.
const DISCORD_MARK_PATH =
  'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'

export default function LobbyPage(): React.JSX.Element {
  // useSearchParams requires a Suspense boundary for the build-time prerender.
  return (
    <Suspense fallback={<div className="landing-page lobby-shell" />}>
      <LobbyPageInner />
    </Suspense>
  )
}

function LobbyPageInner(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  // AuthContext is untyped JSX; the user object is snake_case (documented trap).
  const { user, loading: authLoading } = useAuth() as { user: { id: string; username?: string } | null; loading: boolean }
  const presence = usePresence(user?.id)
  const board = useOpenGamesSocket()
  const pods = usePublicPodsSocket()
  const karabast = useKarabastLobbies()
  const { casualCapable } = useCompanionCapability()
  const { showToast } = useToast()
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [joinTarget, setJoinTarget] = useState<OpenGameListing | null>(null)
  const [playNowBusy, setPlayNowBusy] = useState(false)
  // R35: play-page CTA arrives as /lobby?pool=<shareId>#new-game
  const preselectPool = searchParams.get('pool')

  // Discord CTA label: "Chat on Discord" once the user has clicked through
  // before (localStorage) or is already in the server — the same
  // /api/auth/discord-member check the homepage uses for its discord-cta.
  const [discordCtaClicked, setDiscordCtaClicked] = useState(false)
  const [isDiscordMember, setIsDiscordMember] = useState(false)
  useEffect(() => {
    try {
      setDiscordCtaClicked(localStorage.getItem(DISCORD_CTA_CLICKED_KEY) === '1')
    } catch { /* localStorage disabled */ }
  }, [])
  useEffect(() => {
    if (!user) {
      setIsDiscordMember(false)
      return
    }
    let stale = false
    fetch('/api/auth/discord-member', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!stale && data) setIsDiscordMember(data.data?.isMember || false)
      })
      .catch(() => { /* check is best-effort; keep the Join pitch */ })
    return () => {
      stale = true
    }
  }, [user])
  const discordCtaLabel = discordCtaClicked || isDiscordMember ? 'Chat on Discord' : 'Join the Discord'
  const handleDiscordCtaClick = useCallback(() => {
    try {
      localStorage.setItem(DISCORD_CTA_CLICKED_KEY, '1')
    } catch { /* localStorage disabled */ }
    setDiscordCtaClicked(true)
  }, [])

  // R26: anonymous action clicks round-trip through Discord OAuth and land
  // back in the lobby. The destination re-validates state on return.
  const requireLogin = useCallback((intent?: string): boolean => {
    if (user) return true
    // Auth still resolving: swallow the click instead of misreading a
    // logged-in user as anonymous and bouncing them through OAuth.
    if (authLoading) return false
    const returnTo = intent ? `/lobby${intent}` : '/lobby'
    window.location.href = `/api/auth/signin/discord?return_to=${encodeURIComponent(returnTo)}`
    return false
  }, [user, authLoading])

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
          text: 'You need a deck first.',
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
            ? `You're on the board with ${deck.name || deck.setCode}.`
            : 'Still on the board.',
          kind: 'success',
          href: `/g/${game.shareId}`,
          actionLabel: 'View lobby',
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

  // Leave your own listing: DELETE it and let the socket broadcast clear the
  // row for everyone (including this board). No success toast — the row
  // disappearing is the feedback.
  const handleLeave = useCallback(
    async (listing: OpenGameListing) => {
      try {
        const res = await fetch(`/api/open-games/${listing.shareId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) throw new Error(String(res.status))
      } catch {
        showToast({ text: 'Could not remove your lobby — try again.', kind: 'danger' })
      }
    },
    [showToast]
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
    <div className="landing-page lobby-shell">
      <div className="lobby-page">
        <header className="lobby-header">
          <a className="lobby-brand" href="/" aria-label="Protect the Pod home">
            <img className="lobby-header-logo" src="/ptp_logo400.png" alt="" />
            <span className="lobby-brand-text">
              <span className="lobby-brand-name">PROTECT THE POD</span>
              <span className="lobby-brand-sub">The Star Wars Unlimited Limited Simulator</span>
            </span>
          </a>
        </header>

        <div className="lobby-verbs">
          <div className="lobby-live-strip">
            <span className="lobby-online-pill">
              <span className="lobby-online-dot" />
              <span>
                {presence.count} player{presence.count !== 1 ? 's' : ''} online
              </span>
            </span>
            {/* A bare total next to "0 open lobbies" reads as a room full of
                people refusing to play with you. The split says what they're
                actually doing, so the zero below is a gap you can fill rather
                than a rejection. */}
            {presence.count > 0 && (
              <span className="lobby-presence-breakdown">
                {presence.drafting > 0 && <><strong>{presence.drafting}</strong> drafting · </>}
                {presence.building > 0 && <><strong>{presence.building}</strong> building · </>}
                <strong>{presence.browsing}</strong> browsing
              </span>
            )}
            <span>
              <strong>{board.listings.length}</strong> open {board.listings.length === 1 ? 'lobby' : 'lobbies'} ·{' '}
              <strong>{pods.length}</strong> {pods.length === 1 ? 'pod' : 'pods'} forming
              {board.gamesToday > 0 && (
                <> · <strong>{board.gamesToday}</strong> {board.gamesToday === 1 ? 'game' : 'games'} today</>
              )}
            </span>
          </div>
          <button
            className="mode-button art-unit lobby-verb"
            disabled={playNowBusy || authLoading}
            onClick={handlePlayNow}
          >
            <span className="lobby-art" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="lobby-art-img art-unit" src={VERB_ART.playNow} alt="" />
            </span>
            <div className="mode-button-content">
              <span className="mode-button-title">Play Now</span>
              <span className="mode-button-subtitle">Jump into the next open game</span>
            </div>
          </button>
          <button
            className="mode-button art-event lobby-verb"
            disabled={playNowBusy || authLoading}
            onClick={handleNewGame}
          >
            <span className="lobby-art" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="lobby-art-img art-event" src={VERB_ART.newGame} alt="" />
            </span>
            <div className="mode-button-content">
              <span className="mode-button-title">New Lobby</span>
              <span className="mode-button-subtitle">Create a lobby</span>
            </div>
          </button>
        </div>

        <LobbyBoard
          board={board}
          pods={pods}
          karabast={karabast}
          currentUsername={user?.username ?? null}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onNewGame={handleNewGame}
          onJoinKarabast={handleJoinKarabast}
        />

        <div className="lobby-tile-row lobby-tile-row-solo">
          {SOLO_TILES.map(tile => (
            <button
              key={tile.title}
              className={`mode-button ${tile.artClass} lobby-mode-tile`}
              onClick={() => router.push(tile.href)}
            >
              <span className="lobby-art" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={`lobby-art-img ${tile.artClass}`} src={tile.art} alt="" />
              </span>
              <div className="mode-button-content">
                <span className="mode-button-title">{tile.title}</span>
                {tile.sub && <span className="mode-button-subtitle">{tile.sub}</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="lobby-tile-row lobby-tile-row-other">
          {OTHER_TILES.map(tile => (
            <button
              key={tile.title}
              className={`mode-button ${tile.artClass} lobby-mode-tile`}
              onClick={() => router.push(tile.href)}
            >
              <span className="lobby-art" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={`lobby-art-img ${tile.artClass}`} src={tile.art} alt="" />
              </span>
              <div className="mode-button-content">
                <span className="mode-button-title">{tile.title}</span>
                {tile.sub && <span className="mode-button-subtitle">{tile.sub}</span>}
              </div>
            </button>
          ))}
          {/* Same tile DNA as its neighbors (mode-button shell, title +
              subtitle stack, mark-as-card-art on hover) — Discord identity
              lives in the blurple ring and glow, not a solid blue block. */}
          <a
            className="mode-button lobby-mode-tile lobby-discord-tile"
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleDiscordCtaClick}
          >
            <span className="lobby-art" aria-hidden>
              <svg className="lobby-discord-art" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d={DISCORD_MARK_PATH} fill="currentColor" />
              </svg>
            </span>
            <div className="mode-button-content">
              <span className="mode-button-title">
                <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d={DISCORD_MARK_PATH} fill="currentColor" />
                </svg>
                {discordCtaLabel}
              </span>
              <span className="mode-button-subtitle">Talk decks and find games</span>
            </div>
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
                // Sealed pack count is part of the format (hard split).
                packsPerPlayer: joinTarget.packsPerPlayer ?? null,
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
    </div>
  )
}
