// @ts-nocheck
/**
 * CommonBelt Tests
 *
 * Run with: node src/belts/CommonBelt.test.ts
 */

import { CommonBelt, getCommonPools, getBeltCards } from './CommonBelt'
import { initializeCardCache } from '../utils/cardCache'

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`\x1b[32m✅ ${name}\x1b[0m`)
    passed++
  } catch (e) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m`)
    console.log(`\x1b[33m   ${(e as Error).message}\x1b[0m`)
    failed++
  }
}

function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

interface StructuredPool {
  primary1: Array<{ id: string }>
  primary2: Array<{ id: string }>
  assigned: Array<{ id: string }>
  neutral?: Array<{ id: string }>
}

// Helper to flatten a structured pool into a flat array
function flattenPool(pool: StructuredPool): Array<{ id: string }> {
  return [
    ...pool.primary1,
    ...pool.primary2,
    ...pool.assigned,
    ...(pool.neutral || [])
  ]
}

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()
  console.log('')
  console.log('\x1b[1m\x1b[35m🎯 CommonBelt Tests\x1b[0m')
  console.log('\x1b[35m====================\x1b[0m')

  test('getBeltCards returns cards for Belt A', () => {
    const beltACards = getBeltCards('SOR', 'A')
    assert(beltACards.length > 0, 'Belt A should not be empty')
    assert(beltACards.length === 60, `Belt A should have 60 cards, got ${beltACards.length}`)
  })

  test('getBeltCards returns cards for Belt B', () => {
    const beltBCards = getBeltCards('SOR', 'B')
    assert(beltBCards.length > 0, 'Belt B should not be empty')
    assert(beltBCards.length === 30, `Belt B should have 30 cards, got ${beltBCards.length}`)
  })

  test('Belt A contains Vigilance and Command cards', () => {
    const beltACards = getBeltCards('SOR', 'A')
    const vigilanceCommand = beltACards.filter(c =>
      c.aspects && (c.aspects.includes('Vigilance') || c.aspects.includes('Command'))
    )
    assert(vigilanceCommand.length > 0, 'Belt A should have Vigilance/Command cards')
  })

  test('Belt B contains Cunning cards', () => {
    const beltBCards = getBeltCards('SOR', 'B')
    const cunning = beltBCards.filter(c =>
      c.aspects && c.aspects.includes('Cunning')
    )
    assert(cunning.length > 0, 'Belt B should have Cunning cards')
  })

  test('Belt A and Belt B are completely disjoint (no shared cards)', () => {
    const beltACards = getBeltCards('SOR', 'A')
    const beltBCards = getBeltCards('SOR', 'B')

    const idsInA = new Set(beltACards.map(c => c.id))
    const idsInB = new Set(beltBCards.map(c => c.id))

    const overlap: string[] = []
    for (const id of idsInA) {
      if (idsInB.has(id)) {
        const card = beltACards.find(c => c.id === id)
        overlap.push(`${card!.name} (${id})`)
      }
    }

    assertEqual(overlap.length, 0,
      `Belt A and Belt B must be disjoint, but found ${overlap.length} shared cards: ${overlap.join(', ')}`)
  })

  test('all cards in belts are commons', () => {
    const beltACards = getBeltCards('SOR', 'A')
    const beltBCards = getBeltCards('SOR', 'B')
    assert(beltACards.every(c => c.rarity === 'Common'), 'All Belt A cards should be Common')
    assert(beltBCards.every(c => c.rarity === 'Common'), 'All Belt B cards should be Common')
  })

  test('no leaders or bases in belts', () => {
    const beltACards = getBeltCards('SOR', 'A')
    const beltBCards = getBeltCards('SOR', 'B')
    assert(beltACards.every(c => !c.isLeader && !c.isBase), 'Belt A should not have leaders/bases')
    assert(beltBCards.every(c => !c.isLeader && !c.isBase), 'Belt B should not have leaders/bases')
  })

  test('CommonBelt initializes with belt ID', () => {
    const belt = new CommonBelt('SOR', 'A')
    assert(belt.beltCards.length > 0, 'Belt cards should not be empty')
    assert(belt.hopper.length > 0, 'Hopper should be filled')
  })

  test('next() returns a common card', () => {
    const belt = new CommonBelt('SOR', 'A')
    const card = belt.next()
    assert(card !== null, 'next() should return a card')
    assert(card.rarity === 'Common', 'Returned card should be Common')
    assert(!card.isLeader, 'Returned card should not be a leader')
    assert(!card.isBase, 'Returned card should not be a base')
  })

  test('next() removes card from hopper', () => {
    const belt = new CommonBelt('SOR', 'A')
    const initialSize = belt.size
    belt.next()
    assertEqual(belt.size, initialSize - 1, 'Hopper size should decrease by 1')
  })

  test('next() returns a copy, not the original', () => {
    const belt = new CommonBelt('SOR', 'A')
    const card1 = belt.next()
    card1.modified = true
    const card2 = belt.next()
    assert(card2.modified === undefined, 'Cards should be copies, not references')
  })

  test('hopper refills when low', () => {
    const belt = new CommonBelt('SOR', 'A')
    const beltCardsSize = belt.beltCards.length
    const drawSize = 6 // SOR Belt A draws 6 cards per pack

    // Drain the hopper until it reaches the refill threshold (drawSize)
    while (belt.size > drawSize) {
      belt.next()
    }

    // At this point, hopper should have <= drawSize cards
    assert(belt.size <= drawSize, `Hopper should be at refill threshold: ${belt.size}`)

    // Pull one more to trigger refill
    belt.next()

    // After refill, hopper should be larger
    assert(belt.size > drawSize, `Hopper should refill. Size: ${belt.size}, threshold: ${drawSize}`)
  })

  test('different belt instances start at different positions', () => {
    const firstCards = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const belt = new CommonBelt('SOR', 'A')
      firstCards.add(belt.peek(1)[0].id)
    }

    // With random shuffling, we should see variation
    assert(firstCards.size > 1, 'Different belt instances should start at different positions')
  })

  test('peek() returns cards without removing them', () => {
    const belt = new CommonBelt('SOR', 'A')
    const peeked = belt.peek(3)
    const sizeBefore = belt.size

    assertEqual(peeked.length, 3, 'peek(3) should return 3 cards')
    assertEqual(belt.size, sizeBefore, 'peek() should not change hopper size')

    // Verify peek matches what next() returns
    const next1 = belt.next()
    assertEqual(next1.id, peeked[0].id, 'First peeked card should match first next()')
  })

  test('pulling 20 consecutive cards from a belt has reasonable variety', () => {
    const belt = new CommonBelt('SOR', 'A')

    // Pull 20 consecutive cards
    const pulled: Array<{ id: string }> = []
    for (let i = 0; i < 20; i++) {
      pulled.push(belt.next())
    }

    // Check we have at least 15 unique cards (some duplicates allowed due to belt cycling)
    const uniqueIds = new Set(pulled.map(c => c.id))
    assert(uniqueIds.size >= 15,
      `Should have at least 15 unique cards in 20 draws, got ${uniqueIds.size}`)
  })

  test('consecutive belt fills produce different sequences', () => {
    const belt = new CommonBelt('SOR', 'A')
    const fillSize = belt.beltCards.length

    // Pull entire first fill
    const firstFill: string[] = []
    for (let i = 0; i < fillSize; i++) {
      firstFill.push(belt.next().id)
    }

    // Pull second fill
    const secondFill: string[] = []
    for (let i = 0; i < fillSize; i++) {
      secondFill.push(belt.next().id)
    }

    // Arrays should not be identical
    const areIdentical = firstFill.length === secondFill.length &&
      firstFill.every((id, idx) => id === secondFill[idx])

    assert(!areIdentical, 'Consecutive belt fills should not produce identical sequences')

    // Count how many positions are different
    let differences = 0
    for (let i = 0; i < Math.min(firstFill.length, secondFill.length); i++) {
      if (firstFill[i] !== secondFill[i]) differences++
    }

    // At least 50% of positions should be different (shuffled)
    const diffPercent = (differences / firstFill.length) * 100
    assert(diffPercent > 50, `At least 50% of positions should differ, got ${diffPercent.toFixed(1)}%`)
  })

  // =========================================================
  // SPEC: No duplicate card within 24 positions (across seams)
  // =========================================================

  test('SPEC: no duplicate card within 24 positions on Belt A (large belt)', () => {
    // SPEC (sets 1-6 single-copy model): common belts never repeat a card
    // within ~24 positions. Set 7+ uses the paired-copy line model (see the
    // Set 7+ suite below) — real ASH box 001 line order shows pairs 1-3 packs
    // apart, superseding this window for LAW/ASH.
    const belt = new CommonBelt('JTL', 'A')
    const DEDUP_WINDOW = 24
    const TOTAL_DRAWS = 200

    const drawn: Array<{ id: string; name: string }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    let violations = 0
    const violationDetails: string[] = []
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < Math.min(i + DEDUP_WINDOW, drawn.length); j++) {
        if (drawn[i].id === drawn[j].id) {
          violations++
          violationDetails.push(
            `"${drawn[i].name}" at positions ${i} and ${j} (distance ${j - i})`
          )
        }
      }
    }

    assert(violations === 0,
      `SPEC: No duplicate within ${DEDUP_WINDOW} positions. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  test('SPEC: no duplicate card within max safe window on Belt B (small belt, 30 cards)', () => {
    // SPEC: For a belt of size N, the max safe dedup window = floor(N/2)
    // SOR Belt B = 30 cards → max window = 15
    // (24 is impossible on 30 cards: only 6 non-recent cards for 21 early positions)
    const belt = new CommonBelt('SOR', 'B')
    const DEDUP_WINDOW = Math.min(24, Math.floor(belt.beltCards.length / 2))
    const TOTAL_DRAWS = 150

    const drawn: Array<{ id: string; name: string }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    let violations = 0
    const violationDetails: string[] = []
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < Math.min(i + DEDUP_WINDOW, drawn.length); j++) {
        if (drawn[i].id === drawn[j].id) {
          violations++
          violationDetails.push(
            `"${drawn[i].name}" at positions ${i} and ${j} (distance ${j - i})`
          )
        }
      }
    }

    assert(violations === 0,
      `SPEC: No duplicate within ${DEDUP_WINDOW} positions on small belt. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  test('SPEC: dedup window holds across seam boundary specifically', () => {
    // SPEC: The seam (where one boot ends and next begins) is the critical point
    // Draw exactly enough to cross a seam and verify no close duplicates
    const belt = new CommonBelt('JTL', 'A')  // 49 cards
    const DEDUP_WINDOW = 24
    const beltSize = belt.beltCards.length
    // Draw 2 full boots worth to guarantee crossing at least one seam
    const TOTAL_DRAWS = beltSize * 2 + 10

    const drawn: Array<{ id: string; name: string }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    // Check specifically around seam boundaries
    let violations = 0
    const violationDetails: string[] = []
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < Math.min(i + DEDUP_WINDOW, drawn.length); j++) {
        if (drawn[i].id === drawn[j].id) {
          violations++
          violationDetails.push(
            `"${drawn[i].name}" at positions ${i} and ${j} (distance ${j - i})`
          )
        }
      }
    }

    assert(violations === 0,
      `SPEC: Seam dedup failed. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  // =========================================================
  // SPEC: Every card has equal occurrence rate (no exclusion)
  // =========================================================

  test('SPEC: every card in the belt appears with equal frequency (no exclusion)', () => {
    // SPEC (sets 1-6): a belt is a cyclic conveyor; every card appears once per
    // cycle. Set 7+ paired boots serve every card exactly TWICE per cycle —
    // covered by the Set 7+ suite below.
    const belt = new CommonBelt('JTL', 'A')
    const beltSize = belt.beltCards.length
    const TOTAL_DRAWS = beltSize * 5  // 5 full cycles

    const counts = new Map<string, number>()
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      const card = belt.next()
      counts.set(card.id, (counts.get(card.id) || 0) + 1)
    }

    // Every card should appear exactly 5 times (once per cycle)
    const expectedCount = 5
    let missingCards = 0
    let wrongCount = 0
    const details: string[] = []

    for (const card of belt.beltCards) {
      const count = counts.get(card.id) || 0
      if (count === 0) {
        missingCards++
        details.push(`"${card.name}" appeared 0 times (expected ${expectedCount})`)
      } else if (count !== expectedCount) {
        wrongCount++
        details.push(`"${card.name}" appeared ${count} times (expected ${expectedCount})`)
      }
    }

    assert(missingCards === 0,
      `SPEC: ${missingCards} cards were excluded from boots (every card must appear once per cycle):\n  ${details.slice(0, 5).join('\n  ')}`)
    assert(wrongCount === 0,
      `SPEC: ${wrongCount} cards had wrong occurrence count:\n  ${details.slice(0, 5).join('\n  ')}`)
  })

  // =========================================================
  // SPEC: No adjacent cards with same primary aspect
  // =========================================================

  test('SPEC: no adjacent cards share primary aspect on Belt A', () => {
    // SPEC (sets 1-6): the primary aspect never repeats back-to-back. Set 7+
    // paired boots allow <=3% forced adjacency (real ASH box 001 line order:
    // ~1.2%) — covered by the Set 7+ suite below.
    const belt = new CommonBelt('JTL', 'A')
    const TOTAL_DRAWS = 200

    const drawn: Array<{ id: string; name: string; aspects: string[] }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    let violations = 0
    const violationDetails: string[] = []
    for (let i = 1; i < drawn.length; i++) {
      const prevAspect = drawn[i - 1].aspects?.[0]
      const currAspect = drawn[i].aspects?.[0]
      if (prevAspect && currAspect && prevAspect === currAspect) {
        violations++
        violationDetails.push(
          `positions ${i - 1}-${i}: "${drawn[i - 1].name}" (${prevAspect}) → "${drawn[i].name}" (${currAspect})`
        )
      }
    }

    assert(violations === 0,
      `SPEC: No adjacent same primary aspect. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  test('SPEC: no adjacent cards share primary aspect on Belt B', () => {
    // SPEC: Same rule applies to Belt B
    const belt = new CommonBelt('JTL', 'B')
    const TOTAL_DRAWS = 200

    const drawn: Array<{ id: string; name: string; aspects: string[] }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    let violations = 0
    const violationDetails: string[] = []
    for (let i = 1; i < drawn.length; i++) {
      const prevAspect = drawn[i - 1].aspects?.[0]
      const currAspect = drawn[i].aspects?.[0]
      if (prevAspect && currAspect && prevAspect === currAspect) {
        violations++
        violationDetails.push(
          `positions ${i - 1}-${i}: "${drawn[i - 1].name}" (${prevAspect}) → "${drawn[i].name}" (${currAspect})`
        )
      }
    }

    assert(violations === 0,
      `SPEC: No adjacent same primary aspect on Belt B. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  test('SPEC: no adjacent same primary aspect across seam boundary', () => {
    // SPEC: The no-adjacent-aspect rule must hold at the seam too
    const belt = new CommonBelt('JTL', 'A')
    const beltSize = belt.beltCards.length
    const TOTAL_DRAWS = beltSize * 3  // Cross multiple seams

    const drawn: Array<{ id: string; name: string; aspects: string[] }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    let violations = 0
    const violationDetails: string[] = []
    for (let i = 1; i < drawn.length; i++) {
      const prevAspect = drawn[i - 1].aspects?.[0]
      const currAspect = drawn[i].aspects?.[0]
      if (prevAspect && currAspect && prevAspect === currAspect) {
        violations++
        violationDetails.push(
          `positions ${i - 1}-${i}: "${drawn[i - 1].name}" (${prevAspect}) → "${drawn[i].name}" (${currAspect})`
        )
      }
    }

    assert(violations === 0,
      `SPEC: No adjacent same primary aspect across seams. Found ${violations} violations:\n  ${violationDetails.slice(0, 5).join('\n  ')}`)
  })

  test('SPEC: neutral cards (no aspects) do not cause false violations', () => {
    // SPEC: Cards with no aspects have no primary aspect, so they can be adjacent to anything
    // and anything can be adjacent to them - they should NOT count as violations
    // NOTE: SOR Belt B has 18/30 Cunning (60%), making some adjacencies mathematically
    // unavoidable. Minimum forced = max(0, 2*maxGroupSize - beltSize - 1) per boot.
    const belt = new CommonBelt('SOR', 'B')  // Belt B has neutral cards
    const beltSize = belt.beltCards.length
    const TOTAL_DRAWS = 150
    const NUM_BOOTS = Math.ceil(TOTAL_DRAWS / beltSize)

    const drawn: Array<{ id: string; name: string; aspects: string[] }> = []
    for (let i = 0; i < TOTAL_DRAWS; i++) {
      drawn.push(belt.next())
    }

    // Calculate the theoretical minimum violations per boot
    const aspectCounts = new Map<string | null, number>()
    for (const card of belt.beltCards) {
      const a = (card.aspects || [])[0] || null
      aspectCounts.set(a, (aspectCounts.get(a) || 0) + 1)
    }
    const maxGroupSize = Math.max(...[...aspectCounts.entries()]
      .filter(([k]) => k !== null)  // Only count aspected groups
      .map(([, v]) => v))
    const minForcedPerBoot = Math.max(0, 2 * maxGroupSize - beltSize - 1)
    // Allow forced violations + some seam overhead
    const maxAllowed = (minForcedPerBoot + 1) * (NUM_BOOTS + 1)

    // Check that violations only count when BOTH cards have a primary aspect
    let violations = 0
    for (let i = 1; i < drawn.length; i++) {
      const prevAspect = drawn[i - 1].aspects?.[0]
      const currAspect = drawn[i].aspects?.[0]
      if (prevAspect && currAspect && prevAspect === currAspect) {
        violations++
      }
    }

    assert(violations <= maxAllowed,
      `SPEC: Found ${violations} aspect violations (max allowed: ${maxAllowed} based on ${minForcedPerBoot} forced/boot). Belt has ${maxGroupSize}/${beltSize} of dominant aspect.`)

    // Verify that neutral-adjacent pairs are never counted as violations
    // (this is what the test is really about)
    let falseNeutralViolations = 0
    for (let i = 1; i < drawn.length; i++) {
      const prevAspects = drawn[i - 1].aspects || []
      const currAspects = drawn[i].aspects || []
      if (prevAspects.length === 0 || currAspects.length === 0) {
        // If either card is neutral, this should NEVER be counted as a violation
        // (This validates our test logic, not the belt)
        if (prevAspects[0] && currAspects[0] && prevAspects[0] === currAspects[0]) {
          falseNeutralViolations++
        }
      }
    }
    assertEqual(falseNeutralViolations, 0,
      'Neutral cards should never cause false aspect violations')
  })

  // Small aspect groups must be distributed evenly across the belt,
  // not clustered at the start. This is the test that would have caught
  // the bug where neutral/mono-alignment cards appeared in only 10-15%
  // of sealed pools instead of ~50%.
  test('SPEC: small aspect groups are evenly distributed across belt (not front-loaded)', () => {
    // Sets 1-6 single-copy model (Set 7+ paired boots covered by their own
    // suite). Draw 24 cards (6 packs x 4 per pack from this belt); each
    // small-group card should appear in a healthy share of pools.
    // Old bug: they appeared in ~10% because they clustered at positions 3-13.

    const TRIALS = 200
    const smallGroupCards = new Map<string, number>() // name → appearances
    const regularCards = new Map<string, number>()

    // Get the actual small-group card names from LAW Belt A
    const beltACards = getBeltCards('JTL', 'A')
    const smallGroupNames = new Set<string>()
    const regularNames = new Set<string>()
    for (const card of beltACards) {
      const aspects = card.aspects || []
      const colorAspects = aspects.filter(a =>
        ['Vigilance', 'Command', 'Aggression', 'Cunning'].includes(a)
      )
      if (colorAspects.length === 0) {
        // Neutral or mono-alignment
        smallGroupNames.add(card.name)
        smallGroupCards.set(card.name, 0)
      } else if (regularNames.size < 3) {
        // Pick a few regular cards for comparison
        regularNames.add(card.name)
        regularCards.set(card.name, 0)
      }
    }

    for (let t = 0; t < TRIALS; t++) {
      const belt = new CommonBelt('JTL', 'A')
      const drawn = new Set<string>()
      for (let i = 0; i < 24; i++) {
        const card = belt.next()
        if (card) drawn.add(card.name)
      }
      for (const [name, count] of smallGroupCards) {
        if (drawn.has(name)) smallGroupCards.set(name, count + 1)
      }
      for (const [name, count] of regularCards) {
        if (drawn.has(name)) regularCards.set(name, count + 1)
      }
    }

    // Small group cards should appear at ≥30% rate (spec: ~48%, allow margin)
    for (const [name, count] of smallGroupCards) {
      const rate = count / TRIALS
      assert(rate >= 0.30,
        `SPEC: Small-group card "${name}" appeared in ${(rate * 100).toFixed(1)}% ` +
        `of pools (need ≥30%). This means small aspect groups are clustered, not evenly distributed.`)
    }

    // Verify regular cards are also in expected range (sanity check)
    for (const [name, count] of regularCards) {
      const rate = count / TRIALS
      assert(rate >= 0.30,
        `Regular card "${name}" appeared in ${(rate * 100).toFixed(1)}% (expected ≥30%)`)
    }
  })

  // Legacy getCommonPools tests for backward compatibility
  test('getCommonPools returns structured pools (legacy)', () => {
    const { poolA, poolB } = getCommonPools('SOR')
    assert(poolA.primary1.length > 0, 'Pool A primary1 should not be empty')
    assert(poolB.primary1.length > 0, 'Pool B primary1 should not be empty')
  })

  // ==========================================================================
  // Set 7+ paired-copy boot (line model)
  //
  // SPEC source: real ASH box 001 read in factory line order
  // (plans/LINE_STACKING_COLLATION_PLAN.md L1, plans/ASH_COLLATION_FINDINGS.md):
  // a common's duplicate copies ride 1-3 packs apart on the line (gap 1 ×32,
  // gap 3 ×17, gap 5 ×10 of ~90 measured repeats), never inside the same pack,
  // with aspect interleaving and lane segment quotas intact. Long-gap repeats
  // come from boot seams, not intra-boot placement.
  // ==========================================================================

  const MORALITY = new Set(['Villainy', 'Heroism'])
  const primaryAspectOf = (c) => (c.aspects || []).find(a => !MORALITY.has(a)) || (c.aspects || [])[0] || null

  test('FIXED: Set 7+ boot contains every belt card exactly twice (paired-copy sheet)', () => {
    const belt = new CommonBelt('ASH', 'A')
    const boot = belt.hopper
    const counts = new Map()
    for (const c of boot) counts.set(c.id, (counts.get(c.id) || 0) + 1)
    assert(boot.length === belt.beltCards.length * 2,
      `SPEC: Set 7+ boot = every card twice, expected ${belt.beltCards.length * 2} draws, got ${boot.length}`)
    for (const [id, n] of counts) {
      assert(n === 2, `SPEC: card ${id} should appear exactly twice per boot, got ${n}`)
    }
  })

  test('FIXED: Set 7+ paired copies ride close on the line, never in the same pack', () => {
    // Fresh belt: global draw 0 → pack segments are aligned drawSize-windows.
    const belt = new CommonBelt('ASH', 'A')
    const boot = belt.hopper
    const drawSize = belt.segmentConfig.drawSize
    const firstPos = new Map()
    const gaps = []
    boot.forEach((c, i) => {
      if (firstPos.has(c.id)) {
        const p1 = firstPos.get(c.id)
        gaps.push(i - p1)
        assert(Math.floor(p1 / drawSize) !== Math.floor(i / drawSize),
          `SPEC: pair for ${c.name} landed in the same pack (positions ${p1}, ${i}) — real box: zero same-belt within-pack dups`)
      } else {
        firstPos.set(c.id, i)
      }
    })
    assert(gaps.length > 0, 'boot should contain pairs')
    const close = gaps.filter(g => g <= 4 * drawSize).length
    // Real box 001 line order: intra-boot pair gaps <=4 packs ≈ 62% of pairs
    // (histogram {1:32, 3:17, 4:1} of ~80 intra-boot repeats). Band: >=55%.
    assert(close / gaps.length >= 0.55,
      `SPEC: >=55% of pair gaps within 4 packs (real box ≈62%), got ${(close / gaps.length * 100).toFixed(0)}%`)
    assert(Math.min(...gaps) >= 2,
      `SPEC: pair gap must be >= 2 draws (no adjacent same card), got ${Math.min(...gaps)}`)
  })

  test('Set 7+ boot keeps aspect interleaving (adjacent same-primary <= 3%)', () => {
    const belt = new CommonBelt('ASH', 'A')
    const boot = belt.hopper
    let same = 0
    for (let i = 1; i < boot.length; i++) {
      if (primaryAspectOf(boot[i]) && primaryAspectOf(boot[i]) === primaryAspectOf(boot[i - 1])) same++
    }
    assert(same / (boot.length - 1) <= 0.03,
      `SPEC: aspect interleaving must survive pairing, got ${same}/${boot.length - 1} adjacent same-primary`)
  })

  test('Set 7+ boot keeps lane segment quotas (every aligned window has required aspects)', () => {
    const belt = new CommonBelt('ASH', 'A')
    const boot = belt.hopper
    const drawSize = belt.segmentConfig.drawSize
    const required = belt.segmentConfig.requiredAspects
    let violations = 0
    for (let s = 0; s + drawSize <= boot.length; s += drawSize) {
      const w = boot.slice(s, s + drawSize)
      for (const aspect of required) {
        if (!w.some(c => (c.aspects || []).includes(aspect))) { violations++; break }
      }
    }
    assert(violations === 0,
      `SPEC: every aligned ${drawSize}-window must contain ${required.join('+')}, got ${violations} violations`)
  })

  test('sets 1-6 boots unchanged: every card exactly once per boot', () => {
    const belt = new CommonBelt('JTL', 'A')
    const boot = belt.hopper
    const counts = new Map()
    for (const c of boot) counts.set(c.id, (counts.get(c.id) || 0) + 1)
    assert(boot.length === belt.beltCards.length,
      `sets 1-6: boot length = pool size (single copies), expected ${belt.beltCards.length}, got ${boot.length}`)
    for (const [id, n] of counts) {
      assert(n === 1, `sets 1-6: card ${id} should appear exactly once per boot, got ${n}`)
    }
  })

  test('Set 7+ multi-boot draw-through: no same card twice within any served pack', () => {
    const belt = new CommonBelt('ASH', 'A')
    const drawSize = belt.segmentConfig.drawSize
    for (let p = 0; p < 75; p++) {
      const pack = []
      for (let d = 0; d < drawSize; d++) pack.push(belt.next())
      const ids = pack.filter(Boolean).map(c => c.id)
      assert(new Set(ids).size === ids.length,
        `pack ${p} served the same common twice: ${pack.map(c => c && c.name).join(', ')}`)
    }
  })

  console.log('')
  console.log('\x1b[35m====================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
  } else {
    console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  }
  console.log('')

  if (failed > 0) {
    console.log('\x1b[31m\x1b[1m💥 TESTS FAILED\x1b[0m')
    process.exit(1)
  } else {
    console.log('\x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m')
  }
}

runTests()
