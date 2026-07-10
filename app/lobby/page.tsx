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
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { usePresence } from '@/src/hooks/usePresence'
import { useOpenGamesSocket, type OpenGameListing } from '@/src/hooks/useOpenGamesSocket'
import { usePublicPodsSocket } from '@/src/hooks/usePublicPodsSocket'
import { useKarabastLobbies, type KarabastLobby } from '@/src/hooks/useKarabastLobbies'
import LobbyVerbs from '@/src/components/Lobby/LobbyVerbs'
import LobbyBoard from '@/src/components/Lobby/LobbyBoard'
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
  const router = useRouter()
  // AuthContext is untyped JSX; the user object is snake_case (documented trap).
  const { user } = useAuth() as { user: { id: string; username?: string } | null }
  const onlineCount = usePresence(user?.id)
  const board = useOpenGamesSocket()
  const pods = usePublicPodsSocket()
  const karabast = useKarabastLobbies()
  const [formatsOpen, setFormatsOpen] = useState(false)

  // R26: anonymous action clicks round-trip through Discord OAuth and land
  // back in the lobby. The destination re-validates state on return.
  const requireLogin = useCallback((): boolean => {
    if (user) return true
    window.location.href = `/api/auth/signin/discord?return_to=${encodeURIComponent('/lobby')}`
    return false
  }, [user])

  // U5 wires these to the deck-picker modals; the page is dark until then.
  const handlePlayNow = useCallback(() => {
    if (!requireLogin()) return
    router.push('/lobby#play-now')
  }, [requireLogin, router])

  const handleNewGame = useCallback(() => {
    if (!requireLogin()) return
    router.push('/lobby#new-game')
  }, [requireLogin, router])

  const handleJoin = useCallback(
    (listing: OpenGameListing) => {
      if (!requireLogin()) return
      router.push(`/g/${listing.shareId}`)
    },
    [requireLogin, router]
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
