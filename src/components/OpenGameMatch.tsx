'use client'

/**
 * Open-game match page body (U5): one surface for the whole lifecycle.
 *  - open + visitor  → join with a filtered deck picker (private links, R32)
 *  - open + poster   → waiting state, cancel, share link, pre-created lobby
 *  - matched + seat  → Companion hero (capability-gated), lobby_link display
 *                      for Companion-less seats (R37), manual fallback (R25),
 *                      either-player cancel (R20), mobile notice (R24)
 *  - complete / terminal → result + back to lobby
 */
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/src/components/Button'
import PluginCTA from '@/src/components/PluginCTA'
import JoinGameModal from '@/src/components/Lobby/JoinGameModal'
import { useToast } from '@/src/components/Toast'
import { useAuth } from '@/src/contexts/AuthContext'
import { useCompanionCapability } from '@/src/hooks/useCompanionCapability'
import { useWayfinderCasualLaunch } from '@/src/hooks/useWayfinderCasualLaunch'
import '@/src/components/Lobby/Lobby.css'

interface MatchPlayer {
  seat: number
  username: string | null
  avatarUrl: string | null
  connected: boolean
  you: boolean
}

interface MatchGame {
  shareId: string
  status: string
  visibility: string
  setCode: string
  setName: string | null
  format: string
  result: string | null
  players: Array<MatchPlayer | null>
  yourPoolShareId: string | null
  yourSeat: number | null
  player2External: boolean
}

const TERMINAL_COPY: Record<string, string> = {
  cancelled: 'This game was cancelled.',
  expired: 'This listing expired — playing manually? No problem, this just freed the lobby slot.',
  delisted: 'This listing was delisted while its poster was away.',
  abandoned: 'This game timed out without a result — playing manually? No problem, this just freed the lobby slot.',
}

