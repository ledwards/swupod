/**
 * Full-table draft simulation with REAL packs.
 *
 * Eight strategy bots run a complete leader draft (3 rounds, passing right)
 * and a pack draft (3 × 14 picks, left/right/left) on packs from the real
 * generator, then build decks with the production deck constructor. Math.random
 * is swapped for a seeded mulberry32 so every run is reproducible.
 *
 * Run with: npx tsx --test src/bots/behaviors/fullDraftSim.test.ts
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { generateDraftPacks, getNextSeat, getPassDirection, getLeaderPassDirection } from '../../utils/draftLogic'
import { constructBotDeck } from '../../utils/botDeckConstruction'
import { assignStrategies, createStrategy } from './index'
import { cardIdentityKey } from './BaseStrategy'
import { initializeCardCache } from '../../utils/cardCache'

await initializeCardCache()

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const SEATS = 8

function mulberry32(seed: number) {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const originalRandom = Math.random
const originalLog = console.log
function withSeed<T>(seed: number, fn: () => T): T {
  Math.random = mulberry32(seed)
  try { return fn() } finally { Math.random = originalRandom }
}

const leaderLabel = (l) => l.subtitle ? `${l.name}, ${l.subtitle}` : l.name

/** Run one full 8-bot draft. Returns per-seat results plus avoidable duplicate leader picks. */
function simulateDraft(setCode: string, seed: number) {
  return withSeed(seed, () => {
    const { packs, leaders } = generateDraftPacks(setCode, SEATS)
    const seatIds = Array.from({ length: SEATS }, (_, i) => `bot-${i + 1}`)
    const strategies = assignStrategies(seatIds, false)
    const seats = seatIds.map((id) => ({
      id,
      strategy: strategies.get(id),
      draftedLeaders: [],
      draftedCards: [],
    }))

    // --- Leader draft ---
    let leaderHands = leaders.map(hand => [...hand])
    const avoidableDuplicates = []
    const avoidableHoards = []
    for (let round = 1; leaderHands.some(h => h.length > 0); round++) {
      const nextHands = Array.from({ length: SEATS }, () => [])
      seats.forEach((seat, i) => {
        const hand = leaderHands[i]
        if (hand.length === 0) return
        const pick = seat.strategy.selectLeader(hand, {
          draftedLeaders: seat.draftedLeaders,
          setCode,
          leaderRound: round,
        })
        const owned = new Set(seat.draftedLeaders.map(cardIdentityKey))
        if (owned.has(cardIdentityKey(pick)) && hand.some(l => !owned.has(cardIdentityKey(l)))) {
          avoidableDuplicates.push({ seat: seat.id, round, leader: leaderLabel(pick), hand: hand.map(leaderLabel) })
        }
        seat.draftedLeaders.push(pick)
        const rest = hand.filter(l => l !== pick)
        const next = getNextSeat(i + 1, getLeaderPassDirection(round), SEATS) - 1
        nextHands[next] = rest
      })
      leaderHands = nextHands
    }

    // --- Pack draft ---
    for (let packNumber = 1; packNumber <= packs[0].length; packNumber++) {
      let hands = packs.map(p => [...p[packNumber - 1].cards])
      for (let pickInPack = 1; hands.some(h => h.length > 0); pickInPack++) {
        const nextHands = Array.from({ length: SEATS }, () => [])
        seats.forEach((seat, i) => {
          const hand = hands[i]
          if (hand.length === 0) return
          const pick = seat.strategy.selectCard(hand, {
            draftedCards: seat.draftedCards,
            draftedLeaders: seat.draftedLeaders,
            setCode,
            packNumber,
            pickInPack,
          })
          const copiesOf = (card) => seat.draftedCards.filter(c => cardIdentityKey(c) === cardIdentityKey(card)).length
          if (copiesOf(pick) >= 3 && hand.some(c => copiesOf(c) < 3)) {
            avoidableHoards.push(`${setCode}/${seed} ${seat.id} took copy #${copiesOf(pick) + 1} of ${pick.name} (pick ${pickInPack} of pack ${packNumber})`)
          }
          seat.draftedCards.push(pick)
          const next = getNextSeat(i + 1, getPassDirection(packNumber), SEATS) - 1
          nextHands[next] = hand.filter(c => c !== pick)
        })
        hands = nextHands
      }
    }

    // --- Deck build (production constructor) ---
    const results = seats.map(seat => {
      const deck = constructBotDeck({
        drafted_leaders: seat.draftedLeaders,
        drafted_cards: seat.draftedCards,
        strategy_name: seat.strategy.strategyName,
        mixin_name: seat.strategy.mixin?.name,
        committed_leader: seat.strategy.committedLeader,
        committed_base_color: seat.strategy.committedBaseColor,
      }, setCode)
      return { ...seat, deck, metrics: deckMetrics(deck) }
    })
    return { results, avoidableDuplicates, avoidableHoards }
  })
}

