/**
 * useDeckStats: live deck-vs-pool stats for the deckbuilder Stats drawer.
 *
 * Reads the same deck/sideboard split as the builder (getDeckCards /
 * getPoolCards) and hands it to the pure deckStats service.
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
  type StatsCard,
} from '../services/deckStats'
import type { ActiveRatingSet } from '../services/cardDataContract'
import { SET_CONFIGS } from '../utils/setConfigs'
import { getCachedCards } from '../utils/cardCache'
import { getBaseSetCode } from '../utils/carboniteConstants'
import activeLimitedRatings from '../data/activeLimitedRatings.json'

export type DeckStatsView = 'deck' | 'sideboard'

interface Position {
  card: StatsCard & { isBase?: boolean; isLeader?: boolean }
  section: string
  visible?: boolean
  enabled?: boolean
}

export function splitDeckAndSideboard(cardPositions: Record<string, Position>) {
  const deck: StatsCard[] = []
  const sideboard: StatsCard[] = []
  for (const pos of Object.values(cardPositions)) {
    if (!pos?.card || pos.card.isBase || pos.card.isLeader || !pos.visible) continue
    if (pos.section === 'deck' && pos.enabled !== false) deck.push(pos.card)
    else if (pos.section === 'sideboard' || pos.enabled === false) sideboard.push(pos.card)
  }
  return { deck, sideboard }
}

export function useDeckStats({
  cardPositions,
  leaderCard,
  baseCard,
  setCode,
  view,
}: {
  cardPositions: Record<string, Position>
  leaderCard: StatsCard | null
  baseCard: StatsCard | null
  setCode: string
  view: DeckStatsView
}) {
  const split = useMemo(() => splitDeckAndSideboard(cardPositions), [cardPositions])

  return useMemo(() => {
    const { deck, sideboard } = split
    const pool = [...deck, ...sideboard]
    const primary = view === 'deck' ? deck : sideboard
    const singleSet = setCode && !setCode.includes(',') ? getBaseSetCode(setCode) : null
    const traits = singleSet ? SET_CONFIGS[singleSet]?.baseTraitSynergy : undefined
    const setBases = traits ? (getCachedCards(singleSet!) as Array<StatsCard & { variantType?: string }>)
      .filter(card => card.type === 'Base' && (!card.variantType || card.variantType === 'Normal')) : []

    return {
      deckCount: deck.length,
      summary: deckSummary(deck, pool, leaderCard, baseCard),
      bombs: bombNames(deck, singleSet, activeLimitedRatings as Record<string, ActiveRatingSet>),
      poolBombs: bombNames(pool, singleSet, activeLimitedRatings as Record<string, ActiveRatingSet>),
      primary,
      pool,
      aspects: aspectRows(primary, pool, leaderCard, baseCard),
      curve: costCurve(primary, pool),
      kinds: kindRows(primary, pool),
      rarities: rarityRows(primary, pool),
      traits: labelRows(primary, pool, 'traits'),
      keywords: labelRows(primary, pool, 'keywords'),
      synergy: traits ? baseSynergyTiles({ traits, deck, sideboard, setBases, currentBase: baseCard }) : null,
      synergySet: traits ? singleSet : null,
    }
  }, [split, view, setCode, leaderCard, baseCard])
}
