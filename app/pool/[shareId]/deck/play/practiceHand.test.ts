/**
 * Tests for Practice Hand feature
 *
 * Tests the logic for drawing a random 6-card practice hand
 * from the deck (excluding leaders and bases), and the turn-one-play
 * probability/average calculations.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// === Types (mirrors page.tsx) ===

interface CardType {
  id?: string
  name?: string
  type?: string
  cost?: number
  aspects?: string[]
  isBase?: boolean
  isLeader?: boolean
  [key: string]: unknown
}

interface CardPosition {
  card: CardType
  section: string
  enabled?: boolean
  [key: string]: unknown
}

// === Extract the practice hand logic as a pure function for testing ===

function drawPracticeHand(
  cardPositions: Record<string, CardPosition>,
  handSize: number = 6
): CardType[] {
  const deckCards = Object.values(cardPositions)
    .filter((pos: CardPosition) =>
      pos.section === 'deck' &&
      pos.enabled !== false &&
      !pos.card.isBase &&
      !pos.card.isLeader
    )
    .map((pos: CardPosition) => pos.card)

  const shuffled = [...deckCards].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, handSize)
}

// === Turn-one-play logic (mirrors page.tsx) ===

function isTurnOnePlay(
  card: CardType,
  leaderCard: CardType | null,
  baseCard: CardType | null
): boolean {
  const cost = card.cost ?? 0
  const penalty = mockCalculateAspectPenalty(card, leaderCard, baseCard)
  const effectiveCost = cost + penalty
  if (effectiveCost > 2) return false
  if (card.type === 'Unit') return true
  if (card.name === 'Faith in Your Friends') return true
  return false
}

// Simplified aspect penalty for testing (same algorithm as real one)
function mockCalculateAspectPenalty(
  card: CardType,
  leaderCard: CardType | null | undefined,
  baseCard: CardType | null | undefined
): number {
  if (!leaderCard || !baseCard) return 0
  if (!card.aspects || card.aspects.length === 0) return 0

  const myAspects = [
    ...(leaderCard.aspects || []),
    ...(baseCard.aspects || [])
  ]
  const remainingAspects = [...(card.aspects || [])]
  for (const myAspect of myAspects) {
    const index = remainingAspects.indexOf(myAspect)
    if (index !== -1) {
      remainingAspects.splice(index, 1)
    }
  }
  return remainingAspects.length * 2
}

function calculateTurnOneStats(
  deckCards: CardType[],
  leaderCard: CardType | null,
  baseCard: CardType | null,
  handSize: number = 6
): { probAtLeastOne: number; avgTurnOnePlays: number } {
  const totalCards = deckCards.length
  const turnOnePlays = deckCards.filter(c => isTurnOnePlay(c, leaderCard, baseCard)).length
  const effectiveHandSize = Math.min(handSize, totalCards)

  if (totalCards === 0 || effectiveHandSize === 0) {
    return { probAtLeastOne: 0, avgTurnOnePlays: 0 }
  }

  const nonT1 = totalCards - turnOnePlays
  if (turnOnePlays === 0) {
    return { probAtLeastOne: 0, avgTurnOnePlays: 0 }
  }
  if (nonT1 < effectiveHandSize) {
    return {
      probAtLeastOne: 1,
      avgTurnOnePlays: effectiveHandSize * turnOnePlays / totalCards,
    }
  }

  let pNone = 1
  for (let i = 0; i < effectiveHandSize; i++) {
    pNone *= (nonT1 - i) / (totalCards - i)
  }
  return {
    probAtLeastOne: 1 - pNone,
    avgTurnOnePlays: effectiveHandSize * turnOnePlays / totalCards,
  }
}

// === Helper to build card positions ===

function makeCardPosition(
  id: string,
  section: string,
  overrides: Partial<CardType> = {},
  posOverrides: Partial<CardPosition> = {}
): [string, CardPosition] {
  return [id, {
    card: { id, name: `Card ${id}`, ...overrides },
    section,
    enabled: true,
    ...posOverrides,
  }]
}

// === Tests ===

describe('Practice Hand', () => {
  describe('Drawing cards', () => {
    it('draws exactly 6 cards from the deck', () => {
      const positions = Object.fromEntries([
        ...Array.from({ length: 30 }, (_, i) =>
          makeCardPosition(`card-${i}`, 'deck')
        ),
        makeCardPosition('leader-1', 'leaders', { isLeader: true }),
        makeCardPosition('base-1', 'bases', { isBase: true }),
      ])

      const hand = drawPracticeHand(positions)
      assert.strictEqual(hand.length, 6, 'Hand should have 6 cards')
    })

    it('excludes leaders from the hand', () => {
      const positions = Object.fromEntries([
        ...Array.from({ length: 10 }, (_, i) =>
          makeCardPosition(`card-${i}`, 'deck')
        ),
        makeCardPosition('leader-in-deck', 'deck', { isLeader: true }),
      ])

      for (let trial = 0; trial < 50; trial++) {
        const hand = drawPracticeHand(positions)
        const hasLeader = hand.some(c => c.isLeader)
        assert.strictEqual(hasLeader, false, 'Hand should never contain a leader')
      }
    })

    it('excludes bases from the hand', () => {
      const positions = Object.fromEntries([
        ...Array.from({ length: 10 }, (_, i) =>
          makeCardPosition(`card-${i}`, 'deck')
        ),
        makeCardPosition('base-in-deck', 'deck', { isBase: true }),
      ])

      for (let trial = 0; trial < 50; trial++) {
        const hand = drawPracticeHand(positions)
        const hasBase = hand.some(c => c.isBase)
        assert.strictEqual(hasBase, false, 'Hand should never contain a base')
      }
    })

    it('excludes sideboard cards', () => {
      const positions = Object.fromEntries([
        ...Array.from({ length: 10 }, (_, i) =>
          makeCardPosition(`deck-${i}`, 'deck')
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          makeCardPosition(`side-${i}`, 'sideboard')
        ),
      ])

      for (let trial = 0; trial < 50; trial++) {
        const hand = drawPracticeHand(positions)
        const hasSideboard = hand.some(c => c.id?.startsWith('side-'))
        assert.strictEqual(hasSideboard, false, 'Hand should never contain sideboard cards')
      }
    })

    it('excludes disabled cards', () => {
      const positions = Object.fromEntries([
        ...Array.from({ length: 10 }, (_, i) =>
          makeCardPosition(`card-${i}`, 'deck')
        ),
        makeCardPosition('disabled-card', 'deck', {}, { enabled: false }),
      ])

      for (let trial = 0; trial < 50; trial++) {
        const hand = drawPracticeHand(positions)
        const hasDisabled = hand.some(c => c.id === 'disabled-card')
        assert.strictEqual(hasDisabled, false, 'Hand should never contain disabled cards')
      }
    })

    it('returns fewer cards if deck has less than 6', () => {
      const positions = Object.fromEntries([
        makeCardPosition('card-0', 'deck'),
        makeCardPosition('card-1', 'deck'),
        makeCardPosition('card-2', 'deck'),
      ])

      const hand = drawPracticeHand(positions)
      assert.strictEqual(hand.length, 3, 'Hand should have all 3 available cards')
    })

    it('returns empty hand if deck is empty', () => {
      const positions = Object.fromEntries([
        makeCardPosition('leader-1', 'leaders', { isLeader: true }),
        makeCardPosition('base-1', 'bases', { isBase: true }),
      ])

      const hand = drawPracticeHand(positions)
      assert.strictEqual(hand.length, 0, 'Hand should be empty')
    })

    it('draws are random (not always the same cards)', () => {
      const positions = Object.fromEntries(
        Array.from({ length: 30 }, (_, i) =>
          makeCardPosition(`card-${i}`, 'deck')
        )
      )

      const hands = Array.from({ length: 10 }, () => drawPracticeHand(positions))
      const firstCardIds = hands.map(h => h.map(c => c.id).sort().join(','))

      const uniqueHands = new Set(firstCardIds)
      assert.ok(uniqueHands.size > 1, `Hands should vary across draws, got ${uniqueHands.size} unique hand(s)`)
    })

    it('only draws from deck section cards', () => {
      const positions = Object.fromEntries([
        makeCardPosition('deck-1', 'deck'),
        makeCardPosition('deck-2', 'deck'),
        makeCardPosition('deck-3', 'deck'),
        makeCardPosition('deck-4', 'deck'),
        makeCardPosition('deck-5', 'deck'),
        makeCardPosition('deck-6', 'deck'),
        makeCardPosition('pool-1', 'pool'),
        makeCardPosition('side-1', 'sideboard'),
        makeCardPosition('leader-1', 'leaders', { isLeader: true }),
        makeCardPosition('base-1', 'bases', { isBase: true }),
      ])

      const hand = drawPracticeHand(positions)
      assert.strictEqual(hand.length, 6)
      for (const card of hand) {
        assert.ok(card.id?.startsWith('deck-'), `Card ${card.id} should be a deck card`)
      }
    })
  })

  describe('Turn one play identification', () => {
    const leader = { id: 'leader', aspects: ['Vigilance', 'Villainy'], isLeader: true }
    const base = { id: 'base', aspects: ['Vigilance'], isBase: true }

    it('cost 0 unit is a turn one play', () => {
      assert.strictEqual(isTurnOnePlay({ cost: 0, type: 'Unit' }, leader, base), true)
    })

    it('cost 1 unit is a turn one play', () => {
      assert.strictEqual(isTurnOnePlay({ cost: 1, type: 'Unit' }, leader, base), true)
    })

    it('cost 2 unit is a turn one play', () => {
      assert.strictEqual(isTurnOnePlay({ cost: 2, type: 'Unit' }, leader, base), true)
    })

    it('cost 3 unit is NOT a turn one play', () => {
      assert.strictEqual(isTurnOnePlay({ cost: 3, type: 'Unit' }, leader, base), false)
    })

    it('cost 2 event is NOT a turn one play', () => {
      assert.strictEqual(isTurnOnePlay({ cost: 2, type: 'Event' }, leader, base), false)
    })

    it('cost 1 upgrade is NOT a turn one play', () => {
      assert.strictEqual(isTurnOnePlay({ cost: 1, type: 'Upgrade' }, leader, base), false)
    })

    it('Faith in Your Friends is a turn one play (cost 2 event)', () => {
      assert.strictEqual(
        isTurnOnePlay(
          { cost: 2, type: 'Event', name: 'Faith in Your Friends', aspects: ['Cunning', 'Heroism'] },
          // Leader/base that covers the aspects
          { id: 'leader', aspects: ['Cunning'], isLeader: true },
          { id: 'base', aspects: ['Heroism'], isBase: true }
        ),
        true
      )
    })

    it('cost 1 unit with aspect penalty becomes cost 3 and is NOT a turn one play', () => {
      // Leader has Vigilance/Villainy, Base has Vigilance
      // Card has Command aspect = +2 penalty, so effective cost = 1 + 2 = 3
      const card = { cost: 1, type: 'Unit', aspects: ['Command'] }
      assert.strictEqual(isTurnOnePlay(card, leader, base), false)
    })

    it('cost 0 unit with aspect penalty of +2 is still a turn one play (effective cost 2)', () => {
      const card = { cost: 0, type: 'Unit', aspects: ['Command'] }
      assert.strictEqual(isTurnOnePlay(card, leader, base), true)
    })

    it('in-aspect cost 2 unit is a turn one play', () => {
      const card = { cost: 2, type: 'Unit', aspects: ['Vigilance'] }
      assert.strictEqual(isTurnOnePlay(card, leader, base), true)
    })

    it('Faith in Your Friends with aspect penalty is NOT a turn one play', () => {
      // Cunning + Heroism aspects, leader/base have neither = +4 penalty, cost 2 + 4 = 6
      assert.strictEqual(
        isTurnOnePlay(
          { cost: 2, type: 'Event', name: 'Faith in Your Friends', aspects: ['Cunning', 'Heroism'] },
          leader,
          base
        ),
        false
      )
    })
  })

  describe('Turn one play statistics', () => {
    const leader = { id: 'leader', aspects: ['Vigilance'], isLeader: true }
    const base = { id: 'base', aspects: ['Vigilance'], isBase: true }

    it('returns 0% when no turn one plays in deck', () => {
      const deckCards = Array.from({ length: 30 }, (_, i) => ({
        id: `card-${i}`, cost: 5, type: 'Unit' as const,
      }))
      const stats = calculateTurnOneStats(deckCards, leader, base)
      assert.strictEqual(stats.probAtLeastOne, 0)
      assert.strictEqual(stats.avgTurnOnePlays, 0)
    })

    it('returns 100% when every card is a turn one play', () => {
      const deckCards = Array.from({ length: 30 }, (_, i) => ({
        id: `card-${i}`, cost: 1, type: 'Unit' as const,
      }))
      const stats = calculateTurnOneStats(deckCards, leader, base)
      assert.strictEqual(stats.probAtLeastOne, 1)
      assert.strictEqual(stats.avgTurnOnePlays, 6)
    })

    it('calculates correct average for half turn-one-plays', () => {
      // 15 turn one plays out of 30 cards, hand of 6
      // Average = 6 * 15/30 = 3.0
      const deckCards = [
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `t1-${i}`, cost: 1, type: 'Unit' as const,
        })),
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `big-${i}`, cost: 5, type: 'Unit' as const,
        })),
      ]
      const stats = calculateTurnOneStats(deckCards, leader, base)
      assert.strictEqual(stats.avgTurnOnePlays, 3.0)
    })

    it('probability increases with more turn one plays', () => {
      const makeDeck = (numT1: number) => [
        ...Array.from({ length: numT1 }, (_, i) => ({
          id: `t1-${i}`, cost: 1, type: 'Unit' as const,
        })),
        ...Array.from({ length: 30 - numT1 }, (_, i) => ({
          id: `big-${i}`, cost: 5, type: 'Unit' as const,
        })),
      ]

      const stats5 = calculateTurnOneStats(makeDeck(5), leader, base)
      const stats10 = calculateTurnOneStats(makeDeck(10), leader, base)
      const stats20 = calculateTurnOneStats(makeDeck(20), leader, base)

      assert.ok(stats5.probAtLeastOne < stats10.probAtLeastOne,
        `5 T1 plays (${stats5.probAtLeastOne}) should have lower prob than 10 (${stats10.probAtLeastOne})`)
      assert.ok(stats10.probAtLeastOne < stats20.probAtLeastOne,
        `10 T1 plays (${stats10.probAtLeastOne}) should have lower prob than 20 (${stats20.probAtLeastOne})`)
    })

    it('handles empty deck', () => {
      const stats = calculateTurnOneStats([], leader, base)
      assert.strictEqual(stats.probAtLeastOne, 0)
      assert.strictEqual(stats.avgTurnOnePlays, 0)
    })

    it('handles deck smaller than hand size', () => {
      const deckCards = [
        { id: 't1', cost: 1, type: 'Unit' as const },
        { id: 'big', cost: 5, type: 'Unit' as const },
        { id: 'big2', cost: 5, type: 'Unit' as const },
      ]
      const stats = calculateTurnOneStats(deckCards, leader, base)
      // 3-card deck, 1 turn one play, drawing all 3 = guaranteed
      assert.strictEqual(stats.probAtLeastOne, 1)
    })

    it('accounts for aspect penalties in turn one play count', () => {
      // All cost-1 units but out of aspect = effective cost 3 = not T1 plays
      const deckCards = Array.from({ length: 30 }, (_, i) => ({
        id: `card-${i}`, cost: 1, type: 'Unit' as const, aspects: ['Command'],
      }))
      // Leader/base have Vigilance, card has Command = +2 penalty = effective cost 3
      const stats = calculateTurnOneStats(deckCards, leader, base)
      assert.strictEqual(stats.probAtLeastOne, 0)
      assert.strictEqual(stats.avgTurnOnePlays, 0)
    })
  })
})
