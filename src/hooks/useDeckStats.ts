/**
 * useDeckStats: deck-vs-pool stats for the deckbuilder drawer and the Build tab.
 *
 * `useDeckStatsFromCards` takes the deck and sideboard directly (the stats page
 * gets them from the server); `useDeckStats` derives them from live builder
 * positions. Both hand off to the pure deckStats service.
 */

import { useMemo } from 'react'
import {
  aspectRows,
  baseSynergyTiles,
  bombNames,
  costCurve,
  deckSummary,
  kindRows,
  labelRows,
  rarityRows,
  splitDeckAndSideboard,
  statsSetCode,
  type StatsCard,
} from '../services/deckStats'
import type { ActiveRatingSet } from '../services/cardDataContract'
import { SET_CONFIGS } from '../utils/setConfigs'
import { getCachedCards } from '../utils/cardCache'
import activeLimitedRatings from '../data/activeLimitedRatings.json'

export type DeckStatsView = 'deck' | 'sideboard'
export type DeckStats = ReturnType<typeof useDeckStatsFromCards>

const RATINGS = activeLimitedRatings as Record<string, ActiveRatingSet>

export function useDeckStatsFromCards({ deck, sideboard, leaderCard, baseCard, setCode, view, setBases }: {
  deck: StatsCard[]
  sideboard: StatsCard[]
  leaderCard: StatsCard | null
  baseCard: StatsCard | null
  setCode: string
  view: DeckStatsView
  /** The set's bases. Defaults to the client card cache. */
  setBases?: StatsCard[] | undefined
}) {
  return useMemo(() => {
    const pool = [...deck, ...sideboard]
    const primary = view === 'deck' ? deck : sideboard
    const singleSet = statsSetCode(setCode)
    const traits = singleSet ? SET_CONFIGS[singleSet]?.baseTraitSynergy : undefined
    const bases = !traits ? [] : setBases ?? (getCachedCards(singleSet!) as Array<StatsCard & { variantType?: string }>)
      .filter(card => card.type === 'Base' && (!card.variantType || card.variantType === 'Normal'))

    return {
      summary: deckSummary(deck, pool, leaderCard, baseCard),
      bombs: bombNames(deck, singleSet, RATINGS),
      poolBombs: bombNames(pool, singleSet, RATINGS),
      primary,
      pool,
      aspects: aspectRows(primary, pool, leaderCard, baseCard),
      curve: costCurve(primary, pool),
      kinds: kindRows(primary, pool),
      rarities: rarityRows(primary, pool),
      traits: labelRows(primary, pool, 'traits'),
      keywords: labelRows(primary, pool, 'keywords'),
      synergy: traits ? baseSynergyTiles({ traits, deck, sideboard, setBases: bases, currentBase: baseCard }) : null,
      synergySet: traits ? singleSet : null,
    }
  }, [deck, sideboard, leaderCard, baseCard, setCode, view, setBases])
}

export function useDeckStats({ cardPositions, ...rest }: {
  cardPositions: Record<string, any>
  leaderCard: StatsCard | null
  baseCard: StatsCard | null
  setCode: string
  view: DeckStatsView
}) {
  const { deck, sideboard } = useMemo(() => splitDeckAndSideboard(cardPositions), [cardPositions])
  return useDeckStatsFromCards({ deck, sideboard, ...rest })
}
