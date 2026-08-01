'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@/src/components/Button'
import ReplayWatchLink from '@/src/components/ReplayWatchLink'
import type {
  RecordPlayResultResult,
  RuntimeSeatSummary,
  RuntimeSession,
} from '@/src/services/play/playLedger'
import type { PtpPlayReportedResult } from '@/src/services/play/playState'

interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  message: string | null
}

export default function RuntimeStub({ matchId, seatToken }: { matchId: string; seatToken: string }) {
  const [session, setSession] = useState<RuntimeSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyResult, setBusyResult] = useState<PtpPlayReportedResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const loadEventSentRef = useRef(false)

  const loadSession = useCallback(async () => {
    if (!seatToken) {
      setMessage('Missing seat token.')
      setLoading(false)
      return
    }

    try {
      const nextSession = await apiRequest<RuntimeSession>(
        `/api/play/runtime/matches/${encodeURIComponent(matchId)}?seatToken=${encodeURIComponent(seatToken)}`
      )
      setSession(nextSession)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [matchId, seatToken])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!session || loadEventSentRef.current) return
    loadEventSentRef.current = true
    void apiRequest<{ ok: true }>(`/api/play/runtime/matches/${encodeURIComponent(matchId)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seatToken,
        eventType: 'runtime.loaded',
        payload: { seat: session.self.seat, mode: session.runtimeMode },
        idempotencyKey: `runtime.loaded:${matchId}:${session.self.seat}`,
      }),
    }).catch(() => {})
  }, [matchId, seatToken, session])

  async function reportResult(result: PtpPlayReportedResult) {
    setBusyResult(result)
    setMessage(null)
    try {
      const recorded = await apiRequest<RecordPlayResultResult>(
        `/api/play/runtime/matches/${encodeURIComponent(matchId)}/result`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seatToken,
            result,
            idempotencyKey: `local-stub-result:${matchId}:${session?.self.seat ?? 'seat'}:${result}`,
          }),
        }
      )
      setMessage(recorded.duplicate ? 'Result already recorded.' : 'Result recorded.')
      await loadSession()
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusyResult(null)
    }
  }

  return (
    <main className="ptp-runtime-page">
      <section className="ptp-runtime-shell">
        <header className="ptp-play-header">
          <div>
            <span className="ptp-play-eyebrow">PTP Runtime</span>
            <h1>Local Game</h1>
            <p>{session ? `${session.self.deck.setCode} · ${session.runtimeMode}` : 'Loading seat'}</p>
          </div>
          <div className="ptp-play-header-actions">
            <a className="ptp-play-link-button" href="/play">Lobby</a>
          </div>
        </header>

        {message && (
          <div className="ptp-play-message" role="status">
            {message}
          </div>
        )}

        {loading && <div className="ptp-play-skeleton" />}

        {session && (
          <>
            <section className="ptp-runtime-board">
              <RuntimeSeat title="You" seat={session.self} />
              <RuntimeSeat title="Opponent" seat={session.opponent} />
            </section>

            <section className="ptp-runtime-result-panel">
              <span className={`ptp-play-status-chip ptp-play-status-chip--${session.status}`}>
                {session.status === 'launch_ready' ? 'Ready' : session.status}
              </span>
              {session.status === 'complete' ? (
                <div className="ptp-runtime-result-actions">
                  <ReplayWatchLink href={session.replayUrl ?? `/play/runtime/${matchId}/replay`} target="_self" rel="">
                    Replay
                  </ReplayWatchLink>
                  <a className="ptp-play-link-button" href="/play">Lobby</a>
                </div>
              ) : (
                <>
                  <p>Record the local stub result.</p>
                  <div className="ptp-runtime-result-actions">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void reportResult('win')}
                      disabled={busyResult !== null}
                    >
                      {busyResult === 'win' ? 'Recording...' : 'Win'}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => void reportResult('loss')}
                      disabled={busyResult !== null}
                    >
                      {busyResult === 'loss' ? 'Recording...' : 'Loss'}
                    </Button>
                    <Button
                      type="button"
                      variant="interactive"
                      onClick={() => void reportResult('draw')}
                      disabled={busyResult !== null}
                    >
                      {busyResult === 'draw' ? 'Recording...' : 'Draw'}
                    </Button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  )
}

function RuntimeSeat({ title, seat }: { title: string; seat: RuntimeSeatSummary }) {
  return (
    <article className="ptp-runtime-seat">
      <span>{title} · {seat.seat}</span>
      <h2>{seat.username || 'Player'}</h2>
      <p>{seat.deck.name}</p>
      <p>{[seat.deck.leaderName, seat.deck.baseName].filter(Boolean).join(' · ') || `${seat.deck.mainDeckCount} cards`}</p>
    </article>
  )
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
  })
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}
