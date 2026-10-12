'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import DeckArt from '../PodHub/DeckArt'
import PlayerDeckImage from '../PlayerDeckImage'
import DeckEyeButton from '../DeckEyeButton'
import { EditIcon } from '../PodHub/icons'
import { AspectIcon } from '../AspectIcon'
import { useFadePresence } from '../../hooks/useFadePresence'
import type { HubDeck, HubPlayer } from '../../services/pods/hubTypes'
import type { LogPlayer } from './useDraftLog'
import { ChevronIcon, LockIcon } from './icons'

/** A colour aspect names the leader/base; Heroism and Villainy show as icons only. */
const ASPECT_TOKEN: Record<string, string> = {
  Vigilance: 'var(--pt-aspect-vigilance)', Command: 'var(--pt-aspect-command)',
  Aggression: 'var(--pt-aspect-aggression)', Cunning: 'var(--pt-aspect-cunning)',
}
function AspectName({ name, aspects }: { name: string; aspects: string[] }) {
  const tone = aspects.map(a => ASPECT_TOKEN[a]).find(Boolean)
  return <span className="dlog-aspect-name">
    {aspects.map(a => <AspectIcon key={a} aspect={a} size="sm"/>)}
    <span style={tone ? { color: tone } : undefined}>{name}</span>
  </span>
}

/**
 * The open seat: deck art, a switcher to every other seat, leader and base in
 * their aspects, and the deck (view it; edit your own; open anyone else's in the
 * deck builder).
 */
export default function PlayerLine({ players, active, viewableSeats, myPlayerId, isHost, hubPlayer, shareId, onSelect, record, children }: {
  players: LogPlayer[]; active: LogPlayer; viewableSeats: number[]; myPlayerId: string | null; isHost: boolean
  hubPlayer: HubPlayer | null; shareId: string; onSelect: (seat: number) => void
  /** The seat's event record ("2–1"), when the pod played one. */
  record?: string | null
  /** Shown under the seat's row in the same card (its results). */
  children?: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewing, setViewing] = useState(false)
  const menu = useFadePresence(menuOpen)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenuOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [menuOpen])

  const mine = active.userId === myPlayerId
  const deck: HubDeck | null = hubPlayer?.deck ?? null
  const pool = hubPlayer?.deckPoolShareId ?? (mine || isHost || active.isBot || active.poolIsPublic ? active.poolShareId : null)
  const strategy = active.isBot && active.strategyDisplayName
    ? `${active.strategyDisplayName}${active.mixinDisplayName ? ` + ${active.mixinDisplayName}` : ''}` : null

  return <div className="pod-pn dlog-player-card">
  <div className="dlog-player">
    {deck && <span className="dlog-player-art"><DeckArt deck={deck}/></span>}
    <div className="dlog-player-text">
      <div className="dlog-switch" ref={wrap}>
        <button type="button" className="dlog-switch-btn" aria-haspopup="listbox" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
          <b>{active.username}</b>{active.isBot && <span className="pod-bot">AI</span>}
          <span className="pod-hint">Seat {active.seatNumber}{record ? ` · ${record}` : ''}</span><ChevronIcon/>
        </button>
        {menu.mounted && <ul className={`dlog-switch-menu fade-presence${menu.leaving ? ' is-leaving' : ''}`} role="listbox" aria-label="Players">
          {players.map(p => {
            const viewable = viewableSeats.includes(p.seatNumber)
            return <li key={p.seatNumber} role="option" aria-selected={p.seatNumber === active.seatNumber} aria-disabled={!viewable}>
              <button type="button" disabled={!viewable} title={viewable ? undefined : `${p.username}’s picks are private`}
                onClick={() => { setMenuOpen(false); onSelect(p.seatNumber) }}>
                <span className="dlog-seat-no">{p.seatNumber}</span>
                <span className="dlog-switch-name">{p.username}</span>
                {p.isBot && <span className="pod-bot">AI</span>}
                {p.userId === myPlayerId && <span className="dlog-you">You</span>}
                {!viewable && <span className="dlog-switch-lock"><LockIcon open={false}/></span>}
              </button>
            </li>
          })}
        </ul>}
      </div>
      <div className="dlog-player-deck">
        {deck ? <><AspectName name={deck.leaderName} aspects={deck.leaderAspects ?? []}/><span className="pod-hint">·</span><AspectName name={deck.baseName} aspects={deck.baseAspects ?? []}/></>
          : <span className="pod-hint">{strategy ?? 'No deck yet'}</span>}
      </div>
      {strategy && deck && <span className="pod-hint" title={[active.strategyDescription, active.mixinDescription].filter(Boolean).join(' ')}>AI strategy: {strategy}</span>}
    </div>
    {pool ? <div className="dlog-player-icons">
        <DeckEyeButton name={active.username} poolShareId={pool} onClick={() => setViewing(true)}/>
        <a className="pod-icon-btn" href={`/pools/${encodeURIComponent(pool)}/deck`}
          aria-label={mine ? 'Edit your deck' : `Open ${active.username}’s deck in the deck builder`} title={mine ? 'Edit deck' : 'Open in the deck builder'}><EditIcon/></a>
      </div>
      : <div className="dlog-player-actions">
        {mine ? <a className="pod-sec" href={`/draft/${encodeURIComponent(shareId)}/pod`}>Build your deck</a>
          : <span className="pod-hint">{active.poolShareId ? 'Deck is private' : 'Still deckbuilding'}</span>}
      </div>}
  </div>
    {children}
    {viewing && pool && <PlayerDeckImage poolShareId={pool} username={active.username} deck={deck} onClose={() => setViewing(false)}/>}
  </div>
}
