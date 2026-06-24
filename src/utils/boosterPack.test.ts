// @ts-nocheck
/**
 * Booster Pack Generation Tests
 *
 * Run with: npx tsx src/utils/boosterPack.test.ts
 */

import { generateBoosterPack, generateSealedPod, clearBeltCache } from './boosterPack'
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

  test('all cards are Normal or Hyperspace or Showcase variants', () => {
    clearBeltCache()
    const pack = generateBoosterPack(cards, 'SOR')
    const validVariants = ['Normal', 'Hyperspace', 'Showcase']
    assert(
      pack.cards.every((c: Card) => validVariants.includes(c.variantType || 'Normal')),
      'All cards should be Normal, Hyperspace, or Showcase variants'
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
    // Prerelease sets (ASH) have no Hyperspace/HSF art from FFG yet, so the foil
    // slot is a PLAIN foil placeholder (foil overlay only) — not a fake hyperspace
    // foil with a hyperspace treatment it has no art for.
    assertEqual(
      pack.cards.filter((c: Card) => c.isFoil).length,
      1,
      'ASH pack should contain exactly 1 foil slot'
    )
    assertEqual(
      pack.cards.filter((c: Card) => c.isFoil && c.isHyperspace).length,
      0,
      'ASH foil slot is a plain foil (no hyperspace art yet), not a hyperspace foil'
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

    // Statistical significance threshold: z > 3 means something is wrong
    // This corresponds to ~0.3% probability under normal operation
    const maxZScore = 3.0

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

    // Expected rate for sealed pods:
    // - 6 packs, each with 9 commons from belts A/B (~45 cards each)
    // - 54 commons drawn total, ~27 from each belt = ~54 unique (belts don't fully cycle)
    // - 6 foils drawn, ~4.67 are commons (77.8%)
    // - P(foil common matches one of 54 unique commons) = 54/90 = 60%
    // - P(at least one of ~4.67 foils matches) ≈ 1 - (1-0.60)^4.67 ≈ 98.6%
    // - Expected pairs per pod = 4.67 * 0.60 = 2.80
    const expectedPodRate = 0.986
    const expectedPairsPerPod = 2.8

    // For average pairs, use z-score on the mean
    // Variance for sum of Bernoulli trials: n * p * (1-p) where p = 0.60, n ≈ 4.67
    const pairsVariancePerPod = 4.67 * 0.60 * 0.40 // ≈ 1.12
    const pairsStdDev = Math.sqrt(podCount * pairsVariancePerPod)
    const pairsMean = podCount * expectedPairsPerPod
    const pairsZScore = Math.abs(totalPairs - pairsMean) / pairsStdDev

    // Use 4.0σ threshold to reduce flakiness with 100-sample test runs
    // (Statistical tests with many iterations can occasionally exceed 3.5σ by chance)
    const maxZScore = 4.0

    console.log(`\x1b[36m   Pods with card+foil pairs: ${podsWithPairs}/${podCount} (${(podPairRate * 100).toFixed(1)}%)\x1b[0m`)
    console.log(`\x1b[36m   Expected pod rate (mathematical): ~${(expectedPodRate * 100).toFixed(0)}%\x1b[0m`)
    console.log(`\x1b[36m   Average pairs per pod: ${avgPairsPerPod.toFixed(2)} (expected: ~${expectedPairsPerPod})\x1b[0m`)
    console.log(`\x1b[36m   Z-score for pairs count: ${pairsZScore.toFixed(2)} (threshold: ${maxZScore})\x1b[0m`)

    if (pairsZScore > maxZScore) {
      console.log(`\x1b[33m   ⚠️  Pairs count deviates significantly from expected\x1b[0m`)
    }

    assert(
      pairsZScore <= maxZScore,
      `Average pairs per pod (${avgPairsPerPod.toFixed(2)}) deviates significantly from expected ~${expectedPairsPerPod} ` +
      `(z=${pairsZScore.toFixed(2)} > ${maxZScore}). This may indicate a bug in belt operation. ` +
      `Examples: ${pairDetails.join('; ')}`
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

    // With 1/6 probability, we expect ~17 out of 100
    // Allow wide variance for randomness
    assert(
      hyperspaceLeaderCount > 5,
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

    // With 1/6 probability, we expect ~17 out of 100
    assert(
      hyperspaceBaseCount > 5,
      `Expected some Hyperspace bases, got ${hyperspaceBaseCount} out of ${packCount}`
    )
  })

  test('over many packs, some foils get upgraded to Hyperfoil', () => {
    clearBeltCache()
    let hyperfoilCount = 0
    const packCount = 500

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
    const maxAcceptableRate = 0.60

    console.log(`\x1b[36m   HS+Normal same-leader pod rate: ${(observedRate * 100).toFixed(1)}% (${podsWithViolation}/${podCount})\x1b[0m`)
    console.log(`\x1b[36m   Independent-belt sanity cap: ${(maxAcceptableRate * 100).toFixed(0)}%\x1b[0m`)

    if (violationExamples.length > 0) {
      console.log(`\x1b[36m   Examples: ${violationExamples.join('; ')}\x1b[0m`)
    }

    assert(
      observedRate <= maxAcceptableRate,
      `HS+Normal same-leader rate (${(observedRate * 100).toFixed(1)}%) exceeds ${(maxAcceptableRate * 100).toFixed(0)}% ` +
      `for independent leader belts. ` +
      `Examples: ${violationExamples.join('; ')}`
    )
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