function deckMetrics(deck) {
  const legal = new Set([...(deck.selectedLeader.aspects || []), ...(deck.selectedBase.aspects || [])])
  const colorCounts = Object.fromEntries(COLOR_ASPECTS.map(c => [c, 0]))
  let offAspect = 0
  let units = 0
  let totalCost = 0
  const curve = [0, 0, 0, 0, 0, 0, 0, 0]
  for (const card of deck.deckCards) {
    const aspects = card.aspects || []
    for (const a of aspects) if (a in colorCounts) colorCounts[a]++
    if (aspects.some(a => !legal.has(a))) offAspect++
    if (card.type === 'Unit') units++
    totalCost += card.cost || 0
    curve[Math.min(card.cost || 0, 7)]++
  }
  const colored = Object.values(colorCounts).reduce((s, n) => s + n, 0) || 1
  const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1])
  const top2Share = (sorted[0][1] + sorted[1][1]) / colored
  // "Main" aspects: colors carried by at least a fifth of the deck's colored card-aspects.
  const mainAspects = sorted.filter(([, n]) => n / colored >= 0.2).map(([c]) => c)
  return {
    leader: leaderLabel(deck.selectedLeader),
    leaderAspects: deck.selectedLeader.aspects,
    base: (deck.selectedBase.aspects || []).join('/'),
    mainAspects,
    top2Share,
    offAspect,
    units,
    avgCost: totalCost / deck.deckCards.length,
    curve,
    deckSize: deck.deckCards.length,
  }
}

function duplicateCopies(cards) {
  const counts = new Map()
  for (const c of cards) counts.set(cardIdentityKey(c), (counts.get(cardIdentityKey(c)) || 0) + 1)
  return counts
}

const SETS = ['SOR', 'LAW', 'HMW']
const SEEDS = [11, 23, 47, 101]

describe('Full 8-bot draft with real packs', () => {
  before(() => { console.log = () => {} })
  after(() => { console.log = originalLog })

  const runs = []
  for (const setCode of SETS) {
    for (const seed of SEEDS) {
      runs.push({ setCode, seed, ...simulateDraft(setCode, seed) })
    }
  }

  it('no bot drafts a leader it already owns when another leader was on offer', () => {
    const dupes = runs.flatMap(r => r.avoidableDuplicates.map(d => ({ set: r.setCode, seed: r.seed, ...d })))
    assert.deepStrictEqual(dupes, [], `avoidable duplicate leader picks:\n${JSON.stringify(dupes, null, 2)}`)
  })

  it('every bot builds a 30-card deck around one of its drafted leaders', () => {
    for (const run of runs) {
      for (const seat of run.results) {
        assert.ok(seat.deck, `${run.setCode}/${run.seed} ${seat.id} built no deck`)
        assert.strictEqual(seat.deck.deckCards.length, 30)
        assert.ok(seat.draftedLeaders.some(l => l.instanceId === seat.deck.selectedLeader.instanceId), 'deck leader must be one of the drafted leaders')
      }
    }
  })

  it('decks settle into the leader + base colors (two main aspects for one-color leaders) and stay on-aspect', () => {
    const bad = []
    for (const run of runs) {
      for (const seat of run.results) {
        const m = seat.metrics
        // A one-color leader + base is a two-color deck. A two-color leader
        // with a third-color base can legitimately run three.
        const leaderColors = (seat.deck.selectedLeader.aspects || []).filter(a => COLOR_ASPECTS.includes(a))
        const allowed = new Set([...leaderColors, ...(seat.deck.selectedBase.aspects || [])])
        const maxMain = leaderColors.length >= 2 ? 3 : 2
        if (m.mainAspects.length > maxMain || m.mainAspects.some(a => !allowed.has(a)) || m.offAspect > 5) {
          bad.push(`${run.setCode}/${run.seed} ${seat.id} ${m.leader}: main=${m.mainAspects.join('+')} off=${m.offAspect}`)
        }
      }
    }
    assert.deepStrictEqual(bad, [])
  })

  it('decks have a playable curve', () => {
    const bad = []
    for (const run of runs) {
      for (const seat of run.results) {
        const m = seat.metrics
        const early = m.curve[1] + m.curve[2]
        if (m.units < 12 || m.avgCost < 2 || m.avgCost > 4.5 || early < 5) {
          bad.push(`${run.setCode}/${run.seed} ${seat.id}: units=${m.units} avg=${m.avgCost.toFixed(2)} 1-2 drops=${early}`)
        }
      }
    }
    assert.deepStrictEqual(bad, [])
  })

  it('bots never take a 4th copy while anything else is in the pack, and decks run at most 3', () => {
    const bad = runs.flatMap(r => r.avoidableHoards)
    for (const run of runs) {
      for (const seat of run.results) {
        for (const [key, n] of duplicateCopies(seat.deck.deckCards)) {
          if (n > 3) bad.push(`${run.setCode}/${run.seed} ${seat.id} deck: ${n}× ${key}`)
        }
      }
    }
    assert.deepStrictEqual(bad, [])
  })

  it('prints a summary', () => {
    console.log = originalLog
    for (const run of runs) {
      console.log(`--- ${run.setCode} seed ${run.seed}`)
      for (const seat of run.results) {
        const m = seat.metrics
        console.log(`  ${seat.id} [${seat.strategy.strategyName}] leaders: ${seat.draftedLeaders.map(leaderLabel).join(' | ')}`
          + `\n      deck: ${m.leader} + ${m.base} base; main=${m.mainAspects.join('+')} top2=${(m.top2Share * 100).toFixed(0)}% off=${m.offAspect} units=${m.units} avg=${m.avgCost.toFixed(2)}`)
      }
    }
    console.log = () => {}
  })
})

