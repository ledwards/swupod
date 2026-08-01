'use client'

import { useEffect, useState } from 'react'
import type { PlayReplay } from '@/src/services/play/playLedger'

interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  message: string | null
}

export default function ReplayView({ matchId }: { matchId: string }) {
  const [replay, setReplay] = useState<PlayReplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadReplay() {
      try {
        const data = await apiRequest<PlayReplay>(
          `/api/play/runtime/matches/${encodeURIComponent(matchId)}/replay`
        )
        setReplay(data)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Failed to load replay')
      } finally {
        setLoading(false)
      }
    }

    void loadReplay()
  }, [matchId])

  return (
    <main className="ptp-replay-page">
      <section className="ptp-replay-shell">
        <header className="ptp-play-header">
          <div>
            <span className="ptp-play-eyebrow">PTP Replay</span>
            <h1>Game Ledger</h1>
            <p>{replay ? resultLine(replay) : 'Loading replay'}</p>
          </div>
          <div className="ptp-play-header-actions">
            <a className="ptp-play-link-button" href="/play">Lobby</a>
          </div>
        </header>

        {message && <div className="ptp-play-message">{message}</div>}
        {loading && <div className="ptp-play-skeleton" />}

        {replay && (
          <section className="ptp-replay-event-list">
            {replay.events.length > 0 ? (
              replay.events.map(event => (
                <article key={event.id} className="ptp-replay-event">
                  <strong>{event.eventType}</strong>
                  <p>{event.createdAt ? new Date(event.createdAt).toLocaleString() : ''}</p>
                  <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                </article>
              ))
            ) : (
              <div className="ptp-play-empty">No events recorded.</div>
            )}
          </section>
        )}
      </section>
    </main>
  )
}

async function apiRequest<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' })
  const envelope = await response.json() as ApiEnvelope<T | { error?: string }>
  if (!response.ok || !envelope.success) {
    const data = envelope.data
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      throw new Error(data.error)
    }
    throw new Error(envelope.message ?? 'Request failed')
  }
  if (envelope.data === null) throw new Error('Empty response')
  return envelope.data as T
}

function resultLine(replay: PlayReplay): string {
  const { match } = replay
  const left = match.player1.deckName
  const right = match.player2.deckName
  if (match.result === 'draw') return `${left} drew with ${right}`
  if (match.result === 'player1') return `${left} defeated ${right}`
  if (match.result === 'player2') return `${right} defeated ${left}`
  return `${left} vs ${right}`
}