export default function OpenGameMatch({ shareId }: { shareId: string }): React.JSX.Element {
  const router = useRouter()
  const { user } = useAuth() as { user: { id: string } | null }
  const { detected, casualCapable } = useCompanionCapability()
  const { showToast } = useToast()
  const [game, setGame] = useState<MatchGame | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/open-games/${shareId}`, { credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.json()
      setGame((json.data || json).game)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [shareId])

  useEffect(() => {
    fetchGame()
    const interval = setInterval(fetchGame, 10_000)
    return () => clearInterval(interval)
  }, [fetchGame])

  const launcher = useWayfinderCasualLaunch({
    openGameShareId: shareId,
    poolShareId: game?.yourPoolShareId ?? null,
    companionCapable: casualCapable,
  })

  const cancelGame = useCallback(async () => {
    const res = await fetch(`/api/open-games/${shareId}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) {
      showToast({ text: 'Game cancelled.', kind: 'info', href: '/lobby', actionLabel: 'Back to Lobby' })
      fetchGame()
    } else {
      showToast({ text: 'Could not cancel the game.', kind: 'danger' })
    }
  }, [shareId, fetchGame, showToast])

  if (loadError) {
    return (
      <div className="lobby-match">
        <div className="lobby-state lobby-state-error">
          Couldn&apos;t load this game.{' '}
          <Button variant="secondary" size="sm" onClick={fetchGame}>Retry</Button>
        </div>
      </div>
    )
  }
  if (!game) {
    return <div className="lobby-match"><div className="lobby-state">Loading…</div></div>
  }

  const isSeat = game.yourSeat != null
  const isLive = ['open', 'accepted', 'lobby_ready', 'in_progress'].includes(game.status)
  const formatLabel = game.format === 'draft' ? 'Draft' : 'Sealed'
  const host = game.players[0]

  // ---- open listing, viewed by a potential joiner (private link path, R32)
  if (game.status === 'open' && !isSeat) {
    return (
      <div className="lobby-match">
        <h2>{host?.username || 'A player'} is looking for a game</h2>
        <p className="lobby-row-meta">{game.setCode} · {formatLabel}</p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            if (!user) {
              window.location.href = `/api/auth/signin/discord?return_to=${encodeURIComponent(`/g/${shareId}`)}`
              return
            }
            setJoinOpen(true)
          }}
        >
          Join
        </Button>
        <JoinGameModal
          isOpen={joinOpen}
          onClose={() => setJoinOpen(false)}
          game={{ shareId: game.shareId, setCode: game.setCode, format: game.format, hostUsername: host?.username ?? null }}
          onJoined={() => {
            setJoinOpen(false)
            fetchGame()
          }}
        />
      </div>
    )
  }

  // ---- terminal states
  if (!isLive) {
    return (
      <div className="lobby-match">
        <h2>
          {game.status === 'complete'
            ? game.result === 'draw'
              ? 'Draw'
              : `${game.players[game.result === 'player1' ? 0 : 1]?.username || 'Someone'} won`
            : 'Game over'}
        </h2>
        {game.status !== 'complete' && (
          <p className="lobby-row-meta">{TERMINAL_COPY[game.status] || 'This game already ended.'}</p>
        )}
        <Button variant="primary" onClick={() => router.push('/lobby')}>Back to the Lobby</Button>
      </div>
    )
  }

  const opponent = game.players.find(p => p && !p.you) ?? null
  const waitingForOpponent = game.status === 'open'
  const lobbyLink = launcher.lastClaim?.action === 'lobby_link' ? launcher.lastClaim.lobbyUrl : null

  return (
    <div className="lobby-match">
      <div className="lobby-mobile-notice">
        Games play on Karabast, which needs a desktop browser — finish this match on your computer.
        Your seat here is saved.
      </div>

      <h2>{game.setCode} {formatLabel} — Open Game</h2>

      <div className="lobby-match-players">
        {game.players.filter(Boolean).map(player => (
          <div className="lobby-match-player" key={player!.seat}>
            {player!.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lobby-row-avatar" src={player!.avatarUrl} alt="" />
            ) : (
              <div className="lobby-row-avatar" />
            )}
            <div>
              <div className="lobby-row-name">
                {player!.username || 'Player'}
                {player!.you ? ' (you)' : ''}
                <span
                  className={`lobby-host-dot${player!.connected ? '' : ' lobby-host-away'}`}
                  title={player!.connected ? 'Online' : 'Stepped away'}
                />
              </div>
            </div>
          </div>
        ))}
        {waitingForOpponent && (
          <>
            <span className="lobby-match-vs">vs</span>
            <div className="lobby-match-player">
              <div className="lobby-row-avatar" />
              <div className="lobby-row-meta">Waiting for an opponent…</div>
            </div>
          </>
        )}
        {!waitingForOpponent && opponent == null && game.player2External && (
          <>
            <span className="lobby-match-vs">vs</span>
            <div className="lobby-match-player">
              <div className="lobby-row-meta">
                Karabast opponent{' '}
                <span className="lobby-warn" title="Your opponent joined from Karabast with a pool from another source — quality may be unrealistic.">⚠</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="lobby-match-hero">
        {casualCapable ? (
          <>
            <Button variant="primary" size="lg" disabled={launcher.pending} onClick={() => launcher.launch('private')}>
              {game.status === 'open' ? 'Open your Karabast lobby' : 'Play on Karabast'}
            </Button>
            {launcher.message && (
              <p className={`lobby-match-note${launcher.message.type === 'error' ? ' lobby-state-error' : ''}`}>
                {launcher.message.text}
              </p>
            )}
          </>
        ) : lobbyLink || (detected && !casualCapable) ? (
          <>
            {lobbyLink ? (
              // R37 (approved): DISPLAY of the Companion-captured lobby URL —
              // never a paste input.
              <Button variant="primary" size="lg" onClick={() => window.open(lobbyLink, '_blank', 'noopener')}>
                Open the lobby
              </Button>
            ) : (
              <p className="lobby-match-note">
                Your Companion needs an update to launch games one-click — update the extension, or
                use the manual steps below.
              </p>
            )}
          </>
        ) : (
          <>
            <PluginCTA variant="autodetect" />
            {lobbyLink && (
              <Button variant="primary" size="lg" onClick={() => window.open(lobbyLink, '_blank', 'noopener')}>
                Open the lobby
              </Button>
            )}
          </>
        )}

        {!casualCapable && !lobbyLink && isSeat && game.status !== 'open' && (
          <p className="lobby-match-note">
            <Button variant="secondary" size="sm" onClick={() => launcher.launch('private')}>
              Check for the lobby
            </Button>
          </p>
        )}
      </div>

      <p className="lobby-match-note">
        Companion acting up? Manual fallback: open your deck link, create a private lobby on{' '}
        <a href="https://karabast.net" target="_blank" rel="noreferrer">karabast.net</a> yourself, and
        DM the lobby link to your opponent on Discord. Results only auto-report through the Companion.
      </p>

      {isSeat && (
        <Button variant="danger" onClick={cancelGame}>
          {waitingForOpponent ? 'Cancel this game' : 'Cancel match'}
        </Button>
      )}
    </div>
  )
}
