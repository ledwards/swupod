// @ts-nocheck
/**
 * Post-Process Card Data
 *
 * Applies fixes from cardFixes.js to the raw card data.
 * This script is called automatically after fetchCards.js
 * or can be run standalone to reprocess existing data.
 *
 * Usage:
 *   node scripts/postProcessCards.js
 *   node scripts/postProcessCards.js --input cards.raw.json --output cards.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { cardFixes, batchFixes, customTransforms } from './cardFixes.ts'
import { applyAshMetadata, mergeAshPlaceholderCatalog } from '../src/services/cards/ashPlaceholderCatalog.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Parse command line arguments
const args = process.argv.slice(2)
const inputArg = args.find(arg => arg.startsWith('--input='))
const outputArg = args.find(arg => arg.startsWith('--output='))

const INPUT_FILE = inputArg
  ? inputArg.split('=')[1]
  : path.join(__dirname, '../src/data/cards.json')

const OUTPUT_FILE = outputArg
  ? outputArg.split('=')[1]
  : INPUT_FILE

const REPORT_FILE = path.join(__dirname, '../src/data/card-fixes-report.json')

interface Card {
  id: string
  name: string
  [key: string]: any
}

interface CardData {
  cards: Card[]
  metadata: Record<string, any> | null
}

interface Fix {
  type: string
  cardId?: string
  cardName?: string
  field?: string
  oldValue?: any
  newValue?: any
  reason?: string
  transform?: string
  cardsRemoved?: number
}

interface FixReport {
  timestamp: string
  totalFixes: number
  byType: {
    individual: number
    batch: number
    custom: number
  }
  byField: Record<string, number>
  fixes: Fix[]
}

/**
 * Load card data from JSON file
 */
function loadCardData(filePath: string): CardData {
  const content = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(content)

  // Handle both formats: { cards: [...] } or just [...]
  if (Array.isArray(data)) {
    return { cards: data, metadata: null }
  }
  return { cards: data.cards || [], metadata: data.metadata || null }
}

/**
 * Save card data to JSON file
 */
function saveCardData(filePath: string, cards: Card[], metadata: Record<string, any> | null): void {
  const output = {
    cards,
    metadata: {
      ...metadata,
      lastProcessed: new Date().toISOString().split('T')[0],
      totalCards: cards.length,
      fixesApplied: metadata?.fixesApplied || 0,
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2))
}

/**
 * Apply individual card fixes
 */
function applyIndividualFixes(cards: Card[]): Fix[] {
  const fixes: Fix[] = []

  cardFixes.forEach(fix => {
    const card = cards.find(c => c.id === fix.id)
    if (card) {
      const oldValue = card[fix.field]
      card[fix.field] = fix.value
      fixes.push({
        type: 'individual',
        cardId: fix.id,
        cardName: card.name,
        field: fix.field,
        oldValue,
        newValue: fix.value,
        reason: fix.reason
      })
      console.log(`  ✓ Fixed ${fix.id} (${card.name}): ${fix.field} = ${fix.value}`)
    } else {
      console.warn(`  ⚠ Card not found: ${fix.id}`)
    }
  })

  return fixes
}

/**
 * Apply batch fixes
 */
function applyBatchFixes(cards: Card[]): Fix[] {
  const fixes: Fix[] = []

  batchFixes.forEach(batchFix => {
    cards.forEach(card => {
      if (batchFix.condition(card)) {
        const oldValue = card[batchFix.field]
        card[batchFix.field] = batchFix.value
        fixes.push({
          type: 'batch',
          cardId: card.id,
          cardName: card.name,
          field: batchFix.field,
          oldValue,
          newValue: batchFix.value,
          reason: batchFix.reason
        })
      }
    })
  })

  if (fixes.length > 0) {
    console.log(`  ✓ Applied ${fixes.length} batch fixes`)
  }

  return fixes
}

/**
 * Apply custom transformations
 */
