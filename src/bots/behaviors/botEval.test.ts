// @ts-nocheck
/**
 * Bot Draft & Deck Building Evaluation Tests
 *
 * Runs complete 8-player drafts entirely in-memory using real card data
 * and real pack generation. Tests every strategy + mixin combination for:
 *
 * DRAFTING EVALS:
 * - Pool has enough in-aspect cards to build a legal deck (≥25 of 42)
 * - Zero opposing alignment cards drafted (except forced last picks)
 * - Color commitment happens and is respected
 *
 * DECK BUILDING EVALS:
 * - Deck is exactly 30 cards
 * - Zero opposing alignment cards in deck
 * - At most 5 off-aspect cards (LAW splash rule)
 * - Base adds a new color (not duplicate of leader)
 * - Deck has ≥25 in-aspect cards
 *
 * Run with: node src/bots/behaviors/botEval.test.ts
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { createStrategy } from './index'
import { ALL_MIXINS, type MixinModifier } from './mixins'
import { generateDraftPacks, getPassDirection, getNextSeat } from '../../utils/draftLogic'
import { getCardsBySet } from '../../utils/cardData'
import { scoreBaseForLeader, getBaseNewColor } from '../../utils/botDeckBuilder'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const ALIGNMENT_ASPECTS = ['Heroism', 'Villainy']
const DECK_SIZE = 30
const MAX_OFF_ASPECT = 5
const PLAYER_COUNT = 8

const ALL_STRATEGIES = [
  'topPlayer', 'tournamentPlayer', 'allPlayer', 'nemesis',
  'diversity', 'primaryColorCorner', 'secondaryAspectCorner',
]

// --- Draft Simulator ---

interface DraftResult {
  playerIndex: number
  strategyName: string
  mixinName: string
  draftedLeaders: any[]
  draftedCards: any[]
}

interface DeckResult {
  leader: any
  base: any
  deck: any[]
  sideboard: any[]
  inAspectColors: string[]
}

/**
 * Run a complete 8-player draft with real pack generation.
 * Each player uses a bot strategy. Returns all players' drafted pools.
 */
