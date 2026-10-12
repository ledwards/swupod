import type { StatsCard } from './composition'
import { getBaseSetCode } from '../../utils/carboniteConstants'

/** Single set code for set-specific modules; null for multi-set pools. */
export function statsSetCode(setCode: string | null | undefined): string | null {
  return setCode && !setCode.includes(',') ? getBaseSetCode(setCode) : null
}

interface Position {
  card?: (StatsCard & { isBase?: boolean; isLeader?: boolean }) | null
  section?: string
  visible?: boolean
  enabled?: boolean
}

/**
 * Deck vs sideboard from saved deckbuilder positions, using the builder's own
 * rule (getDeckCards / getPoolCards): leaders and bases are never counted.
 */
export function splitDeckAndSideboard(cardPositions: Record<string, Position> | null | undefined) {
  const deck: StatsCard[] = []
  const sideboard: StatsCard[] = []
  for (const pos of Object.values(cardPositions || {})) {
    if (!pos?.card || pos.card.isBase || pos.card.isLeader || pos.visible === false) continue
    if (pos.section === 'deck' && pos.enabled !== false) deck.push(pos.card)
    else if (pos.section === 'sideboard' || pos.enabled === false) sideboard.push(pos.card)
  }
  return { deck, sideboard }
}

const STATS_FIELDS = ['name', 'subtitle', 'set', 'cost', 'aspects', 'type', 'arenas', 'rarity', 'traits', 'keywords', 'frontText', 'backText', 'epicAction'] as const

/** Just the fields stats read, so a page can ship a whole pool to the client cheaply. */
export function slimStatsCard(card: StatsCard): StatsCard {
  const out: Record<string, unknown> = {}
  for (const field of STATS_FIELDS) if (card[field] != null) out[field] = card[field]
  return out as unknown as StatsCard
}
