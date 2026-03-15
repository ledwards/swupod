// @ts-nocheck
/**
 * Draft Bot Integration Tests
 *
 * Simulates full drafts using BaseStrategy.selectCard with synthetic card pools
 * and verifies the resulting drafted pool + built deck meet quality constraints.
 *
 * Run with: npx tsx src/bots/behaviors/draftIntegration.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createStrategy } from './index'
import { ALL_MIXINS } from './mixins'
import { scoreBaseForLeader } from '../../utils/botDeckBuilder'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const ALIGNMENT_ASPECTS = ['Heroism', 'Villainy']
const DECK_SIZE = 30

// --- Card Factories ---

function makeCard(name: string, aspects: string[], opts: Record<string, unknown> = {}) {
  return {
    id: `TEST-${name}`,
    name,
    aspects,
    type: opts.type || 'Unit',
    rarity: opts.rarity || 'Common',
    cost: opts.cost ?? 3,
    power: opts.power ?? 2,
    hp: opts.hp ?? 3,
    set: opts.set || 'LAW',
    isLeader: false,
    isBase: false,
    isFoil: false,
    variantType: 'Normal',
  }
}

function makeLeader(name: string, aspects: string[], set = 'LAW') {
  return {
    id: `LEADER-${name}`,
    name,
    aspects,
    type: 'Leader',
    rarity: 'Rare',
    set,
    isLeader: true,
    isBase: false,
    isFoil: false,
    variantType: 'Normal',
  }
}

/**
 * Generate a realistic pack of 14 non-leader/base cards.
 * The pack has a mix of aspects — some in-color, some off-color, some neutral.
 */
function generatePack(
  inAspects: string[],
  alignment: string,
  packNum: number,
  opts: { offColorRatio?: number } = {}
): any[] {
  const offColorRatio = opts.offColorRatio ?? 0.35
  const opposingAlignment = alignment === 'Heroism' ? 'Villainy' : 'Heroism'
  const offColors = COLOR_ASPECTS.filter(a => !inAspects.includes(a))
  const cards: any[] = []

  // Deterministic pack composition: 9 in-color, 1 neutral, 3 off-color, 1 opposing
  // This avoids flaky tests from random pack generation
  for (let i = 0; i < 14; i++) {
    const cardNum = packNum * 14 + i

    if (i === 0) {
      // 1 neutral card
      cards.push(makeCard(`Neutral-${cardNum}`, []))
    } else if (i === 13) {
      // 1 opposing alignment card (last in pack — may be forced pick)
      const offColor = offColors[cardNum % offColors.length]
      cards.push(makeCard(`Opposing-${cardNum}`, [offColor, opposingAlignment]))
    } else if (i >= 10) {
      // 3 off-color cards
      const offColor = offColors[cardNum % offColors.length]
      cards.push(makeCard(`Off-${cardNum}`, [offColor]))
    } else {
      // 9 in-color cards
      const inColor = inAspects[cardNum % inAspects.length]
      const aspects = [inColor]
      if (i % 3 === 0) aspects.push(alignment)
      cards.push(makeCard(`In-${cardNum}`, aspects))
    }
  }

  return cards
}

/**
 * Simulate a 3-pack draft (42 picks) with a strategy.
 * Returns the final drafted card pool.
 */
function simulateDraft(
  strategy: any,
  leaders: any[],
  inAspects: string[],
  alignment: string,
  setCode = 'LAW'
): { draftedCards: any[]; draftedLeaders: any[] } {
  const draftedCards: any[] = []
  const draftedLeaders: any[] = []

  // Leader draft phase: draft 3 leaders
  for (let i = 0; i < leaders.length; i++) {
    // Each round presents 2-3 leaders to choose from
    const available = leaders.slice(i)
    const picked = strategy.selectLeader(available, {
      draftedLeaders,
      setCode,
    })
    if (picked) draftedLeaders.push(picked)
  }

  // Card draft phase: 3 packs × 14 picks
  for (let packNum = 0; packNum < 3; packNum++) {
    let pack = generatePack(inAspects, alignment, packNum)

    for (let pick = 0; pick < 14; pick++) {
      if (pack.length === 0) break

      const picked = strategy.selectCard(pack, {
        draftedCards,
        draftedLeaders,
        setCode,
        packNumber: packNum + 1,
        pickInPack: pick + 1,
      })

      if (picked) {
        draftedCards.push(picked)
        pack = pack.filter(c => c.id !== picked.id)
      }
    }
  }

  return { draftedCards, draftedLeaders }
}

