// @ts-nocheck
/**
 * Booster Pack Generation Tests
 *
 * Run with: npx tsx src/utils/boosterPack.test.ts
 */

import { generateBoosterPack, generateSealedPod, generateSealedBox, clearBeltCache, stackBoxOrder, BOX_SIZE } from './boosterPack'
import { initializeCardCache, getCachedCards } from './cardCache'

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

function withMockedRandom<T>(value: number, fn: () => T): T {
  const originalRandom = Math.random
  Math.random = () => value
  try {
    return fn()
  } finally {
    Math.random = originalRandom
  }
}

function withSeededRandom<T>(seed: number, fn: () => T): T {
  const originalRandom = Math.random
  let state = seed >>> 0
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  try {
    return fn()
  } finally {
    Math.random = originalRandom
  }
}

interface Card {
  id: string
  name: string
  variantType?: string
  isFoil?: boolean
  isLeader?: boolean
  isBase?: boolean
  isHyperspace?: boolean
  rarity?: string
  set?: string
  aspects?: string[]
}

interface Pack {
  cards: Card[]
}

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()
  const cards = getCachedCards('SOR')
  console.log('')
  console.log('\x1b[1m\x1b[35m📦 Booster Pack Tests\x1b[0m')
  console.log('\x1b[35m======================\x1b[0m')

  test('generateBoosterPack returns pack with cards array', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    assert(pack !== null, 'Pack should not be null')
    assert(Array.isArray(pack.cards), 'Pack should have cards array')
    assert(pack.cards.length > 0, 'Pack should have cards')
  })

  test('pack contains exactly 16 cards', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    assertEqual(pack.cards.length, 16, 'Pack should contain 16 cards')
  })

  test('pack contains exactly 1 leader', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    const leaders = pack.cards.filter((c: Card) => c.isLeader)
    assertEqual(leaders.length, 1, 'Pack should contain exactly 1 leader')
  })

  test('pack contains exactly 1 common base', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    const commonBases = pack.cards.filter((c: Card) => c.isBase && c.rarity === 'Common')
    assertEqual(commonBases.length, 1, 'Pack should contain exactly 1 common base')
  })

  test('pack contains 9 commons (non-leader, non-base)', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    const commons = pack.cards.filter((c: Card) =>
      c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil
    )
    assertEqual(commons.length, 9, 'Pack should contain 9 common cards')
  })

  test('pack contains 2-3 uncommons (3rd UC may upgrade to R/L)', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    const uncommons = pack.cards.filter((c: Card) => c.rarity === 'Uncommon' && !c.isFoil)
    assert(
      uncommons.length >= 2 && uncommons.length <= 3,
      `Pack should contain 2-3 uncommon cards, got ${uncommons.length}`
    )
  })

  test('pack contains 1-2 rare or legendary (3rd UC may upgrade to R/L)', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    // Rare bases count as R/L (they occupy the R/L slot in sets 1-6)
    const rareOrLegendary = pack.cards.filter((c: Card) =>
      (c.rarity === 'Rare' || c.rarity === 'Legendary') &&
      !c.isFoil && !c.isLeader
    )
    assert(
      rareOrLegendary.length >= 1 && rareOrLegendary.length <= 2,
      `Pack should contain 1-2 rare or legendary, got ${rareOrLegendary.length}`
    )
  })

  test('pack contains exactly 1 foil', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    const foils = pack.cards.filter((c: Card) => c.isFoil)
    assertEqual(foils.length, 1, 'Pack should contain exactly 1 foil')
  })

  test('foil is not a leader or base', () => {
    clearBeltCache()
    // Test multiple packs to increase confidence
    for (let i = 0; i < 10; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const foil = pack.cards.find((c: Card) => c.isFoil)
      assert(!foil.isLeader, 'Foil should not be a leader')
      assert(!foil.isBase, 'Foil should not be a base')
    }
  })

  test('all cards are from the correct set', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    assert(pack.cards.every((c: Card) => c.set === 'SOR'), 'All cards should be from SOR set')
  })

  // SPEC (CLAUDE.md "Card Variant Types"): a booster's cards are Normal,
  // Hyperspace, Hyperspace Foil, or Showcase. 'Hyperspace Foil' was missing
  // here, so this failed whenever the foilToHyperfoil upgrade fired — a ~1/50
  // per-pack event that the neighbouring "Hyperspace Foil variants appear at
  // ~1/50 rate" test asserts is CORRECT behaviour. One random pack, so it
  // failed ~7% of runs (measured 2/30) and CI had simply been getting lucky.
  test('all cards are Normal or Hyperspace or Hyperspace Foil or Showcase variants', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    const validVariants = ['Normal', 'Hyperspace', 'Hyperspace Foil', 'Showcase']
    assert(
      pack.cards.every((c: Card) => validVariants.includes(c.variantType || 'Normal')),
      `All cards should be Normal, Hyperspace, Hyperspace Foil, or Showcase variants; got ${[
        ...new Set(pack.cards.map((c: Card) => c.variantType || 'Normal')),
      ].join(', ')}`
    )
  })

  test('ASH placeholder catalog can produce complete LAW-style packs', () => {
    const ashCards = getCachedCards('ASH')
    if (ashCards.length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }

    clearBeltCache()
    const pack = generateBoosterPack(ashCards, 'ASH')
    assertEqual(pack.cards.length, 16, 'ASH pack should contain 16 cards')
    assertEqual(pack.cards.filter((c: Card) => c.isLeader).length, 1, 'ASH pack should contain exactly 1 leader')
    assertEqual(pack.cards.filter((c: Card) => c.isBase).length, 1, 'ASH pack should contain exactly 1 base')
    assertEqual(
      pack.cards.filter((c: Card) => c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil).length,
      9,
      'ASH pack should contain 9 common cards'
    )
    // ASH currently has no HSF art from FFG, so the slot uses Normal art as a
    // fallback. It is still a Hyperspace Foil slot semantically and should
    // render with the foil overlay.
    assertEqual(
      pack.cards.filter((c: Card) => c.isFoil).length,
      1,
      'ASH pack should contain exactly 1 foil slot'
    )
    assertEqual(
      pack.cards.filter((c: Card) => c.isFoil && c.isHyperspace).length,
      1,
      'ASH foil slot should remain Hyperspace Foil even when art falls back to Normal'
    )
    assert(
      pack.cards.filter((c: Card) => c.isPlaceholder).every((c: Card) => !c.number && !c.cardId),
      'ASH placeholders should not carry collector numbers'
    )
    assert(
      pack.cards.filter((c: Card) => c.isPlaceholder && !c.isLeader && !c.isBase).every((c: Card) => c.type === 'Unknown'),
      'ASH main-deck placeholders should not invent card type'
    )
  })

  test('leaders do not appear in rare/legendary slot', () => {
    clearBeltCache()
    // Test many packs to ensure leaders never appear in wrong slot
    for (let i = 0; i < 50; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const rareOrLegendary = pack.cards.filter((c: Card) =>
        (c.rarity === 'Rare' || c.rarity === 'Legendary') &&
        !c.isFoil && !c.isLeader
      )
      assert(
        rareOrLegendary.every((c: Card) => !c.isLeader),
        'Leaders should not appear in rare/legendary slot'
      )
    }
  })

  console.log('')
  console.log('Aspect Coverage Tests')
  console.log('=====================')

  test('pack commons must contain basic aspects (B, G, R, Y)', () => {
    // MANUFACTURING PRINCIPLE:
    // We guarantee the 4 basic aspects through belt construction, not post-hoc fixes.
    // Belt A segments always have B, G, R. Belt B segments always have Y.
    // Heroism and Villainy are NOT guaranteed in every pack.
    clearBeltCache()
    const basicAspects = ['Vigilance', 'Command', 'Aggression', 'Cunning']
    const packCount = 100
    let packsWithAllBasicAspects = 0
    const missingAspectCounts: Record<string, number> = {}
    basicAspects.forEach(a => missingAspectCounts[a] = 0)
    const failedPacks: { pack: number; missing: string[] }[] = []

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      // Get the 9 commons (non-leader, non-base, non-foil)
      const commons = pack.cards.filter((c: Card) =>
        c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil
      )

      // Collect all aspects present in commons
      const aspectsPresent = new Set<string>()
      commons.forEach((card: Card) => {
        if (card.aspects) {
          card.aspects.forEach(aspect => aspectsPresent.add(aspect))
        }
      })

      // Check if all 4 basic aspects are present
      const missingAspects = basicAspects.filter(a => !aspectsPresent.has(a))
      if (missingAspects.length === 0) {
        packsWithAllBasicAspects++
      } else {
        missingAspects.forEach(a => missingAspectCounts[a]++)
        if (failedPacks.length < 3) {
          failedPacks.push({ pack: i + 1, missing: missingAspects })
        }
      }
    }

    const successRate = (packsWithAllBasicAspects / packCount * 100).toFixed(1)
    console.log(`\x1b[36m   Packs with all 4 basic aspects (B,G,R,Y): ${packsWithAllBasicAspects}/${packCount} (${successRate}%)\x1b[0m`)
    if (packsWithAllBasicAspects < packCount) {
      console.log(`\x1b[36m   Missing aspect frequency: ${JSON.stringify(missingAspectCounts)}\x1b[0m`)
    }

    // At least 95% of packs must have all 4 basic aspects
    // The manufacturing process ensures this through belt construction.
    // A small percentage of failures can occur at boot seams (belt wrap-around points).
    // Sealed pods (6 packs) always achieve 100% coverage due to averaging.
    const minRequired = Math.floor(packCount * 0.95)
    assert(
      packsWithAllBasicAspects >= minRequired,
      `Only ${packsWithAllBasicAspects}/${packCount} packs have all basic aspects (need ${minRequired}+). Examples: ${JSON.stringify(failedPacks)}`
    )
  })

  test('sealed pod (6 packs) commons should contain all 6 aspects', () => {
    clearBeltCache()
    const allAspects = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy']
    const podCount = 50
    let podsWithAllAspects = 0
    const missingAspectCounts: Record<string, number> = {}
    allAspects.forEach(a => missingAspectCounts[a] = 0)

    for (let i = 0; i < podCount; i++) {
      const packs = generateSealedPod(cards, 'SOR', 6)

      // Collect all aspects from all commons in the pod
      const aspectsPresent = new Set<string>()
      packs.forEach((pack: Pack) => {
        const commons = pack.cards.filter((c: Card) =>
          c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil
        )
        commons.forEach((card: Card) => {
          if (card.aspects) {
            card.aspects.forEach(aspect => aspectsPresent.add(aspect))
          }
        })
      })

      const missingAspects = allAspects.filter(a => !aspectsPresent.has(a))
      if (missingAspects.length === 0) {
        podsWithAllAspects++
      } else {
        missingAspects.forEach(a => missingAspectCounts[a]++)
      }
    }

    const successRate = (podsWithAllAspects / podCount * 100).toFixed(1)
    console.log(`\x1b[36m   Pods with all 6 aspects: ${podsWithAllAspects}/${podCount} (${successRate}%)\x1b[0m`)
    console.log(`\x1b[36m   Missing aspect frequency: ${JSON.stringify(missingAspectCounts)}\x1b[0m`)

    // Sealed pod with 54 commons should almost always have all aspects
    assert(
      podsWithAllAspects === podCount,
      `${podCount - podsWithAllAspects} pods missing aspects. Frequency: ${JSON.stringify(missingAspectCounts)}`
    )
  })

  console.log('')
  console.log('Sealed Pod Tests')
  console.log('================')

  test('generateSealedPod returns 6 packs by default', () => {
    clearBeltCache()
    const packs = generateSealedPod(cards, 'SOR')
    assertEqual(packs.length, 6, 'Should generate 6 packs')
  })

  test('generateSealedPod returns specified number of packs', () => {
    clearBeltCache()
    const packs = generateSealedPod(cards, 'SOR', 3)
    assertEqual(packs.length, 3, 'Should generate specified number of packs')
  })

  test('each pack in sealed pod has correct structure', () => {
    clearBeltCache()
    const packs = generateSealedPod(cards, 'SOR')
    packs.forEach((pack: Pack, i: number) => {
      assertEqual(pack.cards.length, 16, `Pack ${i + 1} should have 16 cards`)
      assertEqual(
        pack.cards.filter((c: Card) => c.isLeader).length,
        1,
        `Pack ${i + 1} should have 1 leader`
      )
    })
  })

  test('leaders in sealed pod come from belt (sequential, not random)', () => {
    clearBeltCache()
    const packs = generateSealedPod(cards, 'SOR')
    const leaders = packs.map((p: Pack) => p.cards.find((c: Card) => c.isLeader))

    // Check that we don't have the same leader in adjacent packs too often
    // (belt should provide variety through its fill algorithm)
    let adjacentDupes = 0
    for (let i = 1; i < leaders.length; i++) {
      if (leaders[i].id === leaders[i - 1].id) {
        adjacentDupes++
      }
    }

    assert(adjacentDupes <= 1, `Too many adjacent duplicate leaders: ${adjacentDupes}`)
  })

  test('FIXED: ASH 24-pack draft box gets rare leaders from physical leader sheets', () => {
    const ashCards = getCachedCards('ASH')
    if (ashCards.length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }

    withMockedRandom(0.5, () => {
      const box = generateSealedBox(ashCards, 'ASH', 24)
      const leaders = box.map((pack: Pack) => pack.cards.find((c: Card) => c.isLeader)).filter(Boolean)
      const rareLeaders = leaders.filter((card: Card) => card.rarity === 'Rare')
      const rareNames = rareLeaders.map((card: Card) => card.name)
      const rareCounts = new Map<string, number>()
      for (const name of rareNames) {
        rareCounts.set(name, (rareCounts.get(name) || 0) + 1)
      }
      const maxSameRare = Math.max(0, ...Array.from(rareCounts.values()))

      assertEqual(leaders.length, 24, 'Draft box should contain exactly 24 leader slots')
      assert(rareLeaders.length > 0, 'ASH draft box should not be able to contain zero rare leaders')
      assert(maxSameRare <= 2, `A rare leader appeared ${maxSameRare} times across independent leader belts: ${rareNames.join(', ')}`)
    })
  })

  test('clearBeltCache causes new belt initialization', () => {
    clearBeltCache()
    const packs1 = generateSealedPod(cards, 'SOR')
    const leader1 = packs1[0].cards.find((c: Card) => c.isLeader)

    // Generate many pods and check that we get different starting leaders
    const startingLeaders = new Set<string>()
    startingLeaders.add(leader1.id)

    for (let i = 0; i < 10; i++) {
      clearBeltCache()
      const packs = generateSealedPod(cards, 'SOR')
      const leader = packs[0].cards.find((c: Card) => c.isLeader)
      startingLeaders.add(leader.id)
    }

    assert(startingLeaders.size > 1, 'Different pods should start with different leaders')
  })

  test('commons alternate between Belt A and Belt B aspects across packs', () => {
    clearBeltCache()
    const packs = generateSealedPod(cards, 'SOR', 2)

    // Get commons from first pack (should be A,B,A,B,A,B,A,B,A pattern)
    // Exclude base, foil, and leader (leaders can be Common rarity)
    const pack1Commons = packs[0].cards.filter((c: Card) => c.rarity === 'Common' && !c.isBase && !c.isFoil && !c.isLeader)
    // Get commons from second pack (should be B,A,B,A,B,A,B,A,B pattern)
    const pack2Commons = packs[1].cards.filter((c: Card) => c.rarity === 'Common' && !c.isBase && !c.isFoil && !c.isLeader)

    assertEqual(pack1Commons.length, 9, 'Pack 1 should have 9 commons')
    assertEqual(pack2Commons.length, 9, 'Pack 2 should have 9 commons')

    // Count aspects in odd positions (0,2,4,6,8) vs even positions (1,3,5,7)
    // Pack 1: positions 0,2,4,6,8 should be Belt A (Vigilance/Command)
    // Pack 2: positions 0,2,4,6,8 should be Belt B (Aggression/Cunning)
    const beltAAspects = ['Vigilance', 'Command']
    const beltBAspects = ['Aggression', 'Cunning']

    const hasAspect = (card: Card, aspects: string[]): boolean => {
      if (!card.aspects) return false
      return aspects.some(a => card.aspects!.includes(a))
    }

    // Check that packs have a mix from both belts
    const pack1HasBeltA = pack1Commons.some((c: Card) => hasAspect(c, beltAAspects))
    const pack1HasBeltB = pack1Commons.some((c: Card) => hasAspect(c, beltBAspects))
    const pack2HasBeltA = pack2Commons.some((c: Card) => hasAspect(c, beltAAspects))
    const pack2HasBeltB = pack2Commons.some((c: Card) => hasAspect(c, beltBAspects))

    assert(pack1HasBeltA && pack1HasBeltB, 'Pack 1 should have commons from both belts')
    assert(pack2HasBeltA && pack2HasBeltB, 'Pack 2 should have commons from both belts')
  })

  console.log('')
  console.log('Duplicate Detection Tests')
  console.log('==========================')

  test('single pack has no duplicate cards (same ID and foil status)', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')

    // Check for duplicates by comparing both ID and foil status
    const seen = new Map<string, { index: number; isFoil: boolean }[]>() // Map of card.id to array of {index, isFoil}
    const duplicates: string[] = []

    for (let i = 0; i < pack.cards.length; i++) {
      const card = pack.cards[i] as Card
      const key = card.id

      if (!seen.has(key)) {
        seen.set(key, [])
      }

      // Check if we've seen this card with the same foil status
      const matchingCards = seen.get(key)!.filter(c => c.isFoil === card.isFoil)

      if (matchingCards.length > 0) {
        // True duplicate found (same ID and same foil status)
        const firstMatch = matchingCards[0]
        duplicates.push(`${card.name} (${card.id}) isFoil:${card.isFoil} at positions ${firstMatch.index} and ${i}`)
      }

      seen.get(key)!.push({ index: i, isFoil: card.isFoil || false })
    }

    assertEqual(duplicates.length, 0,
      `Pack should have no duplicate cards (same ID + foil status), but found: ${duplicates.join('; ')}`)
  })

  test('100 packs have no duplicate cards (same ID and foil status) within any single pack', () => {
    clearBeltCache()

    let packsWithDuplicates = 0
    const duplicateExamples: string[] = []

    for (let packNum = 0; packNum < 100; packNum++) {
      const pack = generateBoosterPack(cards, 'SOR')

      // Check for duplicates by comparing both ID and foil status
      const seen = new Map<string, { index: number; isFoil: boolean }[]>() // Map of card.id to array of {index, isFoil}
      let hasDuplicate = false

      for (let j = 0; j < pack.cards.length; j++) {
        const card = pack.cards[j] as Card
        const key = card.id

        if (!seen.has(key)) {
          seen.set(key, [])
        }

        // Check if we've seen this card with the same foil status
        const matchingCards = seen.get(key)!.filter(c => c.isFoil === card.isFoil)

        if (matchingCards.length > 0) {
          // True duplicate found (same ID and same foil status)
          hasDuplicate = true
          duplicateExamples.push(`Pack ${packNum + 1}: ${card.name} (${card.id}) isFoil:${card.isFoil}`)
          if (duplicateExamples.length >= 5) break
        }

        seen.get(key)!.push({ index: j, isFoil: card.isFoil || false })
      }

      if (hasDuplicate) {
        packsWithDuplicates++
      }
    }

    assertEqual(packsWithDuplicates, 0,
      `Found duplicates in ${packsWithDuplicates} out of 100 packs. Examples: ${duplicateExamples.join('; ')}`)
  })

  test('normal common belts do not need a post-pack dedupe pass', () => {
    const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']

    sets.forEach((setCode) => {
      clearBeltCache()

      for (let packNum = 0; packNum < 1000; packNum++) {
        const pack = generateBoosterPack(getCachedCards(setCode), setCode)
        const normalCommons = pack.cards.filter((c: Card) =>
          c.rarity === 'Common' &&
          !c.isLeader &&
          !c.isBase &&
          !c.isFoil &&
          !c.isHyperspace
        )

        const seenNames = new Set<string>()
        for (const card of normalCommons) {
          assert(
            !seenNames.has(card.name),
            `${setCode} pack ${packNum + 1} repeated normal common "${card.name}" without any pack-level dedupe`
          )
          seenNames.add(card.name)
        }
      }
    })
  })

  test('belt cache returns same belt instance for same key', () => {
    clearBeltCache()

    // Generate two packs without clearing cache
    const pack1 = generateBoosterPack(cards, 'SOR')
    const pack2 = generateBoosterPack(cards, 'SOR')

    // Both packs should exist and have cards
    assert(pack1.cards.length === 16, 'Pack 1 should have 16 cards')
    assert(pack2.cards.length === 16, 'Pack 2 should have 16 cards')

    // This test verifies belts are reused (cached) between packs
    // The real test is that no duplicates appear in individual packs
  })

  console.log('')
  console.log('Card + Foil Co-occurrence Tests')
  console.log('================================')

  test('foil should not match pack commons more than expected (bug detection)', () => {
    // This test detects if foil belt is accidentally correlated with common belt
    // Bug scenario: if foil belt were a copy of common belt, match rate would be ~100%
    // Normal rate: ~7.8% (foil common matching one of 9 pack commons)
    clearBeltCache()
    const packCount = 500
    let foilMatchesCommon = 0
    const matchExamples: string[] = []

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const foil = pack.cards.find((c: Card) => c.isFoil)
      if (!foil) continue

      // Get the 9 non-foil commons in this pack
      const packCommons = pack.cards.filter((c: Card) =>
        c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil
      )

      // Check if foil matches ANY common in the pack (by ID)
      const matchingCommon = packCommons.find((c: Card) => c.id === foil.id)
      if (matchingCommon) {
        foilMatchesCommon++
        if (matchExamples.length < 5) {
          matchExamples.push(`Pack ${i + 1}: foil "${foil.name}" matches common`)
        }
      }
    }

    const observedRate = foilMatchesCommon / packCount

    // Calculate expected rate:
    // Get actual card counts from the set for accurate calculation
    const allCards = getCachedCards('SOR')
    const nonLeaderBase = allCards.filter((c: Card) => c.variantType === 'Normal' && !c.isLeader && !c.isBase)
    const uniqueCommons = nonLeaderBase.filter((c: Card) => c.rarity === 'Common').length
    const uniqueUncommons = nonLeaderBase.filter((c: Card) => c.rarity === 'Uncommon').length
    const uniqueRares = nonLeaderBase.filter((c: Card) => c.rarity === 'Rare').length
    const uniqueLegendaries = nonLeaderBase.filter((c: Card) => c.rarity === 'Legendary').length

    // Foil belt weights
    const totalWeight = 54 * uniqueCommons + 18 * uniqueUncommons + 6 * uniqueRares + 1 * uniqueLegendaries
    const commonWeight = 54 * uniqueCommons
    const pFoilIsCommon = commonWeight / totalWeight

    // P(foil common matches one of 9 pack commons) = 9 / uniqueCommons
    // Expected rate = P(foil is common) * P(matches one of 9)
    const expectedRate = pFoilIsCommon * (9 / uniqueCommons)

    // Z-score for statistical test
    const stdDev = Math.sqrt(packCount * expectedRate * (1 - expectedRate))
    const zScore = (foilMatchesCommon - packCount * expectedRate) / stdDev

    // Warning at z > 2.5, fail at z > 4 (extreme outlier detection)
    // We use one-sided test (only care if rate is TOO HIGH, indicating correlation bug)
    const warningZScore = 2.5
    const failZScore = 4.0

    console.log(`\x1b[36m   Foil-common match rate: ${(observedRate * 100).toFixed(2)}% (${foilMatchesCommon}/${packCount})\x1b[0m`)
    console.log(`\x1b[36m   Expected rate: ${(expectedRate * 100).toFixed(2)}% (based on ${uniqueCommons} unique commons)\x1b[0m`)
    console.log(`\x1b[36m   Z-score: ${zScore.toFixed(2)} (warn: ${warningZScore}, fail: ${failZScore})\x1b[0m`)

    if (zScore > warningZScore && zScore <= failZScore) {
      console.log(`\x1b[33m   ⚠️  WARNING: Foil-common rate higher than expected (may be normal variance)\x1b[0m`)
    }

    // Only fail for extreme outliers (z > 4) which would indicate a real bug
    // A bug like "foil belt = copy of common belt" would show z-scores of 50+
    assert(
      zScore <= failZScore,
      `Foil-common match rate (${(observedRate * 100).toFixed(1)}%) is extremely high vs expected ${(expectedRate * 100).toFixed(1)}% ` +
      `(z=${zScore.toFixed(2)} > ${failZScore}). This indicates foil belt may be correlated with common belt. ` +
      `Examples: ${matchExamples.join('; ')}`
    )
  })

  test('single pack: card+foil pair rate should be within expected range', () => {
    clearBeltCache()
    const packCount = 500
    let pairsFound = 0
    const pairExamples: string[] = []

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const foil = pack.cards.find((c: Card) => c.isFoil)
      if (!foil) continue

      const nonFoilMatch = pack.cards.find((c: Card) => c.id === foil.id && !c.isFoil)
      if (nonFoilMatch) {
        pairsFound++
        if (pairExamples.length < 5) {
          pairExamples.push(`Pack ${i}: "${foil.name}" (${foil.rarity})`)
        }
      }
    }

    const observedRate = pairsFound / packCount

    // Calculate expected rate mathematically:
    // - Foil belt: 54x commons, 18x uncommons, 6x rares, 1x legendaries
    // - For SOR: 90 commons, 60 uncommons, 48 rares, 16 legendaries (non-leader, non-base)
    // - P(foil is common) = (54*90) / (54*90 + 18*60 + 6*48 + 1*16) = 4860/6244 = 77.8%
    // - P(foil common matches one of 9 drawn commons) = 9/90 = 10%
    // - Expected rate = 77.8% * 10% = 7.78%
    const expectedRate = 0.078

    // Calculate z-score to detect significant deviation
    const stdDev = Math.sqrt(packCount * expectedRate * (1 - expectedRate))
    const zScore = Math.abs(pairsFound - packCount * expectedRate) / stdDev

    // Statistical significance threshold. Two-sided z > 3 flakes ~0.27% of runs on pure
    // variance (no bug) — too tight; the sibling tests (foil-common z>4, pod-pairs z>4)
    // already use 4.0+ for exactly this reason. A real correlation bug shows z of 50+, so
    // 4.5 loses no bug-detection power while making variance flakes negligible (~7e-6).
    const maxZScore = 4.5

    console.log(`\x1b[36m   Card+foil pair rate: ${(observedRate * 100).toFixed(2)}% (${pairsFound}/${packCount})\x1b[0m`)
    console.log(`\x1b[36m   Expected rate (mathematical): ${(expectedRate * 100).toFixed(2)}%\x1b[0m`)
    console.log(`\x1b[36m   Z-score: ${zScore.toFixed(2)} (threshold: ${maxZScore})\x1b[0m`)

    if (zScore > maxZScore) {
      console.log(`\x1b[33m   ⚠️  Rate deviates significantly from expected\x1b[0m`)
    }

    assert(
      zScore <= maxZScore,
      `Card+foil pair rate (${(observedRate * 100).toFixed(1)}%) deviates significantly from expected ${(expectedRate * 100).toFixed(1)}% ` +
      `(z=${zScore.toFixed(2)} > ${maxZScore}). This may indicate a bug in belt correlation. ` +
      `Examples: ${pairExamples.join('; ')}`
    )
  })

  test('sealed pod (6 packs): card+foil pairs per pod should be within expected range', () => {
    clearBeltCache()
    const podCount = 100
    let podsWithPairs = 0
    let totalPairs = 0
    const pairDetails: string[] = []

    for (let p = 0; p < podCount; p++) {
      const packs = generateSealedPod(cards, 'SOR', 6)
      const allCards = packs.flatMap((pack: Pack) => pack.cards)
      const foils = allCards.filter((c: Card) => c.isFoil)
      const nonFoils = allCards.filter((c: Card) => !c.isFoil)

      let pairsInPod = 0
      const pairNames: string[] = []
      foils.forEach((foil: Card) => {
        const match = nonFoils.find((c: Card) => c.id === foil.id)
        if (match) {
          pairsInPod++
          pairNames.push(foil.name)
        }
      })

      if (pairsInPod > 0) {
        podsWithPairs++
        totalPairs += pairsInPod
        if (pairDetails.length < 5) {
          pairDetails.push(`Pod ${p}: ${pairsInPod} pairs (${pairNames.slice(0, 3).join(', ')})`)
        }
      }
    }

    const podPairRate = podsWithPairs / podCount
    const avgPairsPerPod = totalPairs / podCount

    // Robust sanity BAND instead of a tight z-test. The old z-test modeled the mean at
    // 2.8 pairs/pod, but the measured true mean is ~2.98 (1000 pods, sd 1.22), so the
    // two-sided z sat ~1.5 batch-σ off-center and tripped `z > 4` ~2.3% of runs — a false
    // alarm on pure variance, not a bug. Per .claude/rules/testing.md, use a band matched
    // to the real distribution. Intent: catch a gross foil↔common CORRELATION bug. "Foil
    // belt = copy of common belt" would force ~every common foil (≈4.67/pod) to match →
    // ~4.67 pairs/pod; a broken pairing path → ~0. Normal is 2.98 ± ~0.12 (batch avg over
    // 100 pods), so [1.5, 4.0] is >8σ from normal on both sides yet still flags either mode.
    console.log(`\x1b[36m   Pods with card+foil pairs: ${podsWithPairs}/${podCount} (${(podPairRate * 100).toFixed(1)}%)\x1b[0m`)
    console.log(`\x1b[36m   Average pairs per pod: ${avgPairsPerPod.toFixed(2)} (expected ~3.0, band 1.5-4.0)\x1b[0m`)

    assert(
      avgPairsPerPod >= 1.5 && avgPairsPerPod <= 4.0,
      `SPEC: avg card+foil pairs per pod should be ~3.0 (band 1.5-4.0 over ${podCount} pods), got ` +
      `${avgPairsPerPod.toFixed(2)}. Above the band suggests a foil↔common belt correlation bug; ` +
      `below suggests the pairing mechanism broke. Examples: ${pairDetails.join('; ')}`
    )
  })

  console.log('')
  console.log('Upgrade Pass Tests')
  console.log('==================')

  test('over many packs, some leaders get upgraded to Hyperspace', () => {
    clearBeltCache()
    let hyperspaceLeaderCount = 0
    const packCount = 100

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const leader = pack.cards.find((c: Card) => c.isLeader)
      if (leader.isHyperspace) {
        hyperspaceLeaderCount++
      }
    }

    // Smoke test: the HS-leader upgrade mechanism produces upgrades (~1/6, expect ~17/100).
    // Floor is >2 (not >5): >5 sits only ~3σ below the mean and flaked; >2 is ~4σ safe and
    // still catches a broken/near-zero upgrade path. Exact rate is validated in npm run qa.
    assert(
      hyperspaceLeaderCount > 2,
      `Expected some Hyperspace leaders, got ${hyperspaceLeaderCount} out of ${packCount}`
    )
  })

  test('over many packs, some bases get upgraded to Hyperspace', () => {
    clearBeltCache()
    let hyperspaceBaseCount = 0
    const packCount = 100

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const base = pack.cards.find((c: Card) => c.isBase)
      if (base.isHyperspace) {
        hyperspaceBaseCount++
      }
    }

    // Smoke test (see HS-leader test above): floor >2 is ~4σ safe at ~1/6 over 100; >5 flaked.
    assert(
      hyperspaceBaseCount > 2,
      `Expected some Hyperspace bases, got ${hyperspaceBaseCount} out of ${packCount}`
    )
  })

  test('over many packs, some foils get upgraded to Hyperfoil', () => {
    clearBeltCache()
    let hyperfoilCount = 0
    // 2000 packs (not 500): hyperfoils are ~1/50, so 500 gives mean 10 where the >2 floor is
    // only ~2.5σ down and flaked ~0.3%. At 2000 the mean is ~40 and >2 is ~6σ safe (still
    // catches a broken upgrade path); the exact rate is validated in npm run qa.
    const packCount = 2000

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const foil = pack.cards.find((c: Card) => c.isFoil)
      if (foil.isHyperspace) {
        hyperfoilCount++
      }
    }

    // With 1/50 probability, we expect ~10 out of 500
    assert(
      hyperfoilCount > 2,
      `Expected some Hyperfoils, got ${hyperfoilCount} out of ${packCount}`
    )
  })

  test('over many packs, some commons get upgraded to Hyperspace', () => {
    clearBeltCache()
    let hyperspaceCommonPacks = 0
    const packCount = 100

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const hsCommon = pack.cards.find((c: Card) =>
        c.rarity === 'Common' && !c.isLeader && !c.isBase && c.isHyperspace
      )
      if (hsCommon) {
        hyperspaceCommonPacks++
      }
    }

    // With 1/6 probability, we expect ~17 out of 100
    assert(
      hyperspaceCommonPacks > 5,
      `Expected some packs with Hyperspace commons, got ${hyperspaceCommonPacks} out of ${packCount}`
    )
  })

  test('upgraded cards retain correct set code', () => {
    clearBeltCache()
    // Generate many packs to ensure we hit some upgrades
    for (let i = 0; i < 50; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      pack.cards.forEach((card: Card) => {
        assert(
          card.set === 'SOR',
          `All cards should be from SOR, found ${card.set}`
        )
      })
    }
  })

  test('foil slot (position 15) always has isFoil=true', () => {
    // The foil is always the last card (index 15).
    // This test ensures no post-processing or upgrade corrupts the foil slot.
    clearBeltCache()
    for (let i = 0; i < 100; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const foilSlot = pack.cards[15]
      assert(
        foilSlot.isFoil === true,
        `Pack ${i + 1}: card at position 15 should be foil but has isFoil=${foilSlot.isFoil} (${foilSlot.name}, ${foilSlot.rarity})`
      )
    }
  })

  test('showcase leader upgrade uses Showcase variant', () => {
    // Showcase is very rare (1/288), so we check that when it happens,
    // the card has correct properties. We use many packs.
    clearBeltCache()
    let showcaseFound = false

    for (let i = 0; i < 500 && !showcaseFound; i++) {
      const pack = generateBoosterPack(cards, 'SOR')
      const leader = pack.cards.find((c: Card) => c.isLeader)
      if (leader.variantType === 'Showcase') {
        showcaseFound = true
        assert(leader.isLeader, 'Showcase card should be a leader')
      }
    }

    // It's OK if we don't find one - it's a very rare upgrade
    // Just ensure the test completes without error
  })

  test('sealed pod HS+Normal same-leader rate stays within a sane range for independent belts', () => {
    // Printer-faithful behavior: leader upgrades pull from an independent HS leader belt.
    // That means HS+Normal same-name pairs are allowed, but the rate should still stay
    // comfortably below "nearly every pod" territory.
    withSeededRandom(0x1eed3074, () => {
      clearBeltCache()

      const podCount = 100
      let podsWithViolation = 0
      const violationExamples: string[] = []

      for (let i = 0; i < podCount; i++) {
        const pod = generateSealedPod(cards, 'SOR', 6)

        // Collect all leaders in the pod
        const leaders: Card[] = []
        pod.forEach((pack: Pack) => {
          const leader = pack.cards.find((c: Card) => c.isLeader)
          if (leader) leaders.push(leader)
        })

        // Check for same leader appearing as both HS and Normal
        const leadersByName: Record<string, Card[]> = {}
        for (const leader of leaders) {
          if (!leadersByName[leader.name]) {
            leadersByName[leader.name] = []
          }
          leadersByName[leader.name].push(leader)
        }

        let podHasViolation = false
        for (const [name, instances] of Object.entries(leadersByName)) {
          const hasHS = instances.some(l => l.isHyperspace || l.variantType === 'Hyperspace')
          const hasNormal = instances.some(l => !l.isHyperspace && l.variantType === 'Normal')

          if (hasHS && hasNormal) {
            podHasViolation = true
            if (violationExamples.length < 3) {
              violationExamples.push(`Pod ${i}: ${name} appears as both HS and Normal`)
            }
          }
        }

        if (podHasViolation) {
          podsWithViolation++
        }
      }

      const observedRate = podsWithViolation / podCount
      const minExpectedRate = 0.10
      const maxAcceptableRate = 0.60

      console.log(`\x1b[36m   HS+Normal same-leader pod rate: ${(observedRate * 100).toFixed(1)}% (${podsWithViolation}/${podCount})\x1b[0m`)
      console.log(`\x1b[36m   Independent-belt sanity band: ${(minExpectedRate * 100).toFixed(0)}%-${(maxAcceptableRate * 100).toFixed(0)}%\x1b[0m`)

      if (violationExamples.length > 0) {
        console.log(`\x1b[36m   Examples: ${violationExamples.join('; ')}\x1b[0m`)
      }

      assert(
        observedRate >= minExpectedRate,
        `HS+Normal same-leader rate (${(observedRate * 100).toFixed(1)}%) is too low for independent leader belts. ` +
        `This suggests leader upgrades are preserving the standard leader instead of pulling from the HS leader belt.`
      )
      assert(
        observedRate <= maxAcceptableRate,
        `HS+Normal same-leader rate (${(observedRate * 100).toFixed(1)}%) exceeds ${(maxAcceptableRate * 100).toFixed(0)}% ` +
        `for independent leader belts. ` +
        `Examples: ${violationExamples.join('; ')}`
      )
    })
  })

  console.log('')
  console.log('Hyperspace Co-occurrence Tests')
  console.log('==============================')

  test('hyperspace commons should not match non-hyperspace commons more than expected', () => {
    // This test detects if hyperspace upgrade doesn't properly replace the card
    // Bug scenario: if upgrade ADDS hyperspace instead of replacing, we'd see 100% match
    // Normal rate: very low (both must randomly draw the same card independently)
    clearBeltCache()
    const packCount = 500
    let matchesFound = 0
    const matchExamples: string[] = []

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')

      // Find hyperspace commons (non-leader, non-base, non-foil)
      const hsCommons = pack.cards.filter((c: Card) =>
        c.isHyperspace && c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil
      )

      // Find normal commons
      const normalCommons = pack.cards.filter((c: Card) =>
        !c.isHyperspace && c.rarity === 'Common' && !c.isLeader && !c.isBase && !c.isFoil
      )

      // Check if any hyperspace common has a matching normal common
      for (const hsCard of hsCommons) {
        // Get base ID (strip hyperspace variant suffix if any)
        const baseId = hsCard.id.replace(/-HS$/, '')
        const normalId = hsCard.id.includes('-HS') ? baseId : hsCard.id

        const matchingNormal = normalCommons.find((c: Card) => {
          const cBaseId = c.id.replace(/-HS$/, '')
          return cBaseId === baseId || c.id === normalId || c.name === hsCard.name
        })

        if (matchingNormal) {
          matchesFound++
          if (matchExamples.length < 5) {
            matchExamples.push(`Pack ${i + 1}: HS "${hsCard.name}" + normal "${matchingNormal.name}"`)
          }
        }
      }
    }

    // Expected rate calculation:
    // - Hyperspace upgrade occurs ~1/6 of the time for one common slot
    // - P(pack has hyperspace common) ≈ 1 - (5/6)^9 ≈ 80%
    // - When we have an HS common, normal commons are drawn from ~90 unique cards
    // - The other 8 normal commons each have 1/90 chance of matching the HS card
    // - P(match | HS common exists) = 1 - (89/90)^8 ≈ 8.5%
    // - Expected match rate ≈ 0.80 * 0.085 ≈ 6.8%
    // But this assumes independent draws. Belt dedup may reduce this.
    // Use conservative estimate of ~5%
    const expectedRate = 0.05

    const observedRate = matchesFound / packCount
    const stdDev = Math.sqrt(packCount * expectedRate * (1 - expectedRate))
    const zScore = (matchesFound - packCount * expectedRate) / stdDev

    // Warning at z > 2.5, fail at z > 4
    const warningZScore = 2.5
    const failZScore = 4.0

    console.log(`\x1b[36m   HS-normal common match rate: ${(observedRate * 100).toFixed(2)}% (${matchesFound}/${packCount})\x1b[0m`)
    console.log(`\x1b[36m   Expected rate: ~${(expectedRate * 100).toFixed(1)}%\x1b[0m`)
    console.log(`\x1b[36m   Z-score: ${zScore.toFixed(2)} (warn: ${warningZScore}, fail: ${failZScore})\x1b[0m`)

    if (zScore > warningZScore && zScore <= failZScore) {
      console.log(`\x1b[33m   ⚠️  WARNING: HS-common match rate higher than expected\x1b[0m`)
    }

    assert(
      zScore <= failZScore,
      `Hyperspace-normal common match rate (${(observedRate * 100).toFixed(1)}%) is extremely high vs expected ~${(expectedRate * 100).toFixed(1)}% ` +
      `(z=${zScore.toFixed(2)} > ${failZScore}). This may indicate hyperspace upgrade is not replacing cards properly. ` +
      `Examples: ${matchExamples.join('; ')}`
    )
  })

  test('hyperspace foil should not match non-foil in pack more than expected', () => {
    // Test that hyperfoil upgrades don't create unexpected duplicates
    clearBeltCache()
    const packCount = 500
    let matchesFound = 0
    const matchExamples: string[] = []

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')

      // Find hyperspace foil
      const hsFoil = pack.cards.find((c: Card) => c.isFoil && c.isHyperspace)
      if (!hsFoil) continue

      // Check if non-foil version exists in pack
      const nonFoilMatch = pack.cards.find((c: Card) =>
        !c.isFoil && (c.id === hsFoil.id || c.name === hsFoil.name)
      )

      if (nonFoilMatch) {
        matchesFound++
        if (matchExamples.length < 5) {
          matchExamples.push(`Pack ${i + 1}: HS foil "${hsFoil.name}" + "${nonFoilMatch.name}" (${nonFoilMatch.rarity})`)
        }
      }
    }

    // Hyperfoil rate is ~1/15
    // Expected match rate with any non-foil: similar to normal foil test
    // Use conservative ~8% (slightly higher due to HS cards in normal slots too)
    const packsWithHsFoil = packCount / 15 // rough estimate
    const observedRate = matchesFound / packCount
    const expectedRate = 0.008 // ~0.8% overall (1/15 * ~12% match chance)

    const stdDev = Math.sqrt(packCount * expectedRate * (1 - expectedRate))
    const zScore = (matchesFound - packCount * expectedRate) / stdDev

    const warningZScore = 2.5
    const failZScore = 4.0

    console.log(`\x1b[36m   HS foil-nonfoil match rate: ${(observedRate * 100).toFixed(2)}% (${matchesFound}/${packCount})\x1b[0m`)
    console.log(`\x1b[36m   Expected rate: ~${(expectedRate * 100).toFixed(2)}%\x1b[0m`)
    console.log(`\x1b[36m   Z-score: ${zScore.toFixed(2)} (warn: ${warningZScore}, fail: ${failZScore})\x1b[0m`)

    if (zScore > warningZScore && zScore <= failZScore) {
      console.log(`\x1b[33m   ⚠️  WARNING: HS foil match rate higher than expected\x1b[0m`)
    }

    assert(
      zScore <= failZScore,
      `Hyperspace foil match rate (${(observedRate * 100).toFixed(1)}%) is extremely high ` +
      `(z=${zScore.toFixed(2)} > ${failZScore}). This may indicate hyperfoil upgrade issue. ` +
      `Examples: ${matchExamples.join('; ')}`
    )
  })

  test('hyperspace + normal same-card pairs should be within expected range', () => {
    // When a common slot upgrades to hyperspace, it draws from the HS belt (random card)
    // NOT the hyperspace version of the specific card being replaced.
    // So occasionally the HS belt will serve a card that matches a normal card in the pack.
    //
    // Expected rate calculation:
    // - P(common upgrade occurs) = 1/3 per pack (from packConstants)
    // - When upgrade occurs, HS belt serves random HS common from ~90 unique commons
    // - P(HS common matches one of 8 remaining normal commons) = 8/90 ≈ 8.9%
    // - P(match in pack) ≈ 1/3 * 8/90 ≈ 3%
    // - With aspect coverage running after upgrades, rate may be slightly higher (~4-5%)
    //
    // This test ensures the rate isn't MUCH higher (which would indicate a belt correlation bug)
    clearBeltCache()
    const packCount = 500
    let pairsFound = 0
    const pairExamples: string[] = []

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')

      // Find all hyperspace cards (non-foil, as foils use different upgrade path)
      const hsCards = pack.cards.filter((c: Card) => c.isHyperspace && !c.isFoil)

      for (const hsCard of hsCards) {
        // Look for normal variant with same name
        const normalVariant = pack.cards.find((c: Card) =>
          c.variantType === 'Normal' &&
          c.name === hsCard.name &&
          !c.isFoil
        )

        if (normalVariant) {
          pairsFound++
          if (pairExamples.length < 5) {
            pairExamples.push(`Pack ${i + 1}: "${hsCard.name}" HS+Normal`)
          }
        }
      }
    }

    const observedRate = pairsFound / packCount
    // Expected rate ~5% (1/3 chance of upgrade * 8/90 chance of match, plus aspect fix passes)
    const expectedRate = 0.05

    const stdDev = Math.sqrt(packCount * expectedRate * (1 - expectedRate))
    const zScore = (pairsFound - packCount * expectedRate) / stdDev

    // Use same thresholds as other tests: warn at 2.5, fail at 4
    const warningZScore = 2.5
    const failZScore = 4.0

    console.log(`\x1b[36m   HS+Normal same-card rate: ${(observedRate * 100).toFixed(2)}% (${pairsFound}/${packCount})\x1b[0m`)
    console.log(`\x1b[36m   Expected rate: ~${(expectedRate * 100).toFixed(1)}%\x1b[0m`)
    console.log(`\x1b[36m   Z-score: ${zScore.toFixed(2)} (warn: ${warningZScore}, fail: ${failZScore})\x1b[0m`)

    if (zScore > warningZScore && zScore <= failZScore) {
      console.log(`\x1b[33m   ⚠️  WARNING: HS+Normal pair rate higher than expected\x1b[0m`)
      console.log(`\x1b[33m   Examples: ${pairExamples.join('; ')}\x1b[0m`)
    }

    assert(
      zScore <= failZScore,
      `HS+Normal same-card rate (${(observedRate * 100).toFixed(1)}%) is extremely high vs expected ~${(expectedRate * 100).toFixed(1)}% ` +
      `(z=${zScore.toFixed(2)} > ${failZScore}). This may indicate hyperspace belt is correlated with common belt. ` +
      `Examples: ${pairExamples.join('; ')}`
    )
  })

  console.log('')
  console.log('Hyperspace Foil Variant Tests')
  console.log('=============================')

  test('Hyperspace Foil variants appear at ~1/50 rate (foilToHyperfoil upgrade)', () => {
    // Hyperspace Foil cards should appear when a foil gets upgraded to hyperfoil.
    // The upgrade rate is 1/50 per pack (defined in packConstants.js as foilToHyperfoil).
    // When this happens, the foil slot should contain a card with variantType === 'Hyperspace Foil'
    clearBeltCache()

    const packCount = 1000
    let hyperspaceFoilFound = 0
    const examples: string[] = []

    for (let i = 0; i < packCount; i++) {
      const pack = generateBoosterPack(cards, 'SOR')

      for (const card of pack.cards as Card[]) {
        if (card.variantType === 'Hyperspace Foil') {
          hyperspaceFoilFound++
          if (examples.length < 5) {
            examples.push(`Pack ${i + 1}: "${card.name}"`)
          }
        }
      }
    }

    // Expected: 1/50 = 2% of packs should have a Hyperspace Foil
    const expectedRate = 1 / 50  // 0.02
    const expectedCount = packCount * expectedRate  // 20
    const observedRate = hyperspaceFoilFound / packCount

    console.log(`\x1b[36m   Hyperspace Foil cards found: ${hyperspaceFoilFound} in ${packCount} packs\x1b[0m`)
    console.log(`\x1b[36m   Expected: ~${expectedCount} (${(expectedRate * 100).toFixed(1)}% rate)\x1b[0m`)
    console.log(`\x1b[36m   Observed: ${(observedRate * 100).toFixed(1)}% rate\x1b[0m`)

    if (examples.length > 0) {
      console.log(`\x1b[36m   Examples: ${examples.join('; ')}\x1b[0m`)
    }

    // Should find at least some Hyperspace Foils (with 1000 packs at 1/50, expect ~20)
    // Use a conservative threshold of 5 to account for variance
    assert(
      hyperspaceFoilFound >= 5,
      `Hyperspace Foil variants should appear at ~1/50 rate. ` +
      `Expected ~${expectedCount} in ${packCount} packs, but found only ${hyperspaceFoilFound}. ` +
      `The foilToHyperfoil upgrade should use variantType === 'Hyperspace Foil' cards.`
    )
  })

  console.log('')
  console.log('Line + Stacking Collation Tests (Set 7+)')
  console.log('========================================')

  // Helper: is a pack structurally valid (16 cards, 1 leader, 1 common base)?
  // NOTE: sets 1-6 can also place a RARE base in the R/L slot, so we count the
  // guaranteed *common* base slot (matches the existing suite's convention).
  function isValidPack(pack: Pack): boolean {
    if (!pack || !Array.isArray(pack.cards)) return false
    if (pack.cards.length !== 16) return false
    if (pack.cards.filter((c: Card) => c.isLeader).length !== 1) return false
    if (pack.cards.filter((c: Card) => c.isBase && c.rarity === 'Common').length !== 1) return false
    return true
  }

  // S1a: stackBoxOrder is exactly the line→box permutation.
  // SPEC (LINE_STACKING_COLLATION_PLAN.md S1): line k (1-indexed) → box position
  //   12-(k-1)/2 for odd k, 24-(k-2)/2 for even k (24-pack box, columns of 12).
  // Reading box positions 12,24,11,23,...,1,13 must yield line order 1..24.
  test('S1a: stackBoxOrder maps line order to the exact box permutation (ASH/LAW spec)', () => {
    // Sentinels are line indices 1..24 (line order = generation sequence).
    const line = Array.from({ length: 24 }, (_, i) => i + 1)
    const box = stackBoxOrder(line)

    // Expected box array: box[pos-1] = line pack that lands at that position.
    // Derived directly from the spec mapping.
    const expectedBox = new Array(24)
    for (let k = 1; k <= 24; k++) {
      const pos = (k % 2 === 1) ? 12 - (k - 1) / 2 : 24 - (k - 2) / 2
      expectedBox[pos - 1] = k
    }
    assert(
      JSON.stringify(box) === JSON.stringify(expectedBox),
      `SPEC: stackBoxOrder must equal ${JSON.stringify(expectedBox)}, got ${JSON.stringify(box)}`
    )

    // Independent cross-check: reading positions 12,24,11,23,...,1,13 (Lee's order)
    // must recover line order 1,2,3,...,24.
    const readOrder = [12, 24, 11, 23, 10, 22, 9, 21, 8, 20, 7, 19, 6, 18, 5, 17, 4, 16, 3, 15, 2, 14, 1, 13]
    const recovered = readOrder.map(pos => box[pos - 1])
    assert(
      JSON.stringify(recovered) === JSON.stringify(line),
      `SPEC: reading box positions 12,24,...,1,13 must recover line order 1..24, got ${JSON.stringify(recovered)}`
    )
  })

  test('S1a: stackBoxOrder returns odd/short arrays unchanged (no stacking)', () => {
    const odd = Array.from({ length: 23 }, (_, i) => i + 1)
    assert(JSON.stringify(stackBoxOrder(odd)) === JSON.stringify(odd), 'Odd-length array must be unchanged')

    const one = [42]
    assert(JSON.stringify(stackBoxOrder(one)) === JSON.stringify(one), 'Length-1 array must be unchanged')

    const empty: number[] = []
    assert(JSON.stringify(stackBoxOrder(empty)) === JSON.stringify(empty), 'Empty array must be unchanged')

    // Even but not 24 (e.g. 6) still stacks by the general rule (columns of N/2).
    const six = [1, 2, 3, 4, 5, 6]
    const stackedSix = stackBoxOrder(six)
    assert(stackedSix.length === 6, 'Even array must retain all elements')
    assert(
      JSON.stringify([...stackedSix].sort()) === JSON.stringify([...six].sort()),
      'Stacking must be a permutation (same elements)'
    )
  })

  test('S1a: stackBoxOrder preserves object identity (only order changes)', () => {
    const objs = Array.from({ length: 24 }, (_, i) => ({ tag: i }))
    const stacked = stackBoxOrder(objs)
    // Every original object appears exactly once by reference.
    for (const o of objs) {
      assert(stacked.includes(o), `Original object tag=${o.tag} must survive stacking by reference`)
    }
    assert(stacked.length === 24, 'Stacked array must retain 24 elements')
  })

  // S1b: ASH generateSealedBox returns 24 valid packs; contents untouched by stacking.
  test('S1b: ASH generateSealedBox(24) returns 24 valid packs (contents untouched)', () => {
    const ashCards = getCachedCards('ASH')
    if (ashCards.length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }
    clearBeltCache()
    const box = generateSealedBox(ashCards, 'ASH', 24)
    assertEqual(box.length, 24, 'ASH box should contain 24 packs')
    box.forEach((pack: Pack, i: number) => {
      assert(isValidPack(pack), `ASH box pack ${i + 1} must have 16 cards, 1 leader, 1 base`)
    })
  })

  // S2: Sets 1-6 (setNumber < 7) get NO stacking — order is exactly as before.
  // We assert this at the helper level (stacking only wired for Set 7+) plus a
  // smoke check that JTL (set 4) boxes remain 24 valid packs.
  test('S2: JTL (set 4) generateSealedBox(24) returns 24 valid packs (no stacking regression)', () => {
    clearBeltCache()
    const box = generateSealedBox(getCachedCards('JTL'), 'JTL', 24)
    assertEqual(box.length, 24, 'JTL box should contain 24 packs')
    box.forEach((pack: Pack, i: number) => {
      assert(isValidPack(pack), `JTL box pack ${i + 1} must have 16 cards, 1 leader, 1 base`)
    })
  })

  test('S2: SOR (set 1) generateSealedBox(24) returns 24 valid packs (no stacking regression)', () => {
    clearBeltCache()
    const box = generateSealedBox(cards, 'SOR', 24)
    assertEqual(box.length, 24, 'SOR box should contain 24 packs')
    box.forEach((pack: Pack, i: number) => {
      assert(isValidPack(pack), `SOR box pack ${i + 1} must have 16 cards, 1 leader, 1 base`)
    })
  })

  // S3: Sealed pods (Set 7+) are cut from a stacked virtual box — consecutive box positions.
  test('S3: ASH generateSealedPod([], setCode, 24) equals exactly one full stacked box', () => {
    const ashCards = getCachedCards('ASH')
    if (ashCards.length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }
    clearBeltCache()
    const pods = generateSealedPod(ashCards, 'ASH', 24)
    assertEqual(pods.length, 24, 'A 24-pack ASH pod request should yield exactly one full box of 24 packs')
    pods.forEach((pack: Pack, i: number) => {
      assert(isValidPack(pack), `ASH pod-box pack ${i + 1} must have 16 cards, 1 leader, 1 base`)
    })
  })

  // S4: A booster box is ALWAYS 24 packs. Column depth (BOX_SIZE/2) and the belt
  // boot length are properties of the product, not parameters. Stacking any other
  // size invents a box that does not exist: it changes which line packs land
  // adjacent in a player's pool and drags a belt boot seam into the middle of it.
  //
  // This is the guard that was missing when the sealed pod route passed
  // `players * packsPerPlayer` — a 5-player pod (n=30) produced seats with 11-13
  // duplicate identities per pool against a 5.5-8.5 spec band.
  test('S4: SPEC — a Set 7+ box is always 24 packs; generateSealedBox rejects any other size', () => {
    assertEqual(BOX_SIZE, 24, 'BOX_SIZE must be 24 — a booster box is 24 packs')
    if (getCachedCards('ASH').length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }
    for (const badSize of [8, 12, 16, 30, 48]) {
      let threw = false
      try {
        clearBeltCache()
        generateSealedBox([], 'ASH', badSize)
      } catch {
        threw = true
      }
      assert(threw, `generateSealedBox([], 'ASH', ${badSize}) must throw — a box is always ${BOX_SIZE} packs`)
    }
  })

  test('S4: SPEC — Sets 1-6 have no box stacking, so non-24 sizes stay legal (no regression)', () => {
    clearBeltCache()
    const box = generateSealedBox(cards, 'SOR', 8)
    assertEqual(box.length, 8, 'SOR (set 1) must still allow an 8-pack request')
    box.forEach((pack: Pack, i: number) => {
      assert(isValidPack(pack), `SOR 8-pack request: pack ${i + 1} must be a valid pack`)
    })
  })

  // S5: Sets 1-6 must never acquire Set 7+ pack rules. The plan promises
  // "byte-identical behavior" for old sets, but nothing pinned it, so a Set 7+
  // feature could leak into them unnoticed. Output is random, so this pins the
  // structural signatures that separate the blocks (measured spec, not
  // implementation internals):
  //   Sets 1-6 — foil LAST (index 15), R/L at index 14, foil only occasionally
  //              hyperspace, NO guaranteed HS common.
  //   LAW+     — foil at index 11 (pos12), R/L at index 15, foil ALWAYS
  //              Hyperspace Foil, exactly 1 guaranteed HS common per pack.
  const LEGACY_SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']
  test('S5: SPEC — Sets 1-6 keep the legacy pack layout (foil last, R/L at 14)', () => {
    const N = 300
    for (const setCode of LEGACY_SETS) {
      if (getCachedCards(setCode).length === 0) {
        console.log(`\x1b[33m   Skipping ${setCode}: no card data\x1b[0m`)
        continue
      }
      clearBeltCache()
      let foilLast = 0, rlAt14 = 0
      for (let i = 0; i < N; i++) {
        const p = generateBoosterPack([], setCode).cards
        assertEqual(p.length, 16, `${setCode} pack must have 16 cards`)
        if (p[15]?.isFoil) foilLast++
        if ((p[14]?.rarity === 'Rare' || p[14]?.rarity === 'Legendary') && !p[14]?.isFoil) rlAt14++
      }
      assert(foilLast === N, `${setCode}: foil must be the LAST card (index 15) in every pack, got ${foilLast}/${N}`)
      assert(rlAt14 === N, `${setCode}: index 14 must be the Rare/Legendary slot in every pack, got ${rlAt14}/${N}`)
    }
  })

  test('S5: SPEC — Sets 1-6 have no guaranteed HS common and no always-hyperspace foil slot', () => {
    const N = 300
    for (const setCode of LEGACY_SETS) {
      if (getCachedCards(setCode).length === 0) continue
      clearBeltCache()
      let hsCommons = 0, hsFoils = 0
      for (let i = 0; i < N; i++) {
        const p = generateBoosterPack([], setCode).cards
        hsCommons += p.slice(2, 11).filter((c: Card) => c.isHyperspace).length
        if (p[15]?.isFoil && p[15]?.isHyperspace) hsFoils++
      }
      // LAW+ guarantees exactly 1 HS common per pack; legacy sets must stay well below.
      assert(hsCommons / N < 0.5,
        `${setCode}: ${(hsCommons / N).toFixed(2)} HS commons/pack — the Set 7+ guaranteed HS common leaked in`)
      // LAW+ foil slot is ALWAYS Hyperspace Foil; legacy foils only occasionally are.
      assert(hsFoils / N < 0.25,
        `${setCode}: ${(100 * hsFoils / N).toFixed(0)}% hyperspace foils — the Set 7+ foilSlotIsHyperspaceFoil rule leaked in`)
    }
  })

  test('S4: SPEC — generateSealedPod is the supported way to cut N packs from real boxes', () => {
    if (getCachedCards('ASH').length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }
    // Sizes that are NOT a box: each must succeed, because the pod path cuts
    // consecutive box positions and opens a fresh 24-pack box when one runs dry.
    for (const n of [6, 8, 12, 16, 30, 48]) {
      clearBeltCache()
      const packs = generateSealedPod([], 'ASH', n)
      assertEqual(packs.length, n, `generateSealedPod([], 'ASH', ${n}) should return ${n} packs`)
      packs.forEach((pack: Pack, i: number) => {
        assert(isValidPack(pack), `ASH pod (n=${n}) pack ${i + 1} must be a valid pack`)
      })
    }
  })

  test('S3: ASH 4 sequential 6-pack pods draw 24 packs from one virtual box (no shared refs)', () => {
    const ashCards = getCachedCards('ASH')
    if (ashCards.length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }
    clearBeltCache()
    const allPacks: Pack[] = []
    for (let podNum = 0; podNum < 4; podNum++) {
      const pod = generateSealedPod(ashCards, 'ASH', 6)
      assertEqual(pod.length, 6, `Pod ${podNum + 1} should have 6 packs`)
      pod.forEach((pack: Pack, i: number) => {
        assert(isValidPack(pack), `Pod ${podNum + 1} pack ${i + 1} must have 16 cards, 1 leader, 1 base`)
      })
      allPacks.push(...pod)
    }
    assertEqual(allPacks.length, 24, 'Four 6-pack pods should total 24 packs')

    // No two pods share a pack object reference (each is a distinct pack).
    for (let a = 0; a < allPacks.length; a++) {
      for (let b = a + 1; b < allPacks.length; b++) {
        assert(allPacks[a] !== allPacks[b], `Packs at ${a} and ${b} must be distinct object references`)
      }
    }
  })

  test('S3: clearBeltCache resets the virtual-box buffer (no stale state)', () => {
    const ashCards = getCachedCards('ASH')
    if (ashCards.length === 0) {
      console.log('\x1b[33m   Skipping: ASH placeholder catalog is not generated\x1b[0m')
      return
    }
    // Draw a partial pod to leave the buffer non-empty, then clear and redraw.
    clearBeltCache()
    const first = generateSealedPod(ashCards, 'ASH', 6)
    assertEqual(first.length, 6, 'First pod should have 6 packs')
    // clearBeltCache must discard any buffered remainder without errors.
    clearBeltCache()
    const afterClear = generateSealedPod(ashCards, 'ASH', 24)
    assertEqual(afterClear.length, 24, 'After clearBeltCache a 24-pack pod should yield a full fresh box')
    afterClear.forEach((pack: Pack, i: number) => {
      assert(isValidPack(pack), `Post-clear pod-box pack ${i + 1} must be valid`)
    })
  })

  test('S3: sets 1-6 pods keep independent-pack behavior (SOR pod of 6 is valid)', () => {
    clearBeltCache()
    const pod = generateSealedPod(cards, 'SOR', 6)
    assertEqual(pod.length, 6, 'SOR pod should have 6 packs')
    pod.forEach((pack: Pack, i: number) => {
      assert(isValidPack(pack), `SOR pod pack ${i + 1} must have 16 cards, 1 leader, 1 base`)
    })
  })

  console.log('')
  console.log('\x1b[35m======================\x1b[0m')
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
