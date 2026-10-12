'use client'
import { useId, useState } from 'react'
import Button from './Button'
import CardWithPreview from './CardWithPreview'
import PlayerDeckImage from './PlayerDeckImage'
import DeckEyeButton from './DeckEyeButton'
import { useLeaderDraftResults } from '../hooks/useLeaderDraftResults'
import './LeaderDraftResults.css'

interface Props {
  shareId?: string | null
  poolShareId?: string | null
  collapsed?: boolean
  activeSeat?: number | null
  onSeatSelect?: (seat: number) => void
  refreshKey?: string
  /** Inside a dialog that carries the title: no heading or Show/Hide toggle, always open. */
  embedded?: boolean
}

export default function LeaderDraftResults({shareId, poolShareId, collapsed = false, activeSeat, onSeatSelect, refreshKey, embedded = false}: Props) {
  const [toggledOpen, setOpen] = useState(!collapsed)
  const open = embedded || toggledOpen
  const [retry, setRetry] = useState(0)
  const {players, loading, error} = useLeaderDraftResults(shareId, poolShareId, `${refreshKey || ''}:${retry}`)
  const [viewing, setViewing] = useState<{poolShareId: string; username: string} | null>(null)
  const id = useId()
  if (!loading && !error && !players.length) return embedded ? <p className="leader-results-description">No decks for this draft yet.</p> : null
  return (
    <section className={`leader-results${embedded ? ' leader-results--embedded' : ''}`} aria-labelledby={embedded ? undefined : `${id}-title`}>
      {!embedded && <div className="leader-results-heading">
        <h2 id={`${id}-title`}>Pod decks</h2>
        <Button size="sm" textOnly onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={id}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>}
      <div id={id} hidden={!open}>
        {loading ? (
          <div className="leader-results-grid" aria-busy="true" aria-label="Loading pod decks">
            {[0, 1].map(i => <div key={i} className="skeleton-block leader-results-skeleton" />)}
          </div>
        ) : error ? (
          <p role="alert">Could not load the pod’s decks. <Button size="sm" onClick={() => setRetry(value => value + 1)}>Retry</Button></p>
        ) : (
          <>
            <div className="leader-results-grid">
              {players.map(player => (
                <div key={player.seatNumber} className={`leader-results-player${activeSeat === player.seatNumber ? ' is-active' : ''}`}>
                  <div className="leader-results-name">
                    {onSeatSelect && player.leaders !== null ? (
                      <Button size="sm" textOnly onClick={() => onSeatSelect(player.seatNumber)} aria-current={activeSeat === player.seatNumber ? 'true' : undefined}>
                        Seat {player.seatNumber} · {player.username}
                      </Button>
                    ) : <h3>Seat {player.seatNumber} · {player.username}</h3>}
                    {player.deck?.poolShareId && <DeckEyeButton name={player.username} poolShareId={player.deck.poolShareId} onClick={() => setViewing({poolShareId: player.deck!.poolShareId!, username: player.username})} />}
                  </div>
                  {player.deck && (
                    <div className="leader-results-cards leader-results-cards--played">
                      {player.deck.leader && <CardWithPreview card={player.deck.leader} aria-label={`Leader: ${player.deck.leader.name || 'Leader'}`} />}
                      {player.deck.base && <CardWithPreview card={player.deck.base} aria-label={`Base: ${player.deck.base.name || 'Base'}`} />}
                    </div>
                  )}
                  {player.leaders === null ? <p className="leader-results-description">Private log</p> : <>
                    {!player.deck && <p className="leader-results-description">No deck built yet</p>}
                    <span className="leader-results-label">Drafted leaders</span>
                    {!player.leaders.length ? <p className="leader-results-description">Leader data unavailable</p> : (
                      <div className="leader-results-cards leader-results-cards--drafted">
                        {player.leaders.map((card, index) => (
                          // The deck builder's own preview: hover on desktop, long-press on touch, both sides of the leader.
                          <CardWithPreview key={`${card.id}-${index}`} card={card} aria-label={card.name || 'Leader'} />
                        ))}
                      </div>
                    )}
                  </>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {viewing && <PlayerDeckImage poolShareId={viewing.poolShareId} username={viewing.username} onClose={() => setViewing(null)} />}
    </section>
  )
}
