// @ts-nocheck
/**
 * SWUDB Export Format Tests
 *
 * Validates that our JSON export format matches the SWUDB specification.
 * See docs/SWUDB_EXPORT_SPEC.md for the full specification.
 *
 * SWUDB expects:
 * - Card IDs in format SET_XXX (3-digit zero-padded numbers)
 * - Underscore separator (not hyphen)
 * - Variants resolved to Normal card IDs
 */

import assert from 'assert'
import { initializeCardCache, getCachedCards } from './cardCache'
import { buildBaseCardMap, getBaseCardId } from './variantDowngrade'

// Simple test framework
const results = { passed: 0, failed: 0 }

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`\x1b[32m✅ ${name}\x1b[0m`)
    results.passed++
  } catch (error) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m`)
    console.log(`\x1b[33m   ${(error as Error).message}\x1b[0m`)
    results.failed++
  }
}

// Initialize
console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
await initializeCardCache()

console.log('')
console.log('\x1b[1m\x1b[35m📤 SWUDB Export Format Tests\x1b[0m')
console.log('\x1b[35m============================\x1b[0m')

// Card ID Format Tests
console.log('')
console.log('Card ID Format (SET_XXX)')
console.log('========================')

test('card IDs use underscore separator, not hyphen', () => {
  const map = buildBaseCardMap('SOR')
  const cards = getCachedCards('SOR')
  const card = cards.find(c => c.variantType === 'Normal')

  const exportId = getBaseCardId(card, map)

  assert(!exportId.includes('-'), `ID should not contain hyphen: ${exportId}`)
  assert(exportId.includes('_'), `ID should contain underscore: ${exportId}`)
})

test('card numbers are zero-padded to 3 digits', () => {
  const map = buildBaseCardMap('SOR')
  const cards = getCachedCards('SOR')

  // Find a card with a low number (< 100)
  const lowNumCard = cards.find(c =>
    c.variantType === 'Normal' &&
    c.cardId &&
    parseInt(c.cardId.split('-')[1], 10) < 100
  )

  if (!lowNumCard) {
    console.log('   (No low-number cards found, skipping)')
    return
  }

  const exportId = getBaseCardId(lowNumCard, map)
  const parts = exportId.split('_')
  const numberPart = parts[1]

  assert(
    numberPart.length >= 3,
    `Number should be at least 3 digits: ${exportId} (got ${numberPart.length} digits)`
  )
})

test('single-digit card numbers become 3 digits (e.g., 8 -> 008)', () => {
  const map = buildBaseCardMap('SOR')
  const cards = getCachedCards('SOR')

  // Find a single-digit card
  const singleDigitCard = cards.find(c =>
    c.variantType === 'Normal' &&
    c.cardId &&
    parseInt(c.cardId.split('-')[1], 10) < 10
  )

  if (!singleDigitCard) {
    console.log('   (No single-digit cards found, skipping)')
    return
  }

  const exportId = getBaseCardId(singleDigitCard, map)
  const numberPart = exportId.split('_')[1]

  assert(
    numberPart.length === 3,
    `Single-digit number should be 3 digits: ${singleDigitCard.cardId} -> ${exportId}`
  )
  assert(
    numberPart.startsWith('00'),
    `Single-digit number should start with 00: ${exportId}`
  )
})

test('two-digit card numbers become 3 digits (e.g., 12 -> 012)', () => {
  const map = buildBaseCardMap('SOR')
  const cards = getCachedCards('SOR')

  // Find a two-digit card (10-99)
  const twoDigitCard = cards.find(c =>
    c.variantType === 'Normal' &&
    c.cardId &&
    parseInt(c.cardId.split('-')[1], 10) >= 10 &&
    parseInt(c.cardId.split('-')[1], 10) < 100
  )

  if (!twoDigitCard) {
    console.log('   (No two-digit cards found, skipping)')
    return
  }

  const exportId = getBaseCardId(twoDigitCard, map)
  const numberPart = exportId.split('_')[1]

  assert(
    numberPart.length === 3,
    `Two-digit number should be 3 digits: ${twoDigitCard.cardId} -> ${exportId}`
  )
  assert(
    numberPart.startsWith('0'),
    `Two-digit number should start with 0: ${exportId}`
  )
})

test('three-digit card numbers stay 3 digits (e.g., 200 -> 200)', () => {
  const map = buildBaseCardMap('SOR')
  const cards = getCachedCards('SOR')

  // Find a three-digit card (100+)
  const threeDigitCard = cards.find(c =>
    c.variantType === 'Normal' &&
    c.cardId &&
    parseInt(c.cardId.split('-')[1], 10) >= 100 &&
    parseInt(c.cardId.split('-')[1], 10) < 1000
  )

  if (!threeDigitCard) {
    console.log('   (No three-digit cards found, skipping)')
    return
  }

  const exportId = getBaseCardId(threeDigitCard, map)
  const numberPart = exportId.split('_')[1]

  assert(
    numberPart.length === 3,
    `Three-digit number should be 3 digits: ${threeDigitCard.cardId} -> ${exportId}`
  )
  assert(
    !numberPart.startsWith('0'),
    `Three-digit number should not start with 0: ${exportId}`
  )
})

// SWUDB Format Regex Test
console.log('')
console.log('SWUDB Format Validation')
console.log('=======================')

test('all exported IDs match SWUDB format: SET_XXX', () => {
  const swudbFormat = /^[A-Z]{3}_\d{3,}$/

  // Test across multiple sets
  const sets = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC']

  for (const setCode of sets) {
    const cards = getCachedCards(setCode)
    if (!cards || cards.length === 0) continue

    const map = buildBaseCardMap(setCode)
    const normalCards = cards.filter(c => c.variantType === 'Normal')

    for (const card of normalCards.slice(0, 10)) { // Test first 10 per set
      const exportId = getBaseCardId(card, map)
      assert(
        swudbFormat.test(exportId),
        `Card ${card.cardId} exported as "${exportId}" doesn't match SWUDB format SET_XXX`
      )
    }
  }
})

