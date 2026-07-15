'use client'

/**
 * Open-game match page body (U5): one surface for the whole lifecycle.
 *  - open + visitor  → join with a filtered deck picker (private links, R32)
 *  - open + poster   → waiting state, cancel, share link, pre-created lobby
 *  - matched + seat  → Companion hero (capability-gated), lobby_link display
 *                      for Companion-less seats (R37), manual fallback (R25),
 *                      either-player cancel (R20)
 *  - complete / terminal → result + back to lobby
 * Your own cancel routes straight back to /lobby (no terminal screen); the
 * other player learns via their socket toast (OpenGameEventToasts).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { io as socketIO, type Socket } from 'socket.io-client'
import { useRouter } from 'next/navigation'
import Button from '@/src/components/Button'
import PluginCTA from '@/src/components/PluginCTA'
import JoinGameModal from '@/src/components/Lobby/JoinGameModal'
import MatchDeckPane from '@/src/components/Lobby/MatchDeckPane'
import DeckPicker, { type EligibleDeck } from '@/src/components/Lobby/DeckPicker'
import Modal from '@/src/components/Modal'
import { useToast } from '@/src/components/Toast'
import { useAuth } from '@/src/contexts/AuthContext'
import { useCompanionCapability } from '@/src/hooks/useCompanionCapability'
import { useWayfinderCasualLaunch } from '@/src/hooks/useWayfinderCasualLaunch'
import '@/src/components/Lobby/Lobby.css'
// For .match-card-live-open — the ONE anchor-as-button treatment for a created
// Karabast lobby link (Swiss Practice's MatchCard renders the same affordance).
import { LiveLobbyLink } from '@/src/components/MatchCard'

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
  bestOf: number
  result: string | null
  players: Array<MatchPlayer | null>
  yourPoolShareId: string | null
  yourSeat: number | null
  lobbyUrl: string | null
  player2External: boolean
}

// Terminal copy is LOBBY-language: these states end the lobby, not a game.
const TERMINAL_COPY: Record<string, string> = {
  cancelled: 'This lobby was cancelled.',
  expired: 'This lobby expired.',
  delisted: 'This lobby was delisted.',
  abandoned: 'This lobby closed without a result.',
}

// The site's copy-link affordance (same pattern as PlayInstructions'
// step-copy-button / MatchCard's CopyLobbyLink): copy with a 2s "Copied!"
// state, falling back to opening the link if the clipboard is blocked.
function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.open(url, '_blank', 'noopener')
    }
  }
  return (
    <button type="button" className="lobby-copy-button" onClick={copy}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      {copied ? 'Copied!' : label}
    </button>
  )
}

function CopyDeckLink({ poolShareId }: { poolShareId: string }) {
  // Rendered client-side only (the match page is fully client), so
  // window is safe here.
  return <CopyLink url={`${typeof window !== 'undefined' ? window.location.origin : ''}/pool/${poolShareId}/deck`} label="Copy deck link" />
}

export default function OpenGameMatch({ shareId }: { shareId: string }): React.JSX.Element {
  const router = useRouter()
  const { user } = useAuth() as { user: { id: string } | null }
  const { detected, casualCapable } = useCompanionCapability()
  const { showToast } = useToast()
  const [game, setGame] = useState<MatchGame | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [changeDeckOpen, setChangeDeckOpen] = useState(false)
  const [changeDeckBusy, setChangeDeckBusy] = useState(false)

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

  // Realtime: the server pushes open-game events to each seat's user room —
  // refetch immediately when they're about THIS lobby (someone joined,
  // cancelled, lobby ready, result in) instead of waiting out the poll.
  useEffect(() => {
    let socket: Socket | null = null
    try {
      socket = socketIO({ transports: ['websocket', 'polling'] })
      socket.on('connect', () => {
        socket?.emit('presence:join')
      })
      socket.on('open-game:event', (event: { shareId?: string }) => {
        if (event?.shareId === shareId) fetchGame()
      })
    } catch {
      // The poll covers socket unavailability.
    }
    return () => {
      socket?.disconnect()
    }
  }, [shareId, fetchGame])

  // A lobby that closed without a result has NO page: anyone landing on (or
  // sitting in) one is sent back to the lobby with a toast that stays until
  // dismissed. Only 'complete' (a real result) keeps a screen.
  const kickedRef = useRef(false)
  useEffect(() => {
    const status = game?.status ?? null
    if (!game || status === null || kickedRef.current) return
    if (!['cancelled', 'expired', 'delisted', 'abandoned'].includes(status)) return
    kickedRef.current = true
    // The global event toast suppresses itself on this page, so this is the
    // only notice the viewer gets — seat-aware copy for a cancel.
    const text =
      status === 'cancelled' && game.yourSeat != null
        ? 'Your opponent cancelled the lobby.'
        : TERMINAL_COPY[status] || 'This lobby closed.'
    showToast({ text, kind: 'danger', durationMs: 0 })
    router.push('/lobby')
  }, [game, router, showToast])

  async function changeDeck(deck: EligibleDeck): Promise<void> {
    if (!game || changeDeckBusy) return
    setChangeDeckBusy(true)
    try {
      const res = await fetch(`/api/open-games/${game.shareId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolShareId: deck.poolShareId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message || 'Could not change the deck')
      setChangeDeckOpen(false)
      fetchGame()
    } catch (error) {
      showToast({ text: error instanceof Error ? error.message : 'Could not change the deck', kind: 'danger' })
    } finally {
      setChangeDeckBusy(false)
    }
  }

  const launcher = useWayfinderCasualLaunch({
    openGameShareId: shareId,
    poolShareId: game?.yourPoolShareId ?? null,
    companionCapable: casualCapable,
  })

  const cancelGame = useCallback(async () => {
    const res = await fetch(`/api/open-games/${shareId}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) {
      // Your own cancel: straight back to the lobby — no terminal screen, no
      // toast. (The other player gets theirs via OpenGameEventToasts.)
      router.push('/lobby')
    } else {
      showToast({ text: 'Could not cancel this lobby — try again.', kind: 'danger' })
    }
  }, [shareId, router, showToast])

  if (loadError) {
    return (
      <div className="lobby-match">
        <div className="lobby-state lobby-state-error">
          Couldn&apos;t load this lobby.{' '}
          <Button variant="secondary" size="sm" onClick={fetchGame}>Retry</Button>
        </div>
      </div>
    )
  }
  if (!game) {
    return <div className="lobby-match"><div className="lobby-state">Loading…</div></div>
  }

  const isSeat = game.yourSeat != null
  const isHost = game.yourSeat === 1
  const isLive = ['open', 'accepted', 'lobby_ready', 'in_progress'].includes(game.status)
  const formatLabel = game.format === 'draft' ? 'Draft' : 'Sealed'
  const host = game.players[0]

  // Bo1/Bo3 (host only, while the lobby is open) — optimistic, server-confirmed.
  async function setBestOf(n: 1 | 3): Promise<void> {
    if (!game || game.bestOf === n) return
    const previous = game.bestOf
    setGame({ ...game, bestOf: n })
    try {
      const res = await fetch(`/api/open-games/${game.shareId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bestOf: n }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setGame(current => (current ? { ...current, bestOf: previous } : current))
      showToast({ text: 'Could not update the match length', kind: 'danger' })
    }
  }

  // ---- open listing, viewed by a potential joiner (private link path, R32)
  if (game.status === 'open' && !isSeat) {
    return (
      <div className="lobby-match">
        <h2>{host?.username || 'A player'} is looking for a game</h2>
        <p className="lobby-row-meta">{game.setCode} · {formatLabel} · Best of {game.bestOf}</p>
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

  // ---- terminal states: only a real result gets a screen; anything that
  // closed without one is redirected by the kick effect above.
  if (!isLive) {
    if (game.status !== 'complete') {
      return <div className="lobby-match"><div className="lobby-state">Loading…</div></div>
    }
    return (
      <div className="lobby-match">
        <h2>
          {game.result === 'draw'
            ? 'Draw'
            : `${game.players[game.result === 'player1' ? 0 : 1]?.username || 'Someone'} won`}
        </h2>
        <Button variant="primary" onClick={() => router.push('/lobby')}>Back to the Lobby</Button>
      </div>
    )
  }

  const opponent = game.players.find(p => p && !p.you) ?? null
  const waitingForOpponent = game.status === 'open'
  const lobbyLink =
    game.lobbyUrl ?? (launcher.lastClaim?.action === 'lobby_link' ? launcher.lastClaim.lobbyUrl : null)
  // The joiner never creates the lobby (no race): until the host's Companion
  // reports a link, seat 2 just waits.
  const joinerWaiting = game.yourSeat === 2 && !lobbyLink
  // Once the lobby exists, every seat gets the same open-the-lobby LINK
  // (Swiss Practice's created-lobby affordance) — EXCEPT a Companion-capable
  // joiner, whose click keeps routing through the Companion so it opens the
  // lobby AND imports their deck (claim → join_lobby).
  // Hero link: capable host only (a capable joiner keeps the one-click join
  // that auto-imports their deck; plugin-less users get the link as the LAST
  // manual step, with the install CTA in the hero instead).
  const showLobbyLink = Boolean(lobbyLink) && casualCapable && game.yourSeat !== 2
  // Seated players (waiting or matched) get the Karabast-style split view:
  // match column left, a read-only view of THEIR OWN deck right (R29 — the
  // API only ever returns yourPoolShareId for your own seat).
  const showDeckPane = isSeat && game.yourPoolShareId != null

  return (
    <div className={`lobby-match${showDeckPane ? ' lobby-match--split' : ''}`}>
      <div className="lobby-match-main">
      <h2>{game.setCode} {formatLabel} — Open Lobby</h2>

      {isHost && game.status === 'open' ? (
        <div className="lobby-match-bestof" role="group" aria-label="Match length">
          {([1, 3] as const).map(n => (
            <Button
              key={n}
              variant="toggle"
              size="sm"
              glowColor="blue"
              active={game.bestOf === n}
              onClick={() => setBestOf(n)}
            >
              Best of {n}
            </Button>
          ))}
        </div>
      ) : (
        <div className="lobby-match-bestof lobby-match-bestof-static">Best of {game.bestOf}</div>
      )}

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
        {waitingForOpponent && game.visibility === 'private' && (
          <div className="lobby-match-note lobby-match-visibility">
            Private lobby — only people with the link can join.{' '}
            <CopyLink
              url={typeof window !== 'undefined' ? window.location.href : ''}
              label="Copy lobby link"
            />
          </div>
        )}
        {waitingForOpponent && game.visibility === 'public' && (
          <div className="lobby-match-note lobby-match-visibility">Listed on the board.</div>
        )}
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
        {joinerWaiting ? (
          <div className="lobby-match-note lobby-match-waiting">
            <strong>Waiting for {host?.username || 'your opponent'} to create the Karabast lobby</strong>
            <span>The link will appear here.</span>
          </div>
        ) : showLobbyLink ? (
          // The lobby exists → a green play LINK to it, exactly the affordance
          // Swiss Practice renders for its created lobby (MatchCard's
          // match-card-live-open anchor: an <a> styled as the primary button).
          // R37 (approved): DISPLAY of the Companion-captured lobby URL — never
          // a paste input. Works with or without the Companion.
          <LiveLobbyLink
            href={lobbyLink!}
            size="lg"
            label={game.yourSeat === 2 ? 'Join Game' : 'Open the lobby'}
          />
        ) : casualCapable ? (
          <>
            <Button variant="primary" size="lg" disabled={launcher.pending} onClick={() => launcher.launch('private')}>
              {game.status === 'open'
                ? 'Create Game'
                : game.yourSeat === 2
                  ? 'Join on Karabast'
                  : 'Play on Karabast'}
            </Button>
            {launcher.message && (
              <p className={`lobby-match-note${launcher.message.type === 'error' ? ' lobby-state-error' : ''}`}>
                {launcher.message.text}
              </p>
            )}
          </>
        ) : detected && !casualCapable ? (
          <p className="lobby-match-note">
            One-click lobbies need a newer Companion.
          </p>
        ) : (
          <PluginCTA variant="autodetect" />
        )}

      </div>

      {/* Manual fallback panel — mirrors PlayInstructions' manual-mode box
          (kicker + title + numbered steps). Honest about the preview status;
          the lobby link is DMed by hand, never pasted into PTP. */}
      <div className="lobby-manual-panel">
        <div className="lobby-manual-kicker">Manual</div>
        <h3 className="lobby-manual-title">Set it up yourself on Karabast</h3>
        <p className="lobby-manual-note">
          The Companion integration is in preview — if it&apos;s acting up, the manual route
          always works:
        </p>
        <div className="lobby-manual-steps">
          <div className="lobby-manual-step">
            <span className="lobby-step-number">1</span>
            <div className="lobby-manual-step-content">
              <h4>
                Copy Your Deck
                {game.yourPoolShareId && <CopyDeckLink poolShareId={game.yourPoolShareId} />}
              </h4>
              <p>Paste the deck link as your decklist on Karabast.</p>
            </div>
          </div>
          <div className="lobby-manual-step">
            <span className="lobby-step-number">2</span>
            <div className="lobby-manual-step-content">
              <h4>{game.yourSeat === 2 ? 'Join Their Lobby' : 'Create a Private Lobby'}</h4>
              {game.yourSeat === 2 ? (
                <p>Your opponent creates the lobby and DMs you the link on Discord.</p>
              ) : (
                <p>
                  On{' '}
                  <a href="https://karabast.net" target="_blank" rel="noreferrer">karabast.net</a>,
                  create a private lobby and DM the lobby link to your opponent on Discord.
                </p>
              )}
            </div>
          </div>
          <div className="lobby-manual-step">
            <span className="lobby-step-number">3</span>
            <div className="lobby-manual-step-content">
              <h4>Play</h4>
              {!casualCapable && lobbyLink ? (
                <LiveLobbyLink href={lobbyLink} label="Join Game" />
              ) : !casualCapable && game.yourSeat === 2 ? (
                <p>Waiting for {host?.username || 'your opponent'} to start the game — the link will appear here.</p>
              ) : (
                <p>Results report through the Companion.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {isSeat && (
        <Button variant="danger" onClick={cancelGame}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Cancel this lobby
        </Button>
      )}
      </div>
      {showDeckPane && (
        <MatchDeckPane
          poolShareId={game.yourPoolShareId!}
          onChangeDeck={isHost && game.status === 'open' ? () => setChangeDeckOpen(true) : undefined}
        />
      )}
      {isHost && game.status === 'open' && (
        <Modal
          className="lobby-deck-modal"
          isOpen={changeDeckOpen}
          onClose={() => setChangeDeckOpen(false)}
          title="Change Deck"
        >
          <Modal.Body>
            <DeckPicker selected={game.yourPoolShareId} onSelect={changeDeck} />
          </Modal.Body>
        </Modal>
      )}
    </div>
  )
}
