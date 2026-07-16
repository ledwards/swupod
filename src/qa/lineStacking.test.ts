/**
 * Line + Stacking collation QA (Set 7+)
 *
 * Distribution-level regression guards for the line+stacking model
 * (plans/LINE_STACKING_COLLATION_PLAN.md S4/S5). Bands are calibrated to real
 * data (box 001, pool 002, LAW event fixtures) and widened for the QA sample
 * size — every assertion is rate-based (no seed-luck hard zeros).
 *
 * Run with: npx tsx src/qa/lineStacking.test.ts
 */

import { generateSealedBox, stackBoxOrder, clearBeltCache } from '../utils/boosterPack'
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

const id = (c) => `${c.name}|${c.subtitle || ''}`
const isDeck = (c) => !c.isLeader && !c.isBase
const isNormal = (c) => (c.variantType || 'Normal') === 'Normal'

async function run() {
  await initializeCardCache()
  console.log('\x1b[1m\x1b[35m📦 Line + Stacking Collation QA (Set 7+)\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  const BOXES = 40
  clearBeltCache()

  const nnPairs = []
  const dupIds = []
  const boxUnique = []
  let packCount = 0, packDups = 0, packDupsCross = 0

  for (let b = 0; b < BOXES; b++) {
    const box = generateSealedBox([], 'ASH', 24)
    const boxIds = {}
    box.forEach(pack => {
      packCount++
      const deck = pack.cards.filter(isDeck)
      const seen = {}
      deck.forEach(c => { (seen[id(c)] = seen[id(c)] || []).push(c) })
      for (const g of Object.values(seen)) if (g.length > 1) {
        packDups++
        if (new Set(g.map(c => c.variantType || 'Normal')).size > 1) packDupsCross++
      }
      deck.forEach(c => { boxIds[id(c)] = (boxIds[id(c)] || 0) + 1 })
    })
    boxUnique.push(Object.keys(boxIds).length)
    for (let g = 0; g < 4; g++) {
      const byId = {}
      for (let p = g * 6; p < g * 6 + 6; p++) {
        box[p].cards.filter(isDeck).forEach(c => { (byId[id(c)] = byId[id(c)] || []).push(c) })
      }
      const groups = Object.values(byId)
      const dups = groups.filter(x => x.length > 1)
      dupIds.push(dups.length)
      nnPairs.push(dups.filter(x => x.length === 2 && x.every(isNormal)).length)
    }
  }

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length

  test('stacking permutation is the exact factory interleave (spec: 12,24,11,23,…,1,13)', () => {
    const line = Array.from({ length: 24 }, (_, i) => i + 1)
    const box = stackBoxOrder(line)
    const readBack = [12, 24, 11, 23, 10, 22, 9, 21, 8, 20, 7, 19, 6, 18, 5, 17, 4, 16, 3, 15, 2, 14, 1, 13]
      .map(pos => box[pos - 1])
    assert(readBack.every((v, i) => v === i + 1),
      `Reading box positions 12,24,11,… must recover line order 1..24, got ${readBack.join(',')}`)
  })

  test('SPEC: Normal+Normal pool pairs exist and vary (6-box refit 2026-07-11: even-share 4.2% -> mean ~0.6; band 0.25-2.0)', () => {
    const m = mean(nnPairs)
    console.log(`\x1b[36m   nn-pairs/pool: mean ${m.toFixed(2)}, max ${Math.max(...nnPairs)}\x1b[0m`)
    assert(m >= 0.25 && m <= 2.0, `nn-pairs/pool mean ${m.toFixed(2)} outside band 0.25-2.0`)
    assert(Math.max(...nnPairs) >= 2, `max nn-pairs ${Math.max(...nnPairs)} — loaded pools missing`)
    assert(nnPairs.some(x => x === 0), 'clean 0-pair pools missing')
  })

  test('SPEC: dup identities/pool mean in band 5.5-8.5 (real ≈6.5)', () => {
    const m = mean(dupIds)
    console.log(`\x1b[36m   dup identities/pool: mean ${m.toFixed(2)}\x1b[0m`)
    assert(m >= 5.5 && m <= 8.5, `dup identities/pool mean ${m.toFixed(2)} outside band 5.5-8.5`)
  })

  test('SPEC: loaded pool rate (≥10 dup identities) in band 1-10% (6-box refit: even-share 4.2% -> ~3.8%; Lee 2026-07-11 tightening)', () => {
    const rate = dupIds.filter(x => x >= 10).length / dupIds.length
    console.log(`\x1b[36m   loaded pools: ${(rate * 100).toFixed(1)}%\x1b[0m`)
    assert(rate >= 0.01 && rate <= 0.10, `loaded pool rate ${(rate * 100).toFixed(1)}% outside band 1-10%`)
  })

  test('SPEC: box unique identities in band 176-190 (real 183)', () => {
    const m = mean(boxUnique)
    console.log(`\x1b[36m   box unique: mean ${m.toFixed(1)}\x1b[0m`)
    assert(m >= 176 && m <= 190, `box unique mean ${m.toFixed(1)} outside band 176-190`)
  })

  test('SPEC: within-pack dups 0.08-0.22/pack, ≥90% cross-variant (real 0.13, all cross-variant)', () => {
    const rate = packDups / packCount
    const crossShare = packDups ? packDupsCross / packDups : 1
    console.log(`\x1b[36m   within-pack dups: ${rate.toFixed(3)}/pack, cross-variant ${(crossShare * 100).toFixed(1)}%\x1b[0m`)
    assert(rate >= 0.08 && rate <= 0.22, `within-pack dup rate ${rate.toFixed(3)} outside band`)
    assert(crossShare >= 0.90, `cross-variant share ${(crossShare * 100).toFixed(1)}% < 90% — same-belt within-pack dups appearing`)
  })

  console.log('')
  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  console.log(failed > 0 ? `\x1b[31m❌ Tests failed: ${failed}\x1b[0m` : `\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  if (failed > 0) process.exit(1)
}

run()
