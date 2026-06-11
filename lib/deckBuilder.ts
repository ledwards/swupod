import { buildBaseCardMap, getBaseCardId } from '@/src/utils/variantDowngrade'

interface Card {
  id?: string
  cardId?: string
  name?: string
  type?: string
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
  set?: string
}

// getBaseCardId declares RawCard but only reads identity fields
// (name/type/subtitle) — our partial Card shape carries what it needs.
type CardForBaseId = Parameters<typeof getBaseCardId>[0]
function asBaseIdCard(card: Card): CardForBaseId {
  return card as unknown as CardForBaseId
}

interface CardPosition {
  card: Card
  section: 'deck' | 'sideboard' | 'pool' | 'leaders' | 'bases'
  visible: boolean
  enabled?: boolean
}

export interface DeckBuilderState {
  cardPositions?: Record<string, CardPosition>
  activeLeader?: string
  activeBase?: string
  poolName?: string
}

export interface DeckEntry {
  id: string
  count: number
}

export interface BuiltDeckData {
  leader: DeckEntry | null
  base: DeckEntry | null
  deck: DeckEntry[]
  sideboard: DeckEntry[]
}

/**
 * Build deck data from deckBuilderState
 */
export function buildDeckFromState(
  state: DeckBuilderState,
  setCode: string
): BuiltDeckData {
  const cardPositions = state.cardPositions || {}
  const baseCardMap = buildBaseCardMap(setCode)

  // Find leader and base cards
  let leaderCard: Card | null = null
  let baseCard: Card | null = null

  // Look through card positions to find the active leader and base
  for (const [posId, pos] of Object.entries(cardPositions)) {
    if (pos.card.isLeader && posId === state.activeLeader) {
      leaderCard = pos.card
    }
    if (pos.card.isBase && posId === state.activeBase) {
      baseCard = pos.card
    }
  }

  // Get deck cards (section === 'deck', visible, enabled !== false, not leader/base)
  const deckCards = Object.values(cardPositions)
    .filter(pos =>
      pos.section === 'deck' &&
      pos.visible &&
      pos.enabled !== false &&
      !pos.card.isBase &&
      !pos.card.isLeader
    )
    .map(pos => pos.card)

  // Get sideboard cards (section === 'sideboard', visible, not leader/base)
  const sideboardCards = Object.values(cardPositions)
    .filter(pos =>
      pos.section === 'sideboard' &&
      pos.visible &&
      !pos.card.isBase &&
      !pos.card.isLeader
    )
    .map(pos => pos.card)

  // Count cards by base ID
  const deckCounts = new Map<string, number>()
  deckCards.forEach(card => {
    const id = getBaseCardId(asBaseIdCard(card), baseCardMap)
    if (id) {
      deckCounts.set(id, (deckCounts.get(id) || 0) + 1)
    }
  })

  const sideboardCounts = new Map<string, number>()
  sideboardCards.forEach(card => {
    const id = getBaseCardId(asBaseIdCard(card), baseCardMap)
    if (id) {
      sideboardCounts.set(id, (sideboardCounts.get(id) || 0) + 1)
    }
  })

  return {
    leader: leaderCard ? { id: getBaseCardId(asBaseIdCard(leaderCard), baseCardMap) || '', count: 1 } : null,
    base: baseCard ? { id: getBaseCardId(asBaseIdCard(baseCard), baseCardMap) || '', count: 1 } : null,
    deck: Array.from(deckCounts.entries()).map(([id, count]) => ({ id, count })),
    sideboard: Array.from(sideboardCounts.entries()).map(([id, count]) => ({ id, count })),
  }
}