describe('Leader pick: no duplicate identities', () => {
  it('a bot holding Sabine passes a second Sabine (other printing) for another leader', () => {
    const sabine = { id: 'SOR-010', name: 'Sabine Wren', subtitle: 'Galvanized Revolutionary', aspects: ['Aggression', 'Heroism'], isLeader: true, set: 'SOR' }
    const sabineHyperspace = { ...sabine, id: 'SOR-279', variantType: 'Hyperspace', instanceId: 'x_1' }
    const other = { id: 'SOR-006', name: 'Leia Organa', subtitle: 'Alliance General', aspects: ['Command', 'Heroism'], isLeader: true, set: 'SOR' }
    for (const name of ['topPlayer', 'tournamentPlayer', 'allPlayer', 'nemesis', 'diversity', 'primaryColorCorner', 'secondaryAspectCorner']) {
      const strategy = createStrategy(name, null)
      const pick = strategy.selectLeader([sabineHyperspace, other], { draftedLeaders: [sabine], setCode: 'SOR', leaderRound: 2 })
      assert.strictEqual(pick.name, 'Leia Organa', `${name} re-drafted Sabine`)
    }
  })

  it('still takes the duplicate when it is the only leader left', () => {
    const sabine = { id: 'SOR-010', name: 'Sabine Wren', subtitle: 'Galvanized Revolutionary', aspects: ['Aggression', 'Heroism'], isLeader: true, set: 'SOR' }
    const pick = createStrategy('topPlayer', null).selectLeader([{ ...sabine, instanceId: 'y' }], { draftedLeaders: [sabine], setCode: 'SOR', leaderRound: 3 })
    assert.strictEqual(pick.name, 'Sabine Wren')
  })
})

describe('Pack pick: duplicate copies lose value', () => {
  const leader = { id: 'L', name: 'Leia Organa', subtitle: 'Alliance General', aspects: ['Command', 'Heroism'], isLeader: true, set: 'SOR' }
  const unit = (name, unique) => ({ id: name, name, aspects: ['Command'], type: 'Unit', rarity: 'Rare', cost: 3, unique, set: 'SOR' })

  it('a second copy of a unique card scores well below a fresh card of the same quality', () => {
    const strategy = createStrategy('topPlayer', null)
    strategy.committedLeader = leader
    const owned = unit('Admiral Ackbar', true)
    const second = { ...owned, id: 'dup' }
    const fresh = unit('Mon Mothma', true)
    const ctx = { setCode: 'SOR' }
    const dupScore = strategy._scoreCard(second, [leader], [owned], 10, null, ctx)
    const freshScore = strategy._scoreCard(fresh, [leader], [owned], 10, null, ctx)
    assert.ok(freshScore - dupScore >= 40, `fresh ${freshScore} vs duplicate ${dupScore}`)
  })

  it('a fourth copy of anything is never worth it while another playable is there', () => {
    const strategy = createStrategy('topPlayer', null)
    strategy.committedLeader = leader
    const common = { ...unit('Alliance Dispatcher', false), rarity: 'Common' }
    const pool = [common, { ...common }, { ...common }]
    const pick = strategy.selectCard([{ ...common, id: 'fourth' }, { ...unit('Rebel Pathfinder', false), rarity: 'Common' }], { draftedCards: pool, draftedLeaders: [leader], setCode: 'SOR' })
    assert.strictEqual(pick.name, 'Rebel Pathfinder')
  })
})