function runFullDraft(
  setCode: string,
  strategyConfigs: { name: string; mixin: MixinModifier | null }[]
): DraftResult[] {
  // Generate real packs
  const packsResult = generateDraftPacks(setCode, { playerCount: PLAYER_COUNT })
  const { packs, leaders } = packsResult

  // Create strategies
  const strategies = strategyConfigs.map(c => createStrategy(c.name, c.mixin))

  // Track state per player
  const draftedLeaders: any[][] = Array.from({ length: PLAYER_COUNT }, () => [])
  const draftedCards: any[][] = Array.from({ length: PLAYER_COUNT }, () => [])

  // Leader draft: 3 rounds, pass right each time
  const leaderPools: any[][] = leaders.map(l => [...l])
  for (let round = 0; round < 3; round++) {
    // Each player picks from their current leader pool
    for (let p = 0; p < PLAYER_COUNT; p++) {
      const available = leaderPools[p]
      if (!available || available.length === 0) continue
      const picked = strategies[p].selectLeader(available, {
        draftedLeaders: draftedLeaders[p],
        setCode,
        leaderRound: round + 1,
      })
      if (picked) {
        draftedLeaders[p].push(picked)
        const idx = leaderPools[p].indexOf(picked)
        if (idx >= 0) {
          leaderPools[p].splice(idx, 1)
        } else {
          const matchIdx = leaderPools[p].findIndex(l =>
            l.instanceId ? l.instanceId === picked.instanceId : l.id === picked.id
          )
          if (matchIdx >= 0) leaderPools[p].splice(matchIdx, 1)
        }
      }
    }
    // Pass leader pools to the right (next seat)
    const nextPools = new Array(PLAYER_COUNT)
    for (let p = 0; p < PLAYER_COUNT; p++) {
      const nextSeat = getNextSeat(p + 1, 'right', PLAYER_COUNT) - 1
      nextPools[nextSeat] = leaderPools[p]
    }
    for (let p = 0; p < PLAYER_COUNT; p++) leaderPools[p] = nextPools[p]
  }

  // Card draft: 3 packs × 14 picks with pass direction
  for (let packNum = 0; packNum < 3; packNum++) {
    // Each player starts with their own pack
    let currentPacks: any[][] = packs.map(playerPacks => {
      const pack = playerPacks[packNum]
      return pack ? [...pack.cards] : []
    })

    const direction = getPassDirection(packNum + 1)

    for (let pick = 0; pick < 14; pick++) {
      // Each player picks from current pack
      for (let p = 0; p < PLAYER_COUNT; p++) {
        const available = currentPacks[p]
        if (!available || available.length === 0) continue

        const picked = strategies[p].selectCard(available, {
          draftedCards: draftedCards[p],
          draftedLeaders: draftedLeaders[p],
          setCode,
          packNumber: packNum + 1,
          pickInPack: pick + 1,
        })

        if (picked) {
          draftedCards[p].push(picked)
          // Remove by reference first, fall back to instanceId/id
          const idx = currentPacks[p].indexOf(picked)
          if (idx >= 0) {
            currentPacks[p].splice(idx, 1)
          } else {
            // Fallback: remove by instanceId or id (first match only)
            const matchIdx = currentPacks[p].findIndex(c =>
              c.instanceId ? c.instanceId === picked.instanceId : c.id === picked.id
            )
            if (matchIdx >= 0) currentPacks[p].splice(matchIdx, 1)
          }
        }
      }

      // Pass packs
      const nextPacks = new Array(PLAYER_COUNT)
      for (let p = 0; p < PLAYER_COUNT; p++) {
        const nextSeat = getNextSeat(p + 1, direction, PLAYER_COUNT) - 1
        nextPacks[nextSeat] = currentPacks[p]
      }
      currentPacks = nextPacks
    }
  }

  return strategyConfigs.map((config, i) => ({
    playerIndex: i,
    strategyName: config.name,
    mixinName: config.mixin?.name || 'none',
    draftedLeaders: draftedLeaders[i],
    draftedCards: draftedCards[i],
  }))
}

/**
 * Build a deck from a drafted pool using the real strategy scoring.
 * Mirrors botDeckBuilder.ts logic exactly.
 */
