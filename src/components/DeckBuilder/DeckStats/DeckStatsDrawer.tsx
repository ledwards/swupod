/**
 * DeckStatsDrawer: live stats for the deck being built, against the whole pool.
 * A side drawer on desktop, a bottom sheet on phones. Opened from the header
 * Stats button.
 */

import { useState } from 'react'
import { Button } from '../../Button'
import { useDeckStats, type DeckStatsView } from '../../../hooks/useDeckStats'
import type { StatsCard } from '../../../services/deckStats'
import { DeckStatsModules, DeckStatsViewToggle } from './DeckStatsModules'

export interface DeckStatsDrawerProps {
  onClose: () => void
  cardPositions: Record<string, any>
  leaderCard: StatsCard | null
  baseCard: StatsCard | null
  setCode: string
  shareId?: string | null
  activeLabel: string | null
  onSelectLabel: (label: string | null) => void
}

export function DeckStatsDrawer({ onClose, cardPositions, leaderCard, baseCard, setCode, shareId, activeLabel, onSelectLabel }: DeckStatsDrawerProps) {
  const [view, setView] = useState<DeckStatsView>('deck')
  const stats = useDeckStats({ cardPositions, leaderCard, baseCard, setCode, view })

  return (
    <aside className="deck-stats-drawer" aria-label="Deck stats">
      <div className="deck-stats-drawer-head">
        <h3>Stats</h3>
        <DeckStatsViewToggle view={view} onChange={setView} />
        <Button variant="icon" size="sm" aria-label="Close stats" onClick={onClose}>&times;</Button>
      </div>

      <div className="deck-stats-drawer-body">
        <DeckStatsModules
          stats={stats} view={view} leaderCard={leaderCard} baseCard={baseCard}
          layout="drawer" activeLabel={activeLabel} onSelectLabel={onSelectLabel}
        />
      </div>

      <div className="deck-stats-drawer-foot">
        <span>Updates as you edit</span>
        {shareId && <a className="btn btn--interactive btn--sm" href={`/pools/${shareId}/deck/stats#build`} target="_blank" rel="noopener">Full Stats</a>}
      </div>
    </aside>
  )
}
