'use client'

import { useState } from 'react'
import { useDeckStatsFromCards, type DeckStatsView } from '@/src/hooks/useDeckStats'
import { DeckStatsModules, DeckStatsViewToggle } from '@/src/components/DeckBuilder/DeckStats/DeckStatsModules'
import type { StatsCard } from '@/src/services/deckStats'

export interface BuildTabData {
  deck: StatsCard[]
  sideboard: StatsCard[]
  leader: StatsCard | null
  base: StatsCard | null
  setCode: string
  setBases: StatsCard[]
}

/** Build tab: the deckbuilder's stats modules for the saved deck, in two columns. */
export function BuildTab({ build }: { build: BuildTabData }) {
  const [view, setView] = useState<DeckStatsView>('deck')
  const stats = useDeckStatsFromCards({
    deck: build.deck,
    sideboard: build.sideboard,
    leaderCard: build.leader,
    baseCard: build.base,
    setCode: build.setCode,
    view,
    setBases: build.setBases,
  })

  if (build.deck.length === 0 && build.sideboard.length === 0) {
    return (
      <section className="deck-stats-panel deck-stats-panel--empty">
        <span className="your-stats-eyebrow">Build</span>
        <h3>No cards saved yet</h3>
        <p>Open the deckbuilder and add cards to see this deck's stats.</p>
      </section>
    )
  }

  return (
    <section className="deck-stats-build">
      <div className="deck-stats-build-head">
        <DeckStatsViewToggle view={view} onChange={setView} />
      </div>
      <DeckStatsModules stats={stats} view={view} leaderCard={build.leader} baseCard={build.base} layout="page" />
    </section>
  )
}
