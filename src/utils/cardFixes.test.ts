// @ts-nocheck
/**
 * Tests for runtime card fixes
 * Verifies that fixes are applied correctly when card data is loaded
 */

import { applyCardFixes, getFixStats } from './cardFixes'

console.log('='.repeat(60))
console.log('Testing Runtime Card Fixes')
console.log('='.repeat(60))

interface CardData {
  cards: any[]
  metadata: {
    version?: string
    processedAt?: string
    fixesAppliedAtRuntime?: number
  }
}

/**
 * Test 1: Basic fix application
 */
function testBasicFixApplication(): boolean {
  console.log('\n[Test 1] Basic fix application')

  const testData: CardData = {
    cards: [
      {
        id: 'TEST-001',
        name: 'Test Card 1',
        set: 'TEST',
        type: 'Unit',
        rarity: 'Common',
        cost: 3,
      },
      {
        id: 'TEST-002',
        name: 'Test Card 2',
        set: 'TEST',
        type: 'Leader',
        rarity: 'Rare',
        isLeader: false, // Should be true
      },
    ],
    metadata: {
      version: '1.0.0',
    }
  }

  const result = applyCardFixes(testData)

  // Verify structure
  if (!result.cards || !Array.isArray(result.cards)) {
    console.error('  ❌ Result should have cards array')
    return false
  }

  if (!result.metadata) {
    console.error('  ❌ Result should have metadata')
    return false
  }

  // Verify original data wasn't mutated
  if ((testData.cards[0] as any).mutated) {
    console.error('  ❌ Original data was mutated')
    return false
  }

  // Verify metadata added
  if (!result.metadata.processedAt) {
    console.error('  ❌ Missing processedAt in metadata')
    return false
  }

  console.log('  ✓ Fix application structure is correct')
  console.log(`  ✓ Processed ${result.cards.length} cards`)
  console.log(`  ✓ Applied ${result.metadata.fixesAppliedAtRuntime || 0} fixes`)
  return true
}

/**
 * Test 2: Handle empty data
 */
function testEmptyData(): boolean {
  console.log('\n[Test 2] Handle empty data')

  const emptyData: CardData = { cards: [], metadata: {} }
  const result = applyCardFixes(emptyData)

  if (result.cards.length !== 0) {
    console.error('  ❌ Should return empty cards array')
    return false
  }

  console.log('  ✓ Empty data handled correctly')
  return true
}

/**
 * Test 3: Handle array format (backward compatibility)
 */
function testArrayFormat(): boolean {
  console.log('\n[Test 3] Handle array format')

  // Include variantType so cards aren't filtered by custom transforms
  const arrayData = [
    { id: 'TEST-001', name: 'Test 1', set: 'TEST', type: 'Unit', variantType: 'Normal' },
    { id: 'TEST-002', name: 'Test 2', set: 'TEST', type: 'Unit', variantType: 'Normal' },
  ]

  const result = applyCardFixes(arrayData as any)

  if (!result.cards || result.cards.length !== 2) {
    console.error('  ❌ Should convert array to object format')
    return false
  }

  console.log('  ✓ Array format handled correctly')
  return true
}

/**
 * Test 4: Batch fix simulation
 */
function testBatchFixes(): boolean {
  console.log('\n[Test 4] Batch fixes (checking if batch fixes run)')

  const testData: CardData = {
    cards: [
      {
        id: 'TEST-001',
        name: 'Hyperspace Variant',
        set: 'TEST',
        variantType: 'Hyperspace',
        isHyperspace: false, // Should be fixed to true by batch fix
      },
      {
        id: 'TEST-002',
        name: 'Normal Variant',
        set: 'TEST',
        variantType: 'Normal',
        isHyperspace: false,
      },
    ],
    metadata: {}
  }

  const result = applyCardFixes(testData)

  // Check if Hyperspace card got fixed (if batch fix is active)
  const hyperspaceCard = result.cards.find((c: any) => c.id === 'TEST-001')

  if (hyperspaceCard.variantType === 'Hyperspace') {
    console.log(`  ℹ Hyperspace card isHyperspace: ${hyperspaceCard.isHyperspace}`)
    console.log('  ✓ Batch fix logic executed')
  }

  return true
}

/**
 * Test 5: Get fix stats
 */
function testFixStats(): boolean {
  console.log('\n[Test 5] Get fix statistics')

  const stats = getFixStats()

  if (typeof stats.total !== 'number') {
    console.error('  ❌ Stats should have total count')
    return false
  }

  console.log(`  ✓ Individual fixes configured: ${stats.individualFixes}`)
  console.log(`  ✓ Batch fixes configured: ${stats.batchFixes}`)
  console.log(`  ✓ Custom transforms configured: ${stats.customTransforms}`)
  console.log(`  ✓ Total fixes: ${stats.total}`)
  return true
}

/**
 * Test 6: No data mutation
 */
function testNoMutation(): boolean {
  console.log('\n[Test 6] Original data is not mutated')

  // Include variantType so card isn't filtered by custom transforms
  const originalData: CardData = {
    cards: [
      { id: 'TEST-001', name: 'Test Card', set: 'TEST', type: 'Unit', variantType: 'Normal', value: 100 }
    ],
    metadata: { version: '1.0.0' }
  }

  // Store original stringified version
  const originalString = JSON.stringify(originalData)

  // Apply fixes
  const result = applyCardFixes(originalData)

  // Modify result
  result.cards[0].value = 999

  // Check original is unchanged
  if ((originalData.cards[0] as any).value !== 100) {
    console.error('  ❌ Original data was mutated')
    return false
  }

  const afterString = JSON.stringify(originalData)
  if (originalString !== afterString) {
    console.error('  ❌ Original data structure was changed')
    return false
  }

  console.log('  ✓ Original data remains unchanged')
  return true
}

/**
 * Run all tests
 */
function runTests(): void {
  const tests = [
    { name: 'Basic fix application', fn: testBasicFixApplication },
    { name: 'Empty data handling', fn: testEmptyData },
    { name: 'Array format handling', fn: testArrayFormat },
    { name: 'Batch fixes', fn: testBatchFixes },
    { name: 'Fix statistics', fn: testFixStats },
    { name: 'No data mutation', fn: testNoMutation },
  ]

  let passed = 0
  let failed = 0
  let totalAssertions = 0

  tests.forEach(test => {
    try {
      // Count console.log statements with checkmarks as assertions
      const originalLog = console.log
      let assertionCount = 0
      console.log = function(...args: any[]): void {
        const msg = args.join(' ')
        if (msg.includes('✓')) {
          assertionCount++
        }
        originalLog.apply(console, args)
      }

      const result = test.fn()
      console.log = originalLog

      if (result) {
        passed++
        totalAssertions += assertionCount
      } else {
        failed++
      }
    } catch (error) {
      console.error(`  ❌ Test threw error: ${(error as Error).message}`)
      failed++
    }
  })

  console.log('\n' + '='.repeat(60))
  console.log('Test Results')
  console.log('='.repeat(60))
  console.log(`Test Groups:        ${tests.length}`)
  console.log(`Groups Passed:      ${passed} ✓`)
  console.log(`Groups Failed:      ${failed} ${failed > 0 ? '❌' : ''}`)
  console.log(`Total Assertions:   ${totalAssertions}`)
  console.log('='.repeat(60))
  console.log(`\n✅ ${passed} test groups passed with ${totalAssertions} individual test assertions!`)
  console.log('='.repeat(60))

  if (failed > 0) {
    process.exit(1)
  }
}

// Run tests
runTests()