function buildDeck(result: DraftResult, setCode: string): DeckResult {
  const strategy = createStrategy(result.strategyName,
    ALL_MIXINS.find(m => m.name === result.mixinName) || null)

  const selectedLeader = strategy.selectLeader(result.draftedLeaders, { setCode })
  assert.ok(selectedLeader, `${result.strategyName}: must select a leader`)

  // Select base
  const allSetCards = getCardsBySet(setCode)
  const commonBases = allSetCards.filter(c => c.isBase && c.rarity === 'Common' && c.variantType === 'Normal')
  const leaderAspects: string[] = selectedLeader.aspects || []
  const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))

  const validBases = commonBases.filter(base =>
    scoreBaseForLeader(leaderAspects, base.aspects || []) > 0
  )
  const selectedBase = validBases.length > 0
    ? validBases[Math.floor(Math.random() * validBases.length)]
    : commonBases[Math.floor(Math.random() * commonBases.length)]

  assert.ok(selectedBase, `${result.strategyName}: must select a base`)

  const baseColors = (selectedBase.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
  const inAspectColors = [...new Set([...leaderColors, ...baseColors])]

  // Set committed state for scoring
  strategy.committedLeader = selectedLeader
  strategy.committedBaseColor = getBaseNewColor(selectedLeader, selectedBase)

  // Filter opposing alignment
  const leaderAlignment = leaderAspects.find(a => a === 'Heroism' || a === 'Villainy')
  const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism'
    : leaderAlignment === 'Heroism' ? 'Villainy' : null

  const scoredCards = result.draftedCards
    .filter(c => {
      if (c.isLeader || c.isBase) return false
      if (opposingAlignment && (c.aspects || []).includes(opposingAlignment)) return false
      return true
    })
    .map(card => ({
      card,
      score: strategy._scoreCard(card, [selectedLeader], result.draftedCards, 42, null, { setCode }),
    }))
    .sort((a, b) => b.score - a.score)

  // Build deck with hard off-aspect cap
  const deck: any[] = []
  const sideboard: any[] = []
  let offAspectInDeck = 0

  for (const { card } of scoredCards) {
    const cardColors = (card.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
    const isOffAspect = cardColors.length > 0 && !cardColors.some((a: string) => inAspectColors.includes(a))

    if (deck.length < DECK_SIZE) {
      if (isOffAspect && offAspectInDeck >= MAX_OFF_ASPECT) {
        sideboard.push(card)
      } else {
        deck.push(card)
        if (isOffAspect) offAspectInDeck++
      }
    } else {
      sideboard.push(card)
    }
  }

  return { leader: selectedLeader, base: selectedBase, deck, sideboard, inAspectColors }
}

// --- Helpers ---

function getOpposingAlignment(aspects: string[]): string | null {
  const alignment = aspects.find(a => ALIGNMENT_ASPECTS.includes(a))
  if (!alignment) return null
  return alignment === 'Villainy' ? 'Heroism' : 'Villainy'
}

function countOffAspect(cards: any[], inAspectColors: string[]): number {
  return cards.filter(c => {
    const colors = (c.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
    return colors.length > 0 && !colors.some((a: string) => inAspectColors.includes(a))
  }).length
}

function countInAspect(cards: any[], inAspectColors: string[]): number {
  return cards.filter(c => {
    const colors = (c.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
    return colors.length === 0 || colors.some((a: string) => inAspectColors.includes(a))
  }).length
}

// --- Tests ---

describe('Bot Draft Evaluation (real cards, real packs)', () => {
  // Run multiple full drafts across all strategies
  const TRIALS = 3
  const SET_CODE = 'LAW'

  // Collect all results across trials
  const allDraftResults: DraftResult[] = []
  const allDeckResults: { draft: DraftResult; deck: DeckResult }[] = []

  before(() => {
    for (let trial = 0; trial < TRIALS; trial++) {
      // Assign one strategy per seat, cycling mixins
      const configs = ALL_STRATEGIES.map((name, i) => ({
        name,
        mixin: ALL_MIXINS[i % ALL_MIXINS.length],
      }))
      // Fill remaining seat
      configs.push({ name: 'allPlayer', mixin: ALL_MIXINS[0] })

      const results = runFullDraft(SET_CODE, configs)
      allDraftResults.push(...results)

      for (const result of results) {
        const deck = buildDeck(result, SET_CODE)
        allDeckResults.push({ draft: result, deck })
      }
    }
  })

  // === DRAFTING EVALS ===

  describe('Drafting: pool composition', () => {
    it('SPEC: every bot drafts exactly 42 non-leader cards', () => {
      for (const result of allDraftResults) {
        const nonLeaderCards = result.draftedCards.filter(c => !c.isLeader && !c.isBase)
        assert.strictEqual(nonLeaderCards.length, 42,
          `${result.strategyName}/${result.mixinName}: drafted ${nonLeaderCards.length} cards (expected 42)`)
      }
    })

    it('SPEC: every bot drafts exactly 3 leaders', () => {
      for (const result of allDraftResults) {
        assert.strictEqual(result.draftedLeaders.length, 3,
          `${result.strategyName}/${result.mixinName}: drafted ${result.draftedLeaders.length} leaders (expected 3)`)
      }
    })

    it('SPEC: pool has enough in-aspect cards to build a 30-card deck (≥25 in-aspect)', () => {
      for (const { draft, deck } of allDeckResults) {
        const nonLeaderCards = draft.draftedCards.filter(c => !c.isLeader && !c.isBase)
        const inAspect = countInAspect(nonLeaderCards, deck.inAspectColors)
        assert.ok(inAspect >= 25,
          `${draft.strategyName}/${draft.mixinName}: only ${inAspect}/42 in-aspect cards ` +
          `(need ≥25 for a legal 30-card deck). Colors: ${deck.inAspectColors.join(', ')}`)
      }
    })

    it('SPEC: at most 3 opposing alignment cards in pool (forced last picks only)', () => {
      for (const { draft, deck } of allDeckResults) {
        const opposing = getOpposingAlignment(deck.leader.aspects || [])
        if (!opposing) continue
        const opposingCards = draft.draftedCards.filter(c =>
          (c.aspects || []).includes(opposing)
        )
        assert.ok(opposingCards.length <= 3,
          `${draft.strategyName}/${draft.mixinName}: ${opposingCards.length} opposing alignment cards ` +
          `in pool (max 3 forced). Cards: ${opposingCards.map(c => c.name).join(', ')}`)
      }
    })

    it('SPEC: all drafted leaders share the same alignment', () => {
      for (const result of allDraftResults) {
        const alignments = result.draftedLeaders
          .map(l => (l.aspects || []).find((a: string) => ALIGNMENT_ASPECTS.includes(a)))
          .filter(Boolean)
        if (alignments.length <= 1) continue
        const first = alignments[0]
        for (let i = 1; i < alignments.length; i++) {
          assert.strictEqual(alignments[i], first,
            `${result.strategyName}/${result.mixinName}: leaders have mixed alignments ` +
            `${alignments.join(', ')} — leaders: ${result.draftedLeaders.map(l => l.name).join(', ')}`)
        }
      }
    })
  })

  // === DECK BUILDING EVALS ===

  describe('Deck building: legality', () => {
    it('SPEC: deck is exactly 30 cards', () => {
      for (const { draft, deck } of allDeckResults) {
        assert.strictEqual(deck.deck.length, DECK_SIZE,
          `${draft.strategyName}/${draft.mixinName}: deck has ${deck.deck.length} cards (expected ${DECK_SIZE})`)
      }
    })

    it('SPEC: zero opposing alignment cards in deck', () => {
      for (const { draft, deck } of allDeckResults) {
        const opposing = getOpposingAlignment(deck.leader.aspects || [])
        if (!opposing) continue
        const opposingCards = deck.deck.filter(c => (c.aspects || []).includes(opposing))
        assert.strictEqual(opposingCards.length, 0,
          `${draft.strategyName}/${draft.mixinName}: deck has ${opposingCards.length} ` +
          `${opposing} cards — ${opposingCards.map(c => c.name).join(', ')}`)
      }
    })

    it('SPEC: at most 5 off-aspect cards in deck (LAW splash rule)', () => {
      for (const { draft, deck } of allDeckResults) {
        const offAspect = countOffAspect(deck.deck, deck.inAspectColors)
        assert.ok(offAspect <= MAX_OFF_ASPECT,
          `${draft.strategyName}/${draft.mixinName}: deck has ${offAspect} off-aspect cards ` +
          `(max ${MAX_OFF_ASPECT}). Colors: ${deck.inAspectColors.join(', ')}`)
      }
    })

    it('SPEC: base adds a new color not on the leader', () => {
      for (const { draft, deck } of allDeckResults) {
        const leaderColors = (deck.leader.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
        const baseColors = (deck.base.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
        const newColors = baseColors.filter((c: string) => !leaderColors.includes(c))
        assert.ok(newColors.length > 0,
          `${draft.strategyName}/${draft.mixinName}: base ${deck.base.name} ` +
          `[${baseColors.join(',')}] doesn't add new color to leader [${leaderColors.join(',')}]`)
      }
    })

    it('SPEC: deck has at least 25 in-aspect cards', () => {
      for (const { draft, deck } of allDeckResults) {
        const inAspect = countInAspect(deck.deck, deck.inAspectColors)
        assert.ok(inAspect >= 25,
          `${draft.strategyName}/${draft.mixinName}: deck has only ${inAspect}/30 ` +
          `in-aspect cards (need ≥25). Colors: ${deck.inAspectColors.join(', ')}`)
      }
    })
  })

  // === STRATEGY-SPECIFIC EVALS ===

  describe('Strategy adherence', () => {
    it('SPEC: committed leader colors match majority of drafted cards', () => {
      for (const { draft, deck } of allDeckResults) {
        const leaderColors = (deck.leader.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
        const nonLeaderCards = draft.draftedCards.filter(c => !c.isLeader && !c.isBase)

        // Count cards matching at least one leader color
        const matchingCards = nonLeaderCards.filter(c => {
          const colors = (c.aspects || []).filter((a: string) => COLOR_ASPECTS.includes(a))
          return colors.length === 0 || colors.some((a: string) => leaderColors.includes(a))
        })

        // Leader colors should match at least 50% of the pool (leader colors alone, before base)
        const matchRatio = matchingCards.length / nonLeaderCards.length
        assert.ok(matchRatio >= 0.5,
          `${draft.strategyName}/${draft.mixinName}: only ${(matchRatio * 100).toFixed(0)}% of pool ` +
          `matches leader colors ${leaderColors.join(',')} (need ≥50%)`)
      }
    })

    it('SPEC: diversity strategy has cards from at least 3 color aspects', () => {
      const diversityResults = allDeckResults.filter(r => r.draft.strategyName === 'diversity')
      for (const { draft, deck } of diversityResults) {
        const colorsInDeck = new Set<string>()
        for (const card of deck.deck) {
          for (const aspect of (card.aspects || [])) {
            if (COLOR_ASPECTS.includes(aspect)) colorsInDeck.add(aspect)
          }
        }
        assert.ok(colorsInDeck.size >= 3,
          `diversity/${draft.mixinName}: deck only has ${colorsInDeck.size} colors ` +
          `(${[...colorsInDeck].join(', ')}) — diversity should have ≥3`)
      }
    })

    it('SPEC: primaryColorCorner commits early and has strong color focus', () => {
      const cornerResults = allDeckResults.filter(r => r.draft.strategyName === 'primaryColorCorner')
      for (const { draft, deck } of cornerResults) {
        // Primary color corner should have very focused pools
        const inAspect = countInAspect(deck.deck, deck.inAspectColors)
        assert.ok(inAspect >= 27,
          `primaryColorCorner/${draft.mixinName}: only ${inAspect}/30 in-aspect (expected ≥27 for focused strategy)`)
      }
    })
  })

  // === AGGREGATE STATS ===

  describe('Aggregate statistics', () => {
    it('INFO: print eval summary', () => {
      const byStrategy = new Map<string, { inAspect: number[]; offAspect: number[]; deckSize: number[] }>()

      for (const { draft, deck } of allDeckResults) {
        if (!byStrategy.has(draft.strategyName)) {
          byStrategy.set(draft.strategyName, { inAspect: [], offAspect: [], deckSize: [] })
        }
        const stats = byStrategy.get(draft.strategyName)!
        stats.inAspect.push(countInAspect(deck.deck, deck.inAspectColors))
        stats.offAspect.push(countOffAspect(deck.deck, deck.inAspectColors))
        stats.deckSize.push(deck.deck.length)
      }

      console.log('\n  === BOT EVAL SUMMARY ===\n')
      console.log('  Strategy               | Deck Size | In-Aspect | Off-Aspect')
      console.log('  -----------------------|-----------|-----------|----------')

      for (const [strategy, stats] of byStrategy) {
        const avgInAspect = (stats.inAspect.reduce((a, b) => a + b, 0) / stats.inAspect.length).toFixed(1)
        const avgOffAspect = (stats.offAspect.reduce((a, b) => a + b, 0) / stats.offAspect.length).toFixed(1)
        const avgDeckSize = (stats.deckSize.reduce((a, b) => a + b, 0) / stats.deckSize.length).toFixed(1)
        const name = strategy.padEnd(23)
        console.log(`  ${name}| ${avgDeckSize.padStart(9)} | ${avgInAspect.padStart(9)} | ${avgOffAspect.padStart(9)}`)
      }

      console.log(`\n  Total evals: ${allDeckResults.length} (${TRIALS} drafts × ${PLAYER_COUNT} players)`)
      assert.ok(true) // Always passes — info only
    })
  })
})
