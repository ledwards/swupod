/**
 * Six-pack kit rarity mix vs the transcribed real ASH boxes.
 *
 * A kit is six packs a player opens together: consumer-order box positions
 * 1-6, 7-12, 13-18, 19-24 (see .claude/rules/belt-system.md — consumption
 * order is an assumption, the same one every real-box comparison here uses).
 * Only deck cards count (leaders and bases are one per pack everywhere), and
 * every printing counts at its printed rarity.
 *
 * Reference: every complete kit in data/real-boxes/ash-box-*.csv (42 kits).
 *
 *   - Kit rarity means are graded with the other kit metrics in
 *     compsScorecard.test.ts.
 *   - Legendaries in the R/L slot (pack index 15 on Set 7+, real pos16) per
 *     kit: real kits show 1 in 30 and 2 in 12 — never 0.
 *
 * Run with: npx tsx src/qa/kitRarity.test.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateSealedBox, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { realBoxFiles, parseCsv, REAL_BOX_DIR } from './comps/realKits'

const SET = 'ASH'
const BOXES = 250              // 1000 generated kits
const REAL_KITS = 42           // complete consumer-order kits in data/real-boxes
const RL_INDEX = 15            // Set 7+ R/L slot (pos16)

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

/** Legendaries in the R/L slot (pos 16) of every complete real kit. */
function realRlLegendariesPerKit(): number[] {
  const out: number[] = []
  for (const file of realBoxFiles()) {
    const rows = parseCsv(readFileSync(join(REAL_BOX_DIR, file), 'utf8'))
    const byPack: Record<number, Record<string, string>[]> = {}
    for (const r of rows) {
      const p = parseInt(r.pack!, 10)
      if (p) (byPack[p] = byPack[p] || []).push(r)
    }
    for (let g = 0; g < 4; g++) {
      const packs = [1, 2, 3, 4, 5, 6].map(k => byPack[g * 6 + k])
      if (packs.some(p => !p)) continue
      out.push(packs.flat().filter(r => r!.pos === '16' && r!.rarity === 'Legendary').length)
    }
  }
  return out
}

async function run() {
  await initializeCardCache()
  console.log('\x1b[1m\x1b[35m🎁 Six-pack kit rarity QA (ASH)\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  if (getCachedCards(SET).length === 0) {
    test(`${SET}: has card data`, () => { throw new Error(`no card data for ${SET}`) })
  } else {
    const realRl = realRlLegendariesPerKit()

    const genRl: number[] = []
    for (let b = 0; b < BOXES; b++) {
      clearBeltCache()
      const box = generateSealedBox([], SET)
      for (let g = 0; g < 4; g++) {
        const packs = box.slice(g * 6, g * 6 + 6)
        genRl.push(packs.filter(p => p.cards[RL_INDEX]?.rarity === 'Legendary').length)
      }
    }

    // Kit rarity means are graded with every other kit metric in
    // compsScorecard.test.ts (live Protect the Pod vs the real kits).

    test('SPEC: every kit has ≥1 legendary in the R/L slot (real: 1 in 30 kits, 2 in 12, never 0)', () => {
      const hist = (xs: number[]) => xs.reduce<Record<number, number>>((h, x) => { h[x] = (h[x] || 0) + 1; return h }, {})
      console.log(`\x1b[36m   R/L-slot legendaries per kit — real ${JSON.stringify(hist(realRl))} · gen ${JSON.stringify(hist(genRl))}\x1b[0m`)
      assert(realRl.length === REAL_KITS, `real R/L parse found ${realRl.length} kits, expected ${REAL_KITS}`)
      assert(!realRl.includes(0), 'real data changed: a real kit now has 0 R/L-slot legendaries — revisit this spec')
      const zero = genRl.filter(x => x === 0).length
      assert(zero === 0, `${zero}/${genRl.length} generated kits had no legendary in the R/L slot`)
    })
  }

  console.log('')
  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  console.log(failed > 0 ? `\x1b[31m❌ Tests failed: ${failed}\x1b[0m` : `\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  if (failed > 0) process.exit(1)
}

run()