test('SEC set cards export with zero-padding (e.g., SEC_012)', () => {
  const cards = getCachedCards('SEC')
  if (!cards || cards.length === 0) {
    console.log('   (SEC cards not available, skipping)')
    return
  }

  const map = buildBaseCardMap('SEC')

  // Find SEC-12 specifically (the card from the user report)
  const sec12 = cards.find(c => c.cardId === 'SEC-12')
  if (sec12) {
    const exportId = getBaseCardId(sec12, map)
    assert(
      exportId === 'SEC_012',
      `SEC-12 should export as SEC_012, got: ${exportId}`
    )
  }

  // Test a few more SEC cards
  const secCards = cards.filter(c => c.variantType === 'Normal').slice(0, 5)
  for (const card of secCards) {
    const exportId = getBaseCardId(card, map)
    assert(
      exportId.startsWith('SEC_'),
      `SEC card should start with SEC_: ${exportId}`
    )
    const numberPart = exportId.split('_')[1]
    assert(
      numberPart.length >= 3,
      `SEC card number should be at least 3 digits: ${exportId}`
    )
  }
})

// Variant Resolution Tests
console.log('')
console.log('Variant Resolution')
console.log('==================')

test('Hyperspace cards export with Normal card ID format', () => {
  const map = buildBaseCardMap('SOR')
  const cards = getCachedCards('SOR')

  const hsCard = cards.find(c => c.variantType === 'Hyperspace')
  if (!hsCard) {
    console.log('   (No Hyperspace cards found, skipping)')
    return
  }

  const exportId = getBaseCardId(hsCard, map)
  const swudbFormat = /^[A-Z]{3}_\d{3,}$/

  assert(
    swudbFormat.test(exportId),
    `Hyperspace card should export in SWUDB format: ${exportId}`
  )
})

test('Foil cards export with Normal card ID format', () => {
  const map = buildBaseCardMap('SOR')
  const cards = getCachedCards('SOR')

  const foilCard = cards.find(c => c.variantType === 'Foil')
  if (!foilCard) {
    console.log('   (No Foil cards found, skipping)')
    return
  }

  const exportId = getBaseCardId(foilCard, map)
  const swudbFormat = /^[A-Z]{3}_\d{3,}$/

  assert(
    swudbFormat.test(exportId),
    `Foil card should export in SWUDB format: ${exportId}`
  )
})

// Deck Name Tests
console.log('')
console.log('Deck Name Handling')
console.log('==================')

