'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Button from '@/src/components/Button'
import ReplayWatchLink from '@/src/components/ReplayWatchLink'
import { useAuth } from '@/src/contexts/AuthContext'
import type {
  EnterQueueResult,
  PlayLobby as PlayLobbyData,
  PlayMatchSummary,
  PlayQueueEntrySummary,
  SeatLaunchResult,
} from '@/src/services/play/playLedger'
import type { PlayDeckSummary } from '@/src/services/play/playState'

interface AuthShape {
  user: { id: string; username?: string } | null
  loading: boolean
}

interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  message: string | null
}

type BusyAction = `queue:${string}` | `cancel:${string}` | `join:${string}` | 'refresh' | null

export default function PlayLobby() {
  const { user, loading: authLoading } = useAuth() as AuthShape
  const searchParams = useSearchParams()
  const requestedPool = searchParams.get('pool')
  const [lobby, setLobby] = useState<PlayLobbyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadLobby = useCallback(async () => {
    if (!user) {
      setLobby(null)
      setLoading(false)
      return
    }

    setBusyAction((current) => current ?? 'refresh')
    try {
      const nextLobby = await apiRequest<PlayLobbyData>('/api/play/lobby')
      setLobby(nextLobby)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
      setBusyAction((current) => current === 'refresh' ? null : current)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    void loadLobby()
  }, [authLoading, loadLobby])

  const sortedDecks = useMemo(() => {
    const decks = lobby?.decks ?? []
    if (!requestedPool) return decks
    return [...decks].sort((a, b) => {
      if (a.poolShareId === requestedPool) return -1
      if (b.poolShareId === requestedPool) return 1
      return 0
    })
  }, [lobby?.decks, requestedPool])

  const activeMatches = useMemo(() => (
    (lobby?.matches ?? []).filter(match => (
      match.status === 'matched' || match.status === 'launch_ready' || match.status === 'in_progress'
    ))
  ), [lobby?.matches])

  const recentMatches = useMemo(() => (
    (lobby?.matches ?? []).filter(match => (
      match.status === 'complete' || match.status === 'failed' || match.status === 'cancelled'
    ))
  ), [lobby?.matches])

  async function queueDeck(poolShareId: string) {
    setBusyAction(`queue:${poolShareId}`)
    setMessage(null)
    try {
      const result = await apiRequest<EnterQueueResult & { lobby: PlayLobbyData }>('/api/play/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolShareId }),
      })
      setLobby(result.lobby)
      setMessage(queueActionMessage(result.action))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function cancelQueue(entryId: string) {
    setBusyAction(`cancel:${entryId}`)
    setMessage(null)
    try {
      const result = await apiRequest<{ cancelled: true; entryId: string; lobby: PlayLobbyData }>(
        `/api/play/queue/${encodeURIComponent(entryId)}`,
        { method: 'DELETE' }
      )
      setLobby(result.lobby)
      setMessage('Queue entry cancelled.')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function joinMatch(matchId: string) {
    setBusyAction(`join:${matchId}`)
    setMessage(null)
    try {
      const result = await apiRequest<SeatLaunchResult>(
        `/api/play/matches/${encodeURIComponent(matchId)}/join`,
        { method: 'POST' }
      )
      window.location.assign(result.launchUrl)
    } catch (error) {
      setMessage(errorMessage(error))
      setBusyAction(null)
    }
  }

  if (authLoading || loading) {
    return (
      <main className="ptp-play-page">
        <section className="ptp-play-shell">
          <div className="ptp-play-skeleton" />
          <div className="ptp-play-skeleton ptp-play-skeleton--short" />
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="ptp-play-page">
        <section className="ptp-play-shell">
          <header className="ptp-play-header">
            <div>
              <span className="ptp-play-eyebrow">PTP Play</span>
              <h1>Limited Queue</h1>
              <p>Sign in to queue limited decks.</p>
            </div>
            <a className="ptp-play-link-button" href="/api/auth/signin/discord?return_to=/play">
              Sign in
            </a>
          </header>
        </section>
      </main>
    )
  }

  const runtimeAvailable = lobby?.runtime.launchAllowed === true

  return (
    <main className="ptp-play-page">
      <section className="ptp-play-shell">
        <header className="ptp-play-header">
          <div>
            <span className="ptp-play-eyebrow">PTP Play</span>
            <h1>Limited Queue</h1>
            <p>Free play · Private runtime · Replay ledger</p>
          </div>
          <div className="ptp-play-header-actions">
            <Button
              type="button"
              variant="interactive"
              size="sm"
              onClick={() => void loadLobby()}
              disabled={busyAction === 'refresh'}
            >
              Refresh
            </Button>
          </div>
        </header>

        {message && (
          <div className="ptp-play-message" role="status">
            {message}
          </div>
        )}

        <RuntimeBand lobby={lobby} />

        <section className="ptp-play-panel" data-testid="ptp-play-ready-matches">
          <PanelHeader label="Ready" title="Matches" meta={`${activeMatches.length} live`} />
          {activeMatches.length > 0 ? (
            <div className="ptp-play-match-grid">
              {activeMatches.map(match => (
                <MatchCard
                  key={match.id}
                  match={match}
                  busy={busyAction === `join:${match.id}`}
                  onJoin={joinMatch}
                />
              ))}
            </div>
          ) : (
            <div className="ptp-play-empty">No live matches.</div>
          )}
        </section>

        <section className="ptp-play-panel" data-testid="ptp-play-queue">
          <PanelHeader label="Queue" title="Waiting Decks" meta={`${lobby?.queueEntries.length ?? 0} queued`} />
          {lobby && lobby.queueEntries.length > 0 ? (
            <div className="ptp-play-queue-list">
              {lobby.queueEntries.map(entry => (
                <QueueEntry
                  key={entry.id}
                  entry={entry}
                  busy={busyAction === `cancel:${entry.id}`}
                  onCancel={cancelQueue}
                />
              ))}
            </div>
          ) : (
            <div className="ptp-play-empty">No active queue entries.</div>
          )}
        </section>

        <section className="ptp-play-panel" data-testid="ptp-play-decks">
          <PanelHeader label="Decks" title="Queue A Deck" meta={`${sortedDecks.length} built`} />
          {sortedDecks.length > 0 ? (
            <div className="ptp-play-deck-list">
              {sortedDecks.map(deck => (
                <DeckRow
                  key={deck.poolShareId}
                  deck={deck}
                  runtimeAvailable={runtimeAvailable}
                  busy={busyAction === `queue:${deck.poolShareId}`}
                  onQueue={queueDeck}
                />
              ))}
            </div>
          ) : (
            <div className="ptp-play-empty">
              <a href="/deckbuilder">Build a limited deck</a>
            </div>
          )}
        </section>

        <section className="ptp-play-panel" data-testid="ptp-play-recent">
          <PanelHeader label="Replay" title="Recent Games" meta={`${recentMatches.length} done`} />
          {recentMatches.length > 0 ? (
            <div className="ptp-play-match-grid ptp-play-match-grid--history">
              {recentMatches.map(match => (
                <MatchCard key={match.id} match={match} busy={false} onJoin={joinMatch} />
              ))}
            </div>
          ) : (
            <div className="ptp-play-empty">No completed games yet.</div>
          )}
        </section>
      </section>
    </main>
  )
}

function RuntimeBand({ lobby }: { lobby: PlayLobbyData | null }) {
  const runtime = lobby?.runtime
  const label = runtime?.mode === 'local_stub'
    ? 'Local runtime stub'
    : runtime?.mode === 'forceteki'
      ? 'Forceteki runtime'
      : 'Runtime unavailable'

  return (
    <section className={`ptp-play-runtime-band${runtime?.launchAllowed ? '' : ' ptp-play-runtime-band--blocked'}`}>
      <div>
        <span>{label}</span>
        <strong>{runtime?.launchAllowed ? 'Launch enabled' : 'Launch blocked'}</strong>
      </div>
      {runtime?.reason && <p>{runtime.reason}</p>}
    </section>
  )
}

function PanelHeader({ label, title, meta }: { label: string; title: string; meta: string }) {
  return (
    <div className="ptp-play-panel-header">
      <div>
        <span className="ptp-play-section-label">{label}</span>
        <h2>{title}</h2>
      </div>
      <span className="ptp-play-panel-meta">{meta}</span>
    </div>
  )
}

function MatchCard({
  match,
  busy,
  onJoin,
}: {
  match: PlayMatchSummary
  busy: boolean
  onJoin: (matchId: string) => Promise<void>
}) {
  const opponent = match.mySeat === 'player1' ? match.player2 : match.player1
  const self = match.mySeat === 'player1' ? match.player1 : match.player2
  const isComplete = match.status === 'complete'

  return (
    <article className="ptp-play-match-card" data-status={match.status}>
      <div className="ptp-play-match-card-top">
        <span className={`ptp-play-status-chip ptp-play-status-chip--${match.status}`}>
          {statusLabel(match.status)}
        </span>
        <span className="ptp-play-match-set">{match.setCode}</span>
      </div>
      <div className="ptp-play-versus">
        <PlayerStack label="You" player={self} />
        <span className="ptp-play-vs">vs</span>
        <PlayerStack label="Opponent" player={opponent} />
      </div>
      {isComplete && (
        <div className="ptp-play-result-line">
          {resultLabel(match)}
        </div>
      )}
      <div className="ptp-play-card-actions">
        {match.launchUrl && !isComplete && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => void onJoin(match.id)}
            disabled={busy}
          >
            {busy ? 'Opening...' : match.status === 'in_progress' ? 'Resume' : 'Play'}
          </Button>
        )}
        {match.replayUrl && (
          <ReplayWatchLink href={match.replayUrl} target="_self" rel="">
            Replay
          </ReplayWatchLink>
        )}
      </div>
    </article>
  )
}

function PlayerStack({ label, player }: { label: string; player: PlayMatchSummary['player1'] }) {
  return (
    <div className="ptp-play-player-stack">
      <span>{label}</span>
      <strong>{player.username || 'Player'}</strong>
      <small>{player.deckName}</small>
      <em>{[player.leaderName, player.baseName].filter(Boolean).join(' · ') || `${player.mainDeckCount} cards`}</em>
    </div>
  )
}

function QueueEntry({
  entry,
  busy,
  onCancel,
}: {
  entry: PlayQueueEntrySummary
  busy: boolean
  onCancel: (entryId: string) => Promise<void>
}) {
  return (
    <article className="ptp-play-queue-entry">
      <div>
        <strong>{entry.deckName}</strong>
        <span>{entry.setCode} · {entry.poolType}</span>
      </div>
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => void onCancel(entry.id)}
        disabled={busy}
      >
        {busy ? 'Cancelling...' : 'Cancel'}
      </Button>
    </article>
  )
}

function DeckRow({
  deck,
  runtimeAvailable,
  busy,
  onQueue,
}: {
  deck: PlayDeckSummary
  runtimeAvailable: boolean
  busy: boolean
  onQueue: (poolShareId: string) => Promise<void>
}) {
  const disabled = !runtimeAvailable || !deck.ready || busy

  return (
    <article className="ptp-play-deck-row" data-ready={deck.ready}>
      <div className="ptp-play-deck-main">
        <strong>{deck.name}</strong>
        <span>{deck.setCode} · {deck.poolType} · {deck.mainDeckCount} cards</span>
        <small>{[deck.leaderName, deck.baseName].filter(Boolean).join(' · ') || deck.blocker}</small>
      </div>
      <div className="ptp-play-deck-actions">
        {!deck.ready && deck.blocker && <span className="ptp-play-blocker">{deck.blocker}</span>}
        <Button
          type="button"
          variant={deck.ready ? 'primary' : 'warning'}
          size="sm"
          onClick={() => void onQueue(deck.poolShareId)}
          disabled={disabled}
        >
          {busy ? 'Queueing...' : 'Queue'}
        </Button>
      </div>
    </article>
  )
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
  })
  const envelope = await response.json() as ApiEnvelope<T | { error?: string; code?: string }>

  if (!response.ok || !envelope.success) {
    const data = envelope.data
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      throw new Error(data.error)
    }
    throw new Error(envelope.message ?? 'Request failed')
  }

  if (envelope.data === null) {
    throw new Error('Empty response')
  }

  return envelope.data as T
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function queueActionMessage(action: EnterQueueResult['action']): string {
  if (action === 'matched') return 'Match ready.'
  if (action === 'existing_queue') return 'Already queued.'
  if (action === 'active_match') return 'Active match already exists.'
  return 'Queued.'
}

function statusLabel(status: PlayMatchSummary['status']): string {
  if (status === 'launch_ready') return 'Ready'
  if (status === 'in_progress') return 'Live'
  if (status === 'complete') return 'Complete'
  if (status === 'failed') return 'Failed'
  if (status === 'cancelled') return 'Cancelled'
  return 'Matched'
}

function resultLabel(match: PlayMatchSummary): string {
  if (match.result === 'draw') return 'Draw'
  if (!match.result || !match.mySeat) return 'Complete'
  return match.result === match.mySeat ? 'Win' : 'Loss'
}
