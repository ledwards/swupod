// @ts-nocheck
/**
 * Card Data Validation Tests
 *
 * Run with: npx tsx src/data/cards.test.ts
 */

import { initializeCardCache, getCachedCards } from '../utils/cardCache'

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

async function runTests(): Promise<void> {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()

  console.log('')
  console.log('\x1b[1m\x1b[35m🎴 Card Data Validation Tests\x1b[0m')
  console.log('\x1b[35m==============================\x1b[0m')

  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']

  sets.forEach(setCode => {
    const cards = getCachedCards(setCode)

    test(`${setCode}: has card data`, () => {
      assert(cards.length > 0, `${setCode} should have cards`)
    })

    test(`${setCode}: all cards have required fields`, () => {
      const requiredFields = ['id', 'name', 'set', 'rarity', 'type']
      cards.forEach((card: any, index: number) => {
        requiredFields.forEach(field => {
          assert(
            card[field] !== null && card[field] !== undefined,
            `Card at index ${index} (${card.name || 'unknown'}) missing required field: ${field}`
          )
        })
      })
    })

    test(`${setCode}: all cards have valid variant types`, () => {
      const validVariants = ['Normal', 'Hyperspace', 'Foil', 'Hyperspace Foil', 'Showcase', 'Standard Prestige', 'Foil Prestige', 'Serialized Prestige', 'GC 2026 Promo']
      cards.forEach((card: any) => {
        assert(
          validVariants.includes(card.variantType),
          `Card "${card.name}" (${card.id}) has invalid variantType: ${card.variantType}`
        )
      })
    })

    test(`${setCode}: all cards have valid rarities`, () => {
      const validRarities = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special']
      cards.forEach((card: any) => {
        assert(
          validRarities.includes(card.rarity),
          `Card "${card.name}" (${card.id}) has invalid rarity: ${card.rarity}`
        )
      })
    })

    test(`${setCode}: no duplicate Normal variant cards`, () => {
      const normalCards = cards.filter((c: any) => c.variantType === 'Normal')
      const seen = new Map<string, number>()
      const duplicates: Array<{ id: string; name: string; firstIndex: number; duplicateIndex: number }> = []

      normalCards.forEach((card: any) => {
        const key = card.id
        if (seen.has(key)) {
          duplicates.push({
            id: card.id,
            name: card.name,
            firstIndex: seen.get(key)!,
            duplicateIndex: cards.indexOf(card)
          })
        } else {
          seen.set(key, cards.indexOf(card))
        }
      })

      if (duplicates.length > 0) {
        const dupeList = duplicates.map(d => `"${d.name}" (${d.id})`).join(', ')
        throw new Error(`Found ${duplicates.length} duplicate Normal variant cards: ${dupeList}`)
      }
    })

    test(`${setCode}: leaders have isLeader flag`, () => {
      const leaders = cards.filter((c: any) => c.type === 'Leader')
      leaders.forEach((card: any) => {
        assert(
          card.isLeader === true,
          `Leader "${card.name}" (${card.id}) missing isLeader flag`
        )
      })
    })

    test(`${setCode}: bases have isBase flag`, () => {
      const bases = cards.filter((c: any) => c.type === 'Base')
      bases.forEach((card: any) => {
        assert(
          card.isBase === true,
          `Base "${card.name}" (${card.id}) missing isBase flag`
        )
      })
    })

    test(`${setCode}: foil cards have isFoil flag`, () => {
      const foilCards = cards.filter((c: any) =>
        c.variantType === 'Foil' || c.variantType === 'Hyperspace Foil'
      )
      foilCards.forEach((card: any) => {
        assert(
          card.isFoil === true,
          `Foil card "${card.name}" (${card.id}) missing isFoil flag`
        )
      })
    })

    test(`${setCode}: Hyperspace cards have isHyperspace flag`, () => {
      const hyperspaceCards = cards.filter((c: any) =>
        c.variantType === 'Hyperspace' || c.variantType === 'Hyperspace Foil'
      )
      hyperspaceCards.forEach((card: any) => {
        assert(
          card.isHyperspace === true,
          `Hyperspace card "${card.name}" (${card.id}) missing isHyperspace flag`
        )
      })
    })

    test(`${setCode}: Showcase cards have isShowcase flag`, () => {
      const showcaseCards = cards.filter((c: any) => c.variantType === 'Showcase')
      showcaseCards.forEach((card: any) => {
        assert(
          card.isShowcase === true,
          `Showcase card "${card.name}" (${card.id}) missing isShowcase flag`
        )
      })
    })

    test(`${setCode}: all Normal variant cards have image URLs`, () => {
      const normalCards = cards.filter((c: any) => c.variantType === 'Normal')
      const missingImages = normalCards.filter((c: any) => !c.imageUrl)

      if (missingImages.length > 0) {
        const missing = missingImages.slice(0, 5).map((c: any) => `"${c.name}" (${c.id})`).join(', ')
        const more = missingImages.length > 5 ? ` and ${missingImages.length - 5} more` : ''
        throw new Error(`${missingImages.length} Normal cards missing imageUrl: ${missing}${more}`)
      }
    })

    test(`${setCode}: leaders with backText have backImageUrl`, () => {
      const leadersWithBackText = cards.filter((c: any) =>
        c.isLeader && c.backText && c.variantType === 'Normal'
      )
      const missingBackImages = leadersWithBackText.filter((c: any) => !c.backImageUrl)

      if (missingBackImages.length > 0) {
        const missing = missingBackImages.map((c: any) => `"${c.name}" (${c.id})`).join(', ')
        throw new Error(`${missingBackImages.length} leaders with backText missing backImageUrl: ${missing}`)
      }
    })

    test(`${setCode}: units have power and hp`, () => {
      const units = cards.filter((c: any) => c.type === 'Unit' && c.variantType === 'Normal')
      units.forEach((card: any) => {
        assert(
          card.power !== null && card.power !== undefined,
          `Unit "${card.name}" (${card.id}) missing power`
        )
        assert(
          card.hp !== null && card.hp !== undefined,
          `Unit "${card.name}" (${card.id}) missing hp`
        )
      })
    })

    test(`${setCode}: non-units/leaders/bases have null power and hp`, () => {
      const nonCombatCards = cards.filter((c: any) =>
        c.type !== 'Unit' && c.type !== 'Leader' && c.type !== 'Base' && c.type !== 'Upgrade' && c.variantType === 'Normal'
      )
      nonCombatCards.forEach((card: any) => {
        assert(
          card.power === null,
          `Non-combat card "${card.name}" (${card.id}) should have null power (Upgrades are allowed to have power/hp as +X/+Y)`
        )
        assert(
          card.hp === null,
          `Non-combat card "${card.name}" (${card.id}) should have null hp (Upgrades are allowed to have power/hp as +X/+Y)`
        )
      })
    })
  })

  console.log('')
  console.log('\x1b[35m==============================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m❌ Tests failed: ${failed}\x1b[0m`)
  } else {
    console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  }
  console.log('')

  if (failed > 0) {
    console.log('\x1b[31m\x1b[1m💥 DATA VALIDATION FAILED\x1b[0m')
    process.exit(1)
  } else {
    console.log('\x1b[32m\x1b[1m🎉 ALL DATA VALIDATION PASSED!\x1b[0m')
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
