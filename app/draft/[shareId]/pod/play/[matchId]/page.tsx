'use client'
import { use, useEffect, useRef, useState } from 'react'
import '@/src/components/PodHub/pod-hub.css'
import './recovery.css'

type Reservation = { matchId: string; action: 'cancel' | 'forfeit' }

export default function PodTableLaunch({ params }: { params: Promise<{ shareId: string; matchId: string }> }) {
  const { shareId, matchId } = use(params)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'play' | 'watch' | 'replay'>('play')
  const [attempt, setAttempt] = useState(0)
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [busy, setBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)

  useEffect(() => {
    const search = new URLSearchParams(location.search)
    const replayGame = search.get('replay')
    const watching = search.get('watch') === '1'
    setMode(replayGame ? 'replay' : watching ? 'watch' : 'play')
    setError('')
    let live = true
    async function launch() {
      // One retry permits automatic cleanup of a completed game's stale seat.
      for (let retry = 0; retry < 2; retry++) {
        const response = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/match/${encodeURIComponent(matchId)}/${replayGame ? 'replay' : watching ? 'watch' : 'play'}`, {
          method: 'POST', credentials: 'include',
          ...(replayGame ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gameId: replayGame }) } : {}),
        })
        const body = await response.json().catch(() => null)
        if (!live) return
        if (response.ok && typeof body?.launchUrl === 'string') {
          location.replace(body.launchUrl)
          return
        }
        if (!watching && !replayGame && body?.code === 'own_game_active') {
          const recovery = await fetch('/api/play/native/reservation', { credentials: 'include' })
          const data = await recovery.json().catch(() => null)
          if (!live) return
          if (recovery.ok && data?.reservation) {
            setReservation(data.reservation)
            setError('End your current game to continue.')
            return
          }
          if (recovery.ok && retry === 0) continue
        }
        setError(body?.error ?? 'The table could not open. Please try again.')
        return
      }
    }
    void launch().catch(() => { if (live) setError('The table could not open. Please try again.') })
    return () => { live = false }
  }, [shareId, matchId, attempt])

  useEffect(() => {
    if (reservation && !dialog.current?.open) dialog.current?.showModal()
  }, [reservation])

  async function resolve() {
    if (!reservation || submitting.current) return
    submitting.current = true
    setBusy(true)
    setRecoveryError('')
    try {
      const response = await fetch('/api/play/native/reservation', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reservation),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Could not end your current game. Please try again.')
      dialog.current?.close()
      setReservation(null)
      setAttempt(value => value + 1)
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Could not end your current game. Please try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const forfeiting = reservation?.action === 'forfeit'
  return <section className="pod-hub pod-hub--empty" aria-label="Table">
    <h1>{mode === 'replay' ? 'Replay' : mode === 'watch' ? 'Watch' : 'Play'}</h1>
    {error ? <><p role="alert">{error}</p><button className="pod-sec" onClick={() => {
      if (reservation) dialog.current?.showModal()
      else setAttempt(value => value + 1)
    }}>{reservation ? 'Review current game' : 'Try again'}</button></> : <div className="pod-launch-placeholder" aria-busy="true" aria-label="Opening table" />}
    <dialog ref={dialog} className="pod-recovery" aria-labelledby="recovery-title" onCancel={event => { if (busy) event.preventDefault() }}>
      <h2 id="recovery-title">{forfeiting ? 'Forfeit your current game?' : 'Cancel your current game?'}</h2>
      <p>{forfeiting ? 'You are already playing another opponent. Forfeit that game to continue to this table. This counts as a loss.' : 'Cancel your current game or waiting room to continue to this table.'}</p>
      {recoveryError && <p role="alert">{recoveryError}</p>}
      <div className="pod-recovery-actions">
        <button className="pod-sec" disabled={busy} onClick={() => dialog.current?.close()}>Keep current game</button>
        <button className="pod-sec" disabled={busy} aria-busy={busy} onClick={() => void resolve()}>{forfeiting ? 'Forfeit and continue' : 'Cancel and continue'}</button>
      </div>
    </dialog>
  </section>
}