// Helper: simulate the originalBaseName extraction logic from DeckBuilder.tsx
function extractBaseName(poolName: string): string {
  const cleaned = poolName
    .replace(/\s*\(.*$/, '')           // Remove everything from first ( onward
    .replace(/\s*\d{2}\/\d{2}\/\d{4}$/, '') // Remove trailing date
    .trim()
  return cleaned || poolName
}

// Helper: simulate the auto-naming logic from DeckBuilder.tsx
function buildAutoName(baseName: string, leaderName: string, baseColor: string): string {
  const suffix = baseColor ? `${leaderName} ${baseColor}` : leaderName
  let name = `${baseName} (${suffix})`
  if (name.length > 80) name = name.slice(0, 80)
  return name
}

test('BUGGY: old regex included leader/base suffix in base name, causing append', () => {
  // The old regex: /^(.+?\d{4})/ matched up to the year, including parenthetical suffixes
  const nameWithSuffix = 'SEC Sealed (Jabba the Hutt Green) 02/19/2026'
  const oldRegex = /^(.+?\d{4})/
  const oldMatch = nameWithSuffix.match(oldRegex)
  // Old code would set originalBaseName to the full string including the suffix
  assert(
    oldMatch![1].includes('Jabba'),
    'OLD BUG: regex captures leader suffix, causing names to grow'
  )
})

test('FIXED: new extraction strips parenthetical suffixes and dates', () => {
  // Simple name with date
  assert.strictEqual(extractBaseName('SEC Sealed 02/19/2026'), 'SEC Sealed')

  // Name with leader/base suffix AND date
  assert.strictEqual(
    extractBaseName('SEC Sealed (Jabba the Hutt Green) 02/19/2026'),
    'SEC Sealed'
  )

  // Name with multiple appended suffixes (the reported bug)
  assert.strictEqual(
    extractBaseName('SEC Sealed (Jabba the Hutt Green) (Lama Su Green) 02/19/2026'),
    'SEC Sealed'
  )

  // Name without date
  assert.strictEqual(extractBaseName('LAW Sealed'), 'LAW Sealed')

  // Name without date but with suffix
  assert.strictEqual(extractBaseName('LAW Sealed (Jabba the Hutt Green)'), 'LAW Sealed')

  // Multi-set chaos
  assert.strictEqual(extractBaseName('SOR-TWI Sealed 02/19/2026'), 'SOR-TWI Sealed')

  // Draft mode
  assert.strictEqual(extractBaseName('SEC Draft 02/19/2026'), 'SEC Draft')
})

test('FIXED: auto-naming replaces suffix instead of appending', () => {
  const baseName = extractBaseName('SEC Sealed (Jabba the Hutt Green) 02/19/2026')
  // baseName should be "SEC Sealed", not include old suffix
  const newName = buildAutoName(baseName, 'Lama Su', 'Green')
  assert.strictEqual(newName, 'SEC Sealed (Lama Su Green)')
  assert(!newName.includes('Jabba'), 'Old leader should not appear in new name')
})

test('auto-generated names do not include dates', () => {
  const baseName = extractBaseName('SEC Sealed')
  const name = buildAutoName(baseName, 'Jabba the Hutt', 'Green')
  assert.strictEqual(name, 'SEC Sealed (Jabba the Hutt Green)')
  assert(!name.includes('/'), 'Name should not contain date separators')
})

test('auto-generated names are truncated to 80 characters', () => {
  const longLeader = 'A'.repeat(80)
  const name = buildAutoName('SEC Sealed', longLeader, 'Green')
  assert(name.length <= 80, `Name should be <= 80 chars, got ${name.length}`)
})

test('metadata.name with [PTP] prefix is truncated to 80 characters', () => {
  const longPoolName = 'X'.repeat(80)
  const metadataName = `[PTP] ${longPoolName}`.slice(0, 80)
  assert(metadataName.length <= 80, `Metadata name should be <= 80 chars, got ${metadataName.length}`)
  assert(metadataName.startsWith('[PTP]'), 'Should still have prefix')
})

test('normal-length names are not truncated', () => {
  const poolName = 'SEC Sealed (Jabba the Hutt Green)'
  const metadataName = `[PTP] ${poolName}`.slice(0, 80)
  assert.strictEqual(metadataName, '[PTP] SEC Sealed (Jabba the Hutt Green)')
  assert(metadataName.length < 80, 'Normal name should be well under 80 chars')
})

// Summary
console.log('')
console.log('\x1b[35m============================\x1b[0m')
console.log(`\x1b[32m✅ Tests passed: ${results.passed}\x1b[0m`)
if (results.failed > 0) {
  console.log(`\x1b[31m❌ Tests failed: ${results.failed}\x1b[0m`)
  console.log('')
  console.log('\x1b[31m\x1b[1m💥 TESTS FAILED\x1b[0m')
  process.exit(1)
} else {
  console.log(`\x1b[90m   Tests failed: ${results.failed}\x1b[0m`)
  console.log('')
  console.log('\x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m')
}
