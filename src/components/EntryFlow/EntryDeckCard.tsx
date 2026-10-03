import type { ReactNode } from 'react'
import { getPackArtUrl } from '@/src/utils/packArt'
import type { EntryDeck } from './EntryPlay'

/** One deck identity and artwork treatment throughout the play setup flow. */
export default function EntryDeckCard({ deck, selected = false, children }: {
  deck: EntryDeck
  selected?: boolean
  children?: ReactNode
}) {
  const leaderArt = deck.leaderBackImageUrl || deck.leaderImageUrl
  const identity = [deck.leaderName, deck.baseName].filter(Boolean).join(' · ')
  return (
    <article className={`entry-library-deck your-stats-pool-build ${!(deck.complete ?? deck.ready) ? 'is-incomplete' : ''} ${selected ? 'is-selected' : ''}`}>
      <div className={`your-stats-pool-build-art ${!leaderArt ? 'your-stats-pool-build-art--set' : ''}`} aria-hidden="true">
        <img src={leaderArt || getPackArtUrl(deck.setCode) || undefined} alt="" loading="lazy" />
      </div>
      <div className="your-stats-replay-content">
        <h3>{deck.name}</h3>
        <p>{deck.setCode} · {deck.poolType === 'draft' ? 'Draft' : 'Sealed'} · {deck.mainDeckCount} cards</p>
        {identity && identity !== deck.name && <p>{identity}</p>}
        {deck.editLocked && <p>Deck locked while your competitive event is in progress.</p>}
        {children && <div className="entry-deck-actions">{children}</div>}
      </div>
    </article>
  )
}