function applyCustomTransforms(cards: Card[]): Fix[] {
  const fixes: Fix[] = []
  let currentCards = cards

  customTransforms.forEach(transform => {
    console.log(`  Running custom transform: ${transform.name}`)

    // Check if this is an array-level transform
    if (transform.isArrayTransform) {
      const originalLength = currentCards.length
      currentCards = transform.transform(currentCards)
      const removedCount = originalLength - currentCards.length

      if (removedCount > 0) {
        console.log(`    Removed ${removedCount} cards`)
        fixes.push({
          type: 'custom',
          transform: transform.name,
          cardsRemoved: removedCount
        })
      }
    } else {
      // Per-card transform
      currentCards.forEach((card, index) => {
        const original = JSON.stringify(card)
        const transformed = transform.transform(card)
        const modified = JSON.stringify(transformed)

        if (original !== modified) {
          currentCards[index] = transformed
          fixes.push({
            type: 'custom',
            cardId: card.id,
            cardName: card.name,
            transform: transform.name
          })
        }
      })
    }
  })

  // Replace cards array contents with transformed cards
  cards.length = 0
  cards.push(...currentCards)

  if (fixes.length > 0) {
    console.log(`  ✓ Applied ${fixes.length} custom transformations`)
  }

  return fixes
}

/**
 * Generate fix report
 */
function generateReport(allFixes: Fix[]): FixReport {
  const report: FixReport = {
    timestamp: new Date().toISOString(),
    totalFixes: allFixes.length,
    byType: {
      individual: allFixes.filter(f => f.type === 'individual').length,
      batch: allFixes.filter(f => f.type === 'batch').length,
      custom: allFixes.filter(f => f.type === 'custom').length,
    },
    byField: {},
    fixes: allFixes
  }

  // Count fixes by field
  allFixes.forEach(fix => {
    if (fix.field) {
      report.byField[fix.field] = (report.byField[fix.field] || 0) + 1
    }
  })

  return report
}

/**
 * Main function
 */
function main(): void {
  console.log('Post-processing card data...\n')
  console.log(`Input:  ${INPUT_FILE}`)
  console.log(`Output: ${OUTPUT_FILE}\n`)

  // Load card data
  const { cards, metadata } = loadCardData(INPUT_FILE)
  console.log(`✓ Loaded ${cards.length} cards\n`)

  // Apply fixes
  const allFixes: Fix[] = []

  console.log('Applying individual fixes...')
  const individualFixes = applyIndividualFixes(cards)
  allFixes.push(...individualFixes)

  console.log('\nApplying batch fixes...')
  const batchFixesApplied = applyBatchFixes(cards)
  allFixes.push(...batchFixesApplied)

  console.log('\nApplying custom transforms...')
  const customFixes = applyCustomTransforms(cards)
  allFixes.push(...customFixes)

  console.log('\nMerging ASH placeholder catalog...')
  const ashMerge = mergeAshPlaceholderCatalog(cards)
  cards.length = 0
  cards.push(...ashMerge.cards)
  console.log(
    `  ✓ ASH catalog: ${ashMerge.metadata.realCardCount} real, ` +
    `${ashMerge.metadata.placeholderCardCount} placeholders, ` +
    `${ashMerge.metadata.spoiledNormalCount} spoiled normal`
  )
  if (ashMerge.metadata.status !== 'valid') {
    console.warn(
      `  ⚠ ASH placeholder bucket contradictions: ` +
      ashMerge.metadata.contradictions.map(item =>
        `${item.bucketId} target=${item.targetCount} real=${item.realCount}`
      ).join(', ')
    )
  }

  // Generate report
  const report = generateReport(allFixes)
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2))

  // Update metadata
  if (metadata) {
    metadata.fixesApplied = allFixes.length
  }
  const outputMetadata = applyAshMetadata(metadata, ashMerge.metadata)

  // Save processed data
  saveCardData(OUTPUT_FILE, cards, outputMetadata)

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('Post-processing complete!')
  console.log('='.repeat(50))
  console.log(`Total fixes applied: ${allFixes.length}`)
  console.log(`  Individual: ${report.byType.individual}`)
  console.log(`  Batch:      ${report.byType.batch}`)
  console.log(`  Custom:     ${report.byType.custom}`)
  console.log(`\nProcessed cards saved to: ${OUTPUT_FILE}`)
  console.log(`Fix report saved to: ${REPORT_FILE}`)

  if (allFixes.length > 0) {
    console.log('\nFields modified:')
    Object.entries(report.byField).forEach(([field, count]) => {
      console.log(`  ${field}: ${count} fixes`)
    })
  }
}

main()
