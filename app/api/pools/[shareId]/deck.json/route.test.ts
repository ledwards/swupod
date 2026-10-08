/**
 * Tests for GET /api/pools/:shareId/deck.json
 *
 * Tests the deck export logic that converts deckBuilderState into
 * SWUDB-compatible JSON format.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// === Types (mirrors route.ts) ===

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

interface CardPosition {
  card: Card
  section: 'deck' | 'sideboard' | 'pool' | 'leaders' | 'bases'
  visible: boolean
  enabled?: boolean
}

interface DeckBuilderState {
  cardPositions?: Record<string, CardPosition>
  activeLeader?: string
  activeBase?: string
  poolName?: string
}

interface DeckEntry {
  id: string
  count: number
}

// === Mock buildBaseCardMap and getBaseCardId ===
// These are simplified versions that work without the card cache

function mockGetBaseCardId(card: Card): string | null {
  if (!card.cardId) return null

  // Convert "SEC-12" to "SEC_012"
  const parts = card.cardId.split('-')
  if (parts.length !== 2) return card.cardId.replace(/-/g, '_')

  const [setCode, numberStr] = parts
  const number = parseInt(numberStr!, 10)
  const paddedNumber = number.toString().padStart(3, '0')

  return `${setCode}_${paddedNumber}`
}

// === buildDeckFromState (extracted logic from route.ts) ===

function buildDeckFromState(
  state: DeckBuilderState
): { leader: DeckEntry | null; base: DeckEntry | null; deck: DeckEntry[]; sideboard: DeckEntry[] } {
  const cardPositions = state.cardPositions || {}

  // Find leader and base cards
  let leaderCard: Card | null = null
  let baseCard: Card | null = null

  for (const [posId, pos] of Object.entries(cardPositions)) {
    if (pos.card.isLeader && posId === state.activeLeader) {
      leaderCard = pos.card
    }
    if (pos.card.isBase && posId === state.activeBase) {
      baseCard = pos.card
    }
  }

  // Get deck cards
  const deckCards = Object.values(cardPositions)
    .filter(pos =>
      pos.section === 'deck' &&
      pos.visible &&
      pos.enabled !== false &&
      !pos.card.isBase &&
      !pos.card.isLeader
    )
    .map(pos => pos.card)

  // Get sideboard cards
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
    const id = mockGetBaseCardId(card)
    if (id) {
      deckCounts.set(id, (deckCounts.get(id) || 0) + 1)
    }
  })

  const sideboardCounts = new Map<string, number>()
  sideboardCards.forEach(card => {
    const id = mockGetBaseCardId(card)
    if (id) {
      sideboardCounts.set(id, (sideboardCounts.get(id) || 0) + 1)
    }
  })

  return {
    leader: leaderCard ? { id: mockGetBaseCardId(leaderCard) || '', count: 1 } : null,
    base: baseCard ? { id: mockGetBaseCardId(baseCard) || '', count: 1 } : null,
    deck: Array.from(deckCounts.entries()).map(([id, count]) => ({ id, count })),
    sideboard: Array.from(sideboardCounts.entries()).map(([id, count]) => ({ id, count })),
  }
}

// === Tests ===

describe('GET /api/pools/:shareId/deck.json', () => {
  describe('buildDeckFromState', () => {
    it('extracts leader and base from cardPositions', () => {
      const state: DeckBuilderState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'leader-1': {
            card: { cardId: 'SOR-5', name: 'Luke Skywalker', type: 'Leader', isLeader: true },
            section: 'leaders',
            visible: true,
          },
          'base-1': {
            card: { cardId: 'SOR-29', name: 'Dagobah Swamp', type: 'Base', isBase: true },
            section: 'bases',
            visible: true,
          },
        },
      }

      const result = buildDeckFromState(state)

      assert.deepStrictEqual(result.leader, { id: 'SOR_005', count: 1 })
      assert.deepStrictEqual(result.base, { id: 'SOR_029', count: 1 })
    })

    it('collects deck cards and counts duplicates', () => {
      const state: DeckBuilderState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'leader-1': {
            card: { cardId: 'SOR-5', isLeader: true },
            section: 'leaders',
            visible: true,
          },
          'base-1': {
            card: { cardId: 'SOR-29', isBase: true },
            section: 'bases',
            visible: true,
          },
          'card-1': {
            card: { cardId: 'SOR-100', name: 'Wing Leader' },
            section: 'deck',
            visible: true,
            enabled: true,
          },
          'card-2': {
            card: { cardId: 'SOR-100', name: 'Wing Leader' },
            section: 'deck',
            visible: true,
            enabled: true,
          },
          'card-3': {
            card: { cardId: 'SOR-50', name: 'TIE Fighter' },
            section: 'deck',
            visible: true,
            enabled: true,
          },
        },
      }

      const result = buildDeckFromState(state)

      // Should have 2 unique cards, one with count 2
      assert.strictEqual(result.deck.length, 2)
      const wingLeader = result.deck.find(c => c.id === 'SOR_100')
      const tieFighter = result.deck.find(c => c.id === 'SOR_050')
      assert.deepStrictEqual(wingLeader, { id: 'SOR_100', count: 2 })
      assert.deepStrictEqual(tieFighter, { id: 'SOR_050', count: 1 })
    })

    it('separates sideboard cards from deck cards', () => {
      const state: DeckBuilderState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'leader-1': {
            card: { cardId: 'SOR-5', isLeader: true },
            section: 'leaders',
            visible: true,
          },
          'base-1': {
            card: { cardId: 'SOR-29', isBase: true },
            section: 'bases',
            visible: true,
          },
          'deck-card': {
            card: { cardId: 'SOR-100' },
            section: 'deck',
            visible: true,
            enabled: true,
          },
          'sideboard-card': {
            card: { cardId: 'SOR-200' },
            section: 'sideboard',
            visible: true,
          },
        },
      }

      const result = buildDeckFromState(state)

      assert.strictEqual(result.deck.length, 1)
      assert.strictEqual(result.sideboard.length, 1)
      assert.strictEqual(result.deck[0].id, 'SOR_100')
      assert.strictEqual(result.sideboard[0].id, 'SOR_200')
    })

    it('excludes invisible cards', () => {
      const state: DeckBuilderState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'leader-1': {
            card: { cardId: 'SOR-5', isLeader: true },
            section: 'leaders',
            visible: true,
          },
          'base-1': {
            card: { cardId: 'SOR-29', isBase: true },
            section: 'bases',
            visible: true,
          },
          'visible-card': {
            card: { cardId: 'SOR-100' },
            section: 'deck',
            visible: true,
          },
          'invisible-card': {
            card: { cardId: 'SOR-200' },
            section: 'deck',
            visible: false, // invisible
          },
        },
      }

      const result = buildDeckFromState(state)

      assert.strictEqual(result.deck.length, 1)
      assert.strictEqual(result.deck[0].id, 'SOR_100')
    })

    it('excludes disabled cards from deck', () => {
      const state: DeckBuilderState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'leader-1': {
            card: { cardId: 'SOR-5', isLeader: true },
            section: 'leaders',
            visible: true,
          },
          'base-1': {
            card: { cardId: 'SOR-29', isBase: true },
            section: 'bases',
            visible: true,
          },
          'enabled-card': {
            card: { cardId: 'SOR-100' },
            section: 'deck',
            visible: true,
            enabled: true,
          },
          'disabled-card': {
            card: { cardId: 'SOR-200' },
            section: 'deck',
            visible: true,
            enabled: false, // disabled
          },
        },
      }

      const result = buildDeckFromState(state)

      assert.strictEqual(result.deck.length, 1)
      assert.strictEqual(result.deck[0].id, 'SOR_100')
    })

    it('returns null leader/base when not selected', () => {
      const state: DeckBuilderState = {
        cardPositions: {
          'card-1': {
            card: { cardId: 'SOR-100' },
            section: 'deck',
            visible: true,
          },
        },
      }

      const result = buildDeckFromState(state)

      assert.strictEqual(result.leader, null)
      assert.strictEqual(result.base, null)
    })

    it('handles empty state gracefully', () => {
      const state: DeckBuilderState = {}

      const result = buildDeckFromState(state)

      assert.strictEqual(result.leader, null)
      assert.strictEqual(result.base, null)
      assert.deepStrictEqual(result.deck, [])
      assert.deepStrictEqual(result.sideboard, [])
    })
  })

  describe('export format (Karabast/SWUDB compatibility)', () => {
    it('emits only Karabast-allowed root keys (no secondleader)', () => {
      const state: DeckBuilderState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'leader-1': {
            card: { cardId: 'SOR-5', isLeader: true },
            section: 'leaders',
            visible: true,
          },
          'base-1': {
            card: { cardId: 'SOR-29', isBase: true },
            section: 'bases',
            visible: true,
          },
          'card-1': {
            card: { cardId: 'SOR-100' },
            section: 'deck',
            visible: true,
          },
        },
      }

      const deckData = buildDeckFromState(state)

      // Build the export format exactly as route.ts does
      const exportData = {
        metadata: { name: '[PTP] Test Deck', author: 'Protect the Pod' },
        leader: deckData.leader,
        base: deckData.base,
        deck: deckData.deck,
        sideboard: deckData.sideboard,
      }

      // Karabast's paste-import validator ALLOWLISTS root keys
      // (forceteki-client checkJson.ts: metadata, leader, base, deck,
      // sideboard, deckID, deckSource) and rejects anything else — a
      // `secondleader` key, even null, fails the whole import.
      assert.deepStrictEqual(Object.keys(exportData), [
        'metadata', 'leader', 'base', 'deck', 'sideboard',
      ])
      assert.ok(!('secondleader' in exportData))
      assert.strictEqual(exportData.metadata.author, 'Protect the Pod')
      assert.ok(exportData.metadata.name.startsWith('[PTP]'))
    })
  })

  describe('Card ID formatting', () => {
    it('converts single-digit card numbers to 3-digit padded format', () => {
      assert.strictEqual(mockGetBaseCardId({ cardId: 'SOR-5' }), 'SOR_005')
      assert.strictEqual(mockGetBaseCardId({ cardId: 'SEC-1' }), 'SEC_001')
    })

    it('converts double-digit card numbers to 3-digit padded format', () => {
      assert.strictEqual(mockGetBaseCardId({ cardId: 'SOR-50' }), 'SOR_050')
      assert.strictEqual(mockGetBaseCardId({ cardId: 'TWI-99' }), 'TWI_099')
    })

    it('preserves triple-digit card numbers', () => {
      assert.strictEqual(mockGetBaseCardId({ cardId: 'SOR-100' }), 'SOR_100')
      assert.strictEqual(mockGetBaseCardId({ cardId: 'SOR-252' }), 'SOR_252')
    })

    it('returns null for cards without cardId', () => {
      assert.strictEqual(mockGetBaseCardId({}), null)
      assert.strictEqual(mockGetBaseCardId({ name: 'Test Card' }), null)
    })
  })
})