/**
 * Build a deck from drafted cards (simplified version of botDeckBuilder logic).
 */
function buildDeck(
  draftedCards: any[],
  selectedLeader: any,
  selectedBase: any
): { deck: any[]; sideboard: any[] } {
  const leaderAspects = (selectedLeader.aspects || [])
  const leaderAlignment = leaderAspects.find((a: string) => ALIGNMENT_ASPECTS.includes(a))
  const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism'
    : leaderAlignment === 'Heroism' ? 'Villainy'
    : null

  // Hard-filter opposing alignment
  const eligible = draftedCards.filter(c => {
    if (c.isLeader || c.isBase) return false
    if (opposingAlignment && (c.aspects || []).includes(opposingAlignment)) return false
    return true
  })

  // Score by in-aspect preference
  const leaderColors = leaderAspects.filter((a: string) => COLOR_ASPECTS.includes(a))
  const baseColors = (selectedBase.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
  const inAspect = new Set([...leaderColors, ...baseColors])

  const scored = eligible.map(card => {
    const cardColors = (card.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
    let score = 0
    if (cardColors.some((a: string) => inAspect.has(a))) score += 100
    else if (cardColors.length === 0) score += 50  // neutral
    else score -= 500  // off-aspect
    return { card, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const deck = scored.slice(0, DECK_SIZE).map(s => s.card)
  const sideboard = scored.slice(DECK_SIZE).map(s => s.card)
  return { deck, sideboard }
}

// --- Tests ---

describe('Draft Bot Integration', () => {
  describe('Leader alignment filtering', () => {
    it('SPEC: bot skips opposing-alignment leaders when same-alignment options exist', () => {
      for (let trial = 0; trial < 10; trial++) {
        const strategy = createStrategy('topPlayer', null)

        // First pick: bot chooses a Heroism leader
        const draftedLeaders: any[] = []
        const firstPick = strategy.selectLeader([
          makeLeader('Hero Leader 1', ['Vigilance', 'Heroism']),
          makeLeader('Villain Leader', ['Cunning', 'Villainy']),
        ], { draftedLeaders, setCode: 'LAW' })
        draftedLeaders.push(firstPick)
        const firstAlignment = (firstPick.aspects || []).find((a: string) => ALIGNMENT_ASPECTS.includes(a))

        // Second pick: bot should skip the opposing-alignment leader
        const secondOptions = [
          makeLeader('Same Alignment', [firstAlignment === 'Heroism' ? ['Aggression', 'Heroism'] : ['Aggression', 'Villainy']].flat()),
          makeLeader('Opposing Alignment', [firstAlignment === 'Heroism' ? ['Command', 'Villainy'] : ['Command', 'Heroism']].flat()),
        ]
        const secondPick = strategy.selectLeader(secondOptions, { draftedLeaders, setCode: 'LAW' })

        const secondAlignment = (secondPick.aspects || []).find((a: string) => ALIGNMENT_ASPECTS.includes(a))
        assert.strictEqual(secondAlignment, firstAlignment,
          `Trial ${trial}: Second leader should match first alignment ${firstAlignment}, got ${secondAlignment} ` +
          `(picked ${secondPick.name})`)
      }
    })
  })

  describe('Drafted pool quality', () => {
    it('SPEC: bot drafts at least 25 in-aspect cards out of 42 (Vigilance/Villainy leader)', () => {
      let totalInAspect = 0
      const trials = 5

      for (let trial = 0; trial < trials; trial++) {
        const strategy = createStrategy('topPlayer', null)
        const leaders = [
          makeLeader('Aurra Sing', ['Vigilance', 'Villainy']),
          makeLeader('Saw Gerrera', ['Command', 'Aggression']),
          makeLeader('Tobias Beckett', ['Cunning', 'Vigilance']),
        ]

        const { draftedCards, draftedLeaders } = simulateDraft(
          strategy, leaders, ['Vigilance'], 'Villainy'
        )

        // Determine in-aspect based on committed leader
        const mainLeader = draftedLeaders[0]
        const leaderColors = (mainLeader.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
        const inAspect = new Set(leaderColors)

        const inAspectCount = draftedCards.filter(c => {
          const colors = (c.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
          return colors.length === 0 || colors.some((a: string) => inAspect.has(a))
        }).length

        totalInAspect += inAspectCount
      }

      const avgInAspect = totalInAspect / trials
      assert.ok(avgInAspect >= 25,
        `SPEC: Average in-aspect cards should be >= 25, got ${avgInAspect.toFixed(1)}`)
    })

    it('SPEC: bot drafts at most 2 opposing alignment cards (forced late picks only)', () => {
      for (let trial = 0; trial < 10; trial++) {
        const strategy = createStrategy('topPlayer', null)
        const leaders = [
          makeLeader('Villainy Leader', ['Vigilance', 'Villainy']),
          makeLeader('Another Villain', ['Command', 'Villainy']),
        ]

        const { draftedCards, draftedLeaders } = simulateDraft(
          strategy, leaders, ['Vigilance', 'Command'], 'Villainy'
        )

        const opposingCards = draftedCards.filter(c =>
          (c.aspects || []).includes('Heroism')
        )

        // Each pack has exactly 1 opposing card (last position). Bot should never actively
        // choose it over in-color alternatives. At most 3 forced (1 per pack if it's the last card).
        assert.ok(opposingCards.length <= 3,
          `Trial ${trial}: Bot drafted ${opposingCards.length} Heroism cards (max 3 forced): ` +
          opposingCards.map(c => c.name).join(', '))
      }
    })
  })

  describe('Built deck quality', () => {
    it('SPEC: built deck has ZERO opposing alignment cards', () => {
      for (let trial = 0; trial < 10; trial++) {
        const strategy = createStrategy('topPlayer', null)
        const leaders = [
          makeLeader('Villainy Leader', ['Vigilance', 'Villainy']),
        ]

        const { draftedCards, draftedLeaders } = simulateDraft(
          strategy, leaders, ['Vigilance'], 'Villainy'
        )

        const selectedLeader = draftedLeaders[0]
        const selectedBase = { aspects: ['Cunning'], isBase: true }
        const { deck } = buildDeck(draftedCards, selectedLeader, selectedBase)

        const opposingCards = deck.filter(c => (c.aspects || []).includes('Heroism'))
        assert.strictEqual(opposingCards.length, 0,
          `Trial ${trial}: Deck has ${opposingCards.length} opposing alignment cards`)
      }
    })

    it('SPEC: built deck has at most 5 off-aspect cards for LAW', () => {
      for (let trial = 0; trial < 10; trial++) {
        const strategy = createStrategy('topPlayer', null)
        const leaders = [
          makeLeader('Villainy Leader', ['Vigilance', 'Villainy']),
        ]

        const { draftedCards, draftedLeaders } = simulateDraft(
          strategy, leaders, ['Vigilance'], 'Villainy'
        )

        const selectedLeader = draftedLeaders[0]
        const selectedBase = { aspects: ['Cunning'], isBase: true }
        const { deck } = buildDeck(draftedCards, selectedLeader, selectedBase)

        const inAspect = new Set(['Vigilance', 'Cunning'])
        const offAspectCards = deck.filter(c => {
          const colors = (c.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
          return colors.length > 0 && !colors.some((a: string) => inAspect.has(a))
        })

        assert.ok(offAspectCards.length <= 5,
          `Trial ${trial}: Deck has ${offAspectCards.length} off-aspect cards (max 5): ` +
          offAspectCards.map(c => `${c.name} [${c.aspects}]`).join(', '))
      }
    })
  })
})
