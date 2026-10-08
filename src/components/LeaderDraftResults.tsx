'use client'
import { useId, useState } from 'react'
import Button from './Button'
import Card from './Card'
import CardZoom from './CardZoom'
import { useLeaderDraftResults } from '../hooks/useLeaderDraftResults'
import type { LeaderResultCard } from '../services/leaderDraftResults'
import './LeaderDraftResults.css'

interface Props {
  shareId?: string | null
  poolShareId?: string | null
  collapsed?: boolean
  activeSeat?: number | null
  onSeatSelect?: (seat: number) => void
  refreshKey?: string
}

export default function LeaderDraftResults({shareId, poolShareId, collapsed = false, activeSeat, onSeatSelect, refreshKey}: Props) {
  const [open, setOpen] = useState(!collapsed)
  const [zoomed, setZoomed] = useState<LeaderResultCard | null>(null)
  const [retry, setRetry] = useState(0)
  const {players, loading, error} = useLeaderDraftResults(shareId, poolShareId, `${refreshKey || ''}:${retry}`)
  const id = useId()
  if (!loading && !error && !players.length) return null
  return (
    <section className="leader-results" aria-labelledby={`${id}-title`}>
      <div className="leader-results-heading">
        <h2 id={`${id}-title`}>Leader draft results</h2>
        <Button size="sm" textOnly onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={id}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      <div id={id} hidden={!open}>
        {loading ? (
          <div className="leader-results-grid" aria-busy="true" aria-label="Loading leader draft results">
            {[0, 1].map(i => <div key={i} className="skeleton-block leader-results-skeleton" />)}
          </div>
        ) : error ? (
          <p role="alert">Could not load leader results. <Button size="sm" onClick={() => setRetry(value => value + 1)}>Retry</Button></p>
        ) : (
          <>
            <p className="leader-results-description">Drafted leaders by original seat. Tap a card to see both sides.</p>
            <div className="leader-results-grid">
              {players.map(player => (
                <div key={player.seatNumber} className={`leader-results-player${activeSeat === player.seatNumber ? ' is-active' : ''}`}>
                  {onSeatSelect && player.leaders !== null ? (
                    <Button size="sm" textOnly onClick={() => onSeatSelect(player.seatNumber)} aria-current={activeSeat === player.seatNumber ? 'true' : undefined}>
                      Seat {player.seatNumber} · {player.username}
                    </Button>
                  ) : <h3>Seat {player.seatNumber} · {player.username}</h3>}
                  {player.leaders === null ? <p className="leader-results-description">Private log</p> : !player.leaders.length ? <p className="leader-results-description">Leader data unavailable</p> : (
                    <div className="leader-results-cards">
                      {player.leaders.map((card, index) => (
                        <Card key={`${card.id}-${index}`} card={card} role="button" tabIndex={0}
                          aria-label={`Inspect ${card.name || 'leader'}`} onClick={() => setZoomed(card)}
                          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setZoomed(card) } }} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <CardZoom card={zoomed} onClose={() => setZoomed(null)} />
    </section>
  )
}
