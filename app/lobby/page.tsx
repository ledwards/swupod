'use client'

/**
 * /lobby — the lobby-as-homepage, shipped as an alternate homepage first
 * (R38): LandingPage stays untouched; promotion to `/` is a separate,
 * explicitly-approved flip.
 *
 * Layout per Direction A v4 (R27-R37): slim header (no nav bar), Play Now /
 * New Game verbs, two-column live board with Karabast cross-listing,
 * "Casual Formats" rollup (the existing /formats naming), utility track.
 * Anonymous visitors get the read-only board; any action routes through
 * Discord login with return-to-lobby intent (R26).
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
import LobbyVerbs from '@/src/components/Lobby/LobbyVerbs'
import LobbyBoard from '@/src/components/Lobby/LobbyBoard'
import PostGameModal from '@/src/components/Lobby/PostGameModal'
import JoinGameModal from '@/src/components/Lobby/JoinGameModal'
import '@/src/components/Lobby/Lobby.css'

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'

const FORMAT_TILES: Array<{ label: string; href: string }> = [
  { label: 'Solo Sealed', href: '/sealed' },
  { label: 'Solo Draft', href: '/draft/solo' },
  { label: 'Chaos Sealed', href: '/formats' },
  { label: 'Pack Wars', href: '/formats' },
  { label: 'Pack Blitz', href: '/formats' },
  { label: 'Rotisserie', href: '/formats' },
]

const UTILITY_TILES: Array<{ label: string; href: string; discord?: boolean }> = [
  { label: 'My Stats', href: '/me' },
  { label: 'Global Stats', href: '/stats' },
  { label: 'History', href: '/history' },
  { label: 'Deckbuilder', href: '/deckbuilder' },
  { label: 'Join the Discord', href: DISCORD_INVITE_URL, discord: true },
]

export default function LobbyPage(): React.JSX.Element {
  // useSearchParams requires a Suspense boundary for the build-time prerender.
  return (
    <Suspense fallback={<div className="lobby-page" />}>
      <LobbyPageInner />
    </Suspense>
  )
}

function LobbyPageInner(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  // AuthContext is untyped JSX; the user object is snake_case (documented trap).
  const { user } = useAuth() as { user: { id: string; username?: string } | null }
  const onlineCount = usePresence(user?.id)
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
    <div className="lobby-page">
      <header className="lobby-header">
        <a className="lobby-wordmark" href="/">
          Protect the Pod
        </a>
        <div className="lobby-online-pill">
          <span className="lobby-presence-dot" />
          <strong>{onlineCount}</strong>
          <span>online</span>
        </div>
      </header>

      <LobbyVerbs
        onPlayNow={handlePlayNow}
        onNewGame={handleNewGame}
        openGamesCount={board.listings.length}
        podsFormingCount={pods.length}
        onlineCount={onlineCount}
        busy={playNowBusy}
      />

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

      <LobbyBoard
        board={board}
        pods={pods}
        karabast={karabast}
        onJoin={handleJoin}
        onNewGame={handleNewGame}
        onJoinKarabast={handleJoinKarabast}
      />

      <button
        type="button"
        className="lobby-rollup"
        aria-expanded={formatsOpen}
        onClick={() => setFormatsOpen(open => !open)}
      >
        <span>
          <span className="lobby-rollup-title">Casual Formats</span>
          <span className="lobby-rollup-sub">
            Alternative ways to play limited — Solo Draft · Solo Sealed · Chaos Sealed · Pack Wars ·
            Pack Blitz · Rotisserie
          </span>
        </span>
        <span className="lobby-rollup-chevron">{formatsOpen ? '▴' : '▾'}</span>
      </button>

      {formatsOpen && (
        <div className="lobby-format-tiles">
          {FORMAT_TILES.map(tile => (
            <a key={tile.label} className="lobby-tile" href={tile.href}>
              {tile.label}
            </a>
          ))}
        </div>
      )}

      <div className="lobby-utility">
        {UTILITY_TILES.map(tile =>
          tile.discord ? (
            <a
              key={tile.label}
              className="lobby-tile lobby-tile-discord"
              href={tile.href}
              target="_blank"
              rel="noreferrer"
            >
              {tile.label}
            </a>
          ) : (
            <a key={tile.label} className="lobby-tile" href={tile.href}>
              {tile.label}
            </a>
          )
        )}
      </div>
    </div>
  )
}
