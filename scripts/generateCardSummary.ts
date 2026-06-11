#!/usr/bin/env npx tsx
/**
 * Generate src/data/cardSummary.json — a tiny per-set aggregate (a few
 * hundred bytes) derived from the CORRECTED card data (src/utils/cardData
 * applies the runtime fix layer at import).
 *
 * Client code that only needs set-level presence/progress booleans
 * (membership gates, spoiler counters, catalog filters) imports this summary
 * instead of cards.json, keeping the ~8 MB dataset out of client bundles
 * (U5, foundations hardening). Full card data for clients is served by
 * GET /api/cards.
 *
 * Regenerated automatically at the end of scripts/postProcessCards.ts, so it
 * can never drift from cards.json. CI's bundle guard enforces that no client
 * chunk grows back to card-database size.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getAllCards } from '../src/utils/cardData'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, '../src/data/cardSummary.json')

export interface SetSummary {
  /** All cards in the set (every variant) */
  total: number
  /** Non-placeholder cards (every variant) */
  real: number
  /** Normal-variant cards (the user-facing gameplay count) */
  normalTotal: number
  /** Non-placeholder Normal-variant cards (spoiled count) */
  normalReal: number
}

export function buildCardSummary(): Record<string, SetSummary> {
  const summary: Record<string, SetSummary> = {}
  for (const card of getAllCards()) {
    const set = String(card.set || '').toUpperCase()
    if (!set) continue
    const entry = (summary[set] ??= { total: 0, real: 0, normalTotal: 0, normalReal: 0 })
    const isReal = card.isPlaceholder !== true
    const isNormal = (card.variantType || 'Normal') === 'Normal'
    entry.total++
    if (isReal) entry.real++
    if (isNormal) {
      entry.normalTotal++
      if (isReal) entry.normalReal++
    }
  }
  return summary
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const summary = buildCardSummary()
  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2) + '\n')
  console.log(`✓ Card summary written to ${OUTPUT_PATH} (${Object.keys(summary).length} sets)`)
}
