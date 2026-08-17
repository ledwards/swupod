/**
 * Printer Distribution QA
 *
 * The checks a card printer runs on a press before shipping a run: is every card
 * on the checklist coming out at the frequency the sheet says, are slot rates
 * independent where they should be, and is the pool-level duplicate distribution
 * the right SHAPE — not just the right mean.
 *
 * Scope differs per check, deliberately:
 *   - per-card frequency  — ALL sets. "Equal occurrence rate" is a belt-wide
 *     constraint, and the aspect-singleton pattern that broke ASH also exists in
 *     TWI, JTL and LOF.
 *   - prestige            — LAW and ASH only; they are the only sets with
 *     prestige in standard packs (LAW 1/18, ASH 1/22).
 *   - duplicate shape     — LAW and ASH only; the bands come from transcribed
 *     real ASH boxes, and LAW shares the block, the belts and the line-stacking
 *     collation ("pack rules are a copy of LAW" — ASH.ts). Sets 1-6 use a
 *     different architecture and legitimately sit outside these bands.
 *   - HS leader/base      — all sets must ALLOW co-occurrence (a real pack
 *     falsified the old exclusivity ban); only ASH's spaced-sheet config
 *     actually reaches the independent 1/36.
 *
 * Run with: npx tsx src/qa/printerDistribution.test.ts
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { generateSealedBox, clearBeltCache } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'

const REAL_BOX_DIR = join(import.meta.dirname, '..', '..', 'data', 'real-boxes')

/** Minimal CSV reader — the real-box transcriptions quote fields containing commas. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim())
  const header = lines[0]!.split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const cells: string[] = []
    let cur = '', quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = (cells[i] || '').trim() })
    return row
  })
}

/**
 * Duplicate identities per 6-pack pool from the TRANSCRIBED ASH boxes, in
 * consumer order (box positions 1-6, 7-12, 13-18, 19-24) — the same definition
 * the generator side uses. Incomplete pools are skipped rather than padded.
 */
function realPoolDuplicates(): number[] {
  if (!existsSync(REAL_BOX_DIR)) return []
  const pools: number[] = []
  for (const file of readdirSync(REAL_BOX_DIR).filter(f => /^ash-box-\d+\.csv$/.test(f))) {
    const rows = parseCsv(readFileSync(join(REAL_BOX_DIR, file), 'utf8'))
    const byPack: Record<number, Record<string, string>[]> = {}
    for (const r of rows) {
      const p = parseInt(r.pack!, 10)
      if (p) (byPack[p] = byPack[p] || []).push(r)
    }
    for (let g = 0; g < 4; g++) {
      const packs = [1, 2, 3, 4, 5, 6].map(k => byPack[g * 6 + k])
      if (packs.some(p => !p)) continue
      const byId: Record<string, number> = {}
      packs.flat().filter(r => r!.type !== 'Leader' && r!.type !== 'Base')
        .forEach(r => { const k = `${r!.name}|${r!.subtitle || ''}`; byId[k] = (byId[k] || 0) + 1 })
      pools.push(Object.values(byId).filter(n => n > 1).length)
    }
  }
  return pools
}

/** Two-sample Kolmogorov-Smirnov statistic: max gap between empirical CDFs. */
function ksStatistic(a: number[], b: number[]): number {
  const values = [...new Set([...a, ...b])].sort((x, y) => x - y)
  const cdf = (s: number[], v: number) => s.filter(x => x <= v).length / s.length
  return values.reduce((d, v) => Math.max(d, Math.abs(cdf(a, v) - cdf(b, v))), 0)
}

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
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

const ALL_SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH']
const PRESTIGE_SETS: Record<string, number> = { LAW: 1 / 18, ASH: 1 / 22 }
const SHAPE_SETS = ['LAW', 'ASH']
const PACKS_PER_BOX = 24

// SPEC: the Normal-variant deck slots print Common/Uncommon/Rare/Legendary only.
// Specials reach a pack solely as Hyperspace Foil or prestige.
const PRINTED_RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary']

// "Equal occurrence rate: every card appears exactly once per boot"
// (.claude/rules/belt-system.md). Every card of a rarity therefore has the SAME
// expected count — mean of its pool. This is two-sided: a card printed too often
// is as wrong as one printed too rarely. Threshold is scale-aware, sigma =
// sqrt(mean) being the Poisson upper bound on noise; a sheet-based belt is
// tighter than Poisson, so 6 sigma is generous. The ASH short-print sat at 8.7.
const TOLERANCE_SIGMA = 6
const MIN_EXPECTED = 20   // pools sparser than this are untestable at this N

const BOXES_UNIFORMITY = 120
const BOXES_DETAIL = 150
// Shape and KS compare full distributions, so they need a bigger sample than the
// rate checks: at 150 boxes LAW's P(0 nn-pairs) sits ~1pp above its 40% floor and
// flakes. At 350 it is stable at 42.6-43.9%.
const BOXES_SHAPE = 350

type Counts = Record<string, Record<string, number>>

function tally(setCode: string, boxes: number) {
  const catalog = getCachedCards(setCode)
    .filter(c => isNormal(c) && isDeck(c) && PRINTED_RARITIES.includes(c.rarity))
  const poolByRarity: Record<string, string[]> = {}
  for (const c of catalog) (poolByRarity[c.rarity] = poolByRarity[c.rarity] || []).push(id(c))

  const counts: Counts = {}
  let hsLeader = 0, hsBase = 0, hsBoth = 0, packs = 0
  const prestigePerBox: number[] = []
  const dupPerPool: number[] = [], nnPerPool: number[] = []

  clearBeltCache()
  for (let b = 0; b < boxes; b++) {
    const box = generateSealedBox([], setCode, PACKS_PER_BOX)
    let prestige = 0
    box.forEach(pk => {
      packs++
      const leader = pk.cards.find(c => c.isLeader)
      const base = pk.cards.find(c => c.isBase && c.rarity === 'Common')
      const lHS = Boolean(leader?.isHyperspace), bHS = Boolean(base?.isHyperspace)
      if (lHS) hsLeader++
      if (bHS) hsBase++
      if (lHS && bHS) hsBoth++
      pk.cards.forEach(c => {
        if (c.isPrestige) prestige++
        if (!isDeck(c) || !isNormal(c)) return
        counts[c.rarity] = counts[c.rarity] || {}
        counts[c.rarity][id(c)] = (counts[c.rarity][id(c)] || 0) + 1
      })
    })
    prestigePerBox.push(prestige)
    for (let g = 0; g < 4; g++) {
      const byId: Record<string, unknown[]> = {}
      for (let p = g * 6; p < g * 6 + 6; p++) {
        box[p]!.cards.filter(isDeck).forEach(c => { (byId[id(c)] = byId[id(c)] || []).push(c) })
      }
      const dups = Object.values(byId).filter(x => x.length > 1)
      dupPerPool.push(dups.length)
      nnPerPool.push(dups.filter(x => x.length === 2 && x.every(isNormal)).length)
    }
  }
  return { catalog, poolByRarity, counts, hsLeader, hsBase, hsBoth, packs, prestigePerBox, dupPerPool, nnPerPool }
}

async function run() {
  await initializeCardCache()
  console.log('\x1b[1m\x1b[35m🖨️  Printer Distribution QA\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  // ---- Per-card frequency, EVERY set ------------------------------------
  console.log(`\x1b[36m   Per-card frequency: ${BOXES_UNIFORMITY} boxes x ${ALL_SETS.length} sets...\x1b[0m`)
  for (const setCode of ALL_SETS) {
    if (getCachedCards(setCode).length === 0) {
      console.log(`\x1b[33m   Skipping ${setCode}: no card data\x1b[0m`)
      continue
    }
    const t = tally(setCode, BOXES_UNIFORMITY)

    test(`SPEC: ${setCode} — every card printed at its expected rate (within ${TOLERANCE_SIGMA}σ, both directions)`, () => {
      const offenders: string[] = []
      const lines: string[] = []
      for (const rarity of PRINTED_RARITIES) {
        const pool = t.poolByRarity[rarity]
        if (!pool || pool.length < 2) continue
        const obs = pool.map(n => t.counts[rarity]?.[n] || 0)
        const m = mean(obs)
        if (m < MIN_EXPECTED) continue
        const sigma = Math.sqrt(m)
        lines.push(`${rarity.slice(0, 4)} n=${pool.length} exp ${m.toFixed(0)} [${Math.min(...obs)}-${Math.max(...obs)}]`)
        pool.forEach((n, i) => {
          const dev = (obs[i]! - m) / sigma
          if (Math.abs(dev) > TOLERANCE_SIGMA) {
            offenders.push(`${n.split('|')[0]} [${rarity}] ${obs[i]} vs ${m.toFixed(0)} (${dev > 0 ? '+' : ''}${dev.toFixed(1)}σ)`)
          }
        })
      }
      console.log(`\x1b[36m   ${setCode}: ${lines.join(' | ')}\x1b[0m`)
      assert(offenders.length === 0, `off expected rate: ${offenders.join('; ')}`)
    })
  }

  // ---- HS leader/base co-occurrence, EVERY set ---------------------------
  console.log(`\x1b[36m   Slot independence + shape: ${BOXES_DETAIL} boxes...\x1b[0m`)
  const detail: Record<string, ReturnType<typeof tally>> = {}
  for (const setCode of ALL_SETS) {
    if (getCachedCards(setCode).length === 0) continue
    detail[setCode] = tally(setCode, BOXES_DETAIL)
  }

  test('SPEC: HS leader and HS base can co-occur in one pack — no set bans it', () => {
    // Real ASH pool-002 pack06 held both. The old hard exclusivity rule gave the
    // pack probability zero; it was removed. This guards against it coming back.
    const lines: string[] = []
    const banned: string[] = []
    for (const [setCode, t] of Object.entries(detail)) {
      const joint = t.hsBoth / t.packs
      const independent = (t.hsLeader / t.packs) * (t.hsBase / t.packs)
      lines.push(`${setCode} ${(joint / independent).toFixed(2)}x`)
      if (t.hsBoth === 0) banned.push(setCode)
    }
    console.log(`\x1b[36m   co-occurrence vs independence: ${lines.join('  ')}\x1b[0m`)
    assert(banned.length === 0,
      `${banned.join(', ')} never produced a leader+base HS pack — exclusivity has been re-introduced`)
  })

  test('SPEC: ASH reaches the independent rate (1/6 × 1/6 = 1/36)', () => {
    // ASH is the set with a real-box-calibrated spaced HS sheet. The others use
    // the budget belt, whose per-pack cap suppresses co-occurrence below 1/36 —
    // expected, not a defect. Do NOT "fix" those by re-adding a constraint.
    const t = detail['ASH']
    if (!t) return
    const joint = t.hsBoth / t.packs
    const expected = (1 / 6) * (1 / 6)
    assert(Math.abs(joint - expected) / expected < 0.40,
      `ASH leader+base co-occurrence ${joint.toFixed(4)} deviates >40% from independence ${expected.toFixed(4)}`)
  })

  // ---- Prestige: LAW and ASH only ---------------------------------------
  for (const [setCode, rate] of Object.entries(PRESTIGE_SETS)) {
    const t = detail[setCode]
    if (!t) continue
    test(`SPEC: ${setCode} tier-1 prestige ≈ 1/${Math.round(1 / rate)} packs, never 3+ in one box`, () => {
      const perBox = mean(t.prestigePerBox)
      const expected = PACKS_PER_BOX * rate
      const clustered = t.prestigePerBox.filter(x => x >= 3).length
      console.log(`\x1b[36m   ${setCode}: prestige/box ${perBox.toFixed(2)} (spec ${expected.toFixed(2)}), max in a box ${Math.max(...t.prestigePerBox)}\x1b[0m`)
      assert(Math.abs(perBox - expected) / expected < 0.25,
        `${setCode} prestige/box ${perBox.toFixed(2)} deviates >25% from spec ${expected.toFixed(2)}`)
      assert(clustered === 0,
        `${setCode}: ${clustered} boxes had 3+ tier-1 prestige — 11 verified real boxes show mode 1, max 2`)
    })
  }

  // ---- Duplicate distribution SHAPE: LAW and ASH -------------------------
  const shapeTally: Record<string, ReturnType<typeof tally>> = {}
  for (const setCode of SHAPE_SETS) {
    if (getCachedCards(setCode).length === 0) continue
    const t = tally(setCode, BOXES_SHAPE)
    shapeTally[setCode] = t
    test(`SPEC: ${setCode} pool duplicate distribution has the right shape`, () => {
      const m = mean(t.dupPerPool)
      const variance = mean(t.dupPerPool.map(x => (x - m) ** 2))
      const nnZero = t.nnPerPool.filter(x => x === 0).length / t.nnPerPool.length
      const loaded = t.dupPerPool.filter(x => x >= 10).length / t.dupPerPool.length
      console.log(`\x1b[36m   ${setCode}: dup/pool ${m.toFixed(2)} (var/mean ${(variance / m).toFixed(2)}); nn P(0) ${(100 * nnZero).toFixed(1)}%; loaded ${(100 * loaded).toFixed(1)}%\x1b[0m`)
      assert(m >= 5.5 && m <= 8.5, `${setCode} dup identities/pool ${m.toFixed(2)} outside band 5.5-8.5`)
      assert(nnZero >= 0.40 && nnZero <= 0.60,
        `${setCode} P(0 nn-pairs) ${(100 * nnZero).toFixed(1)}% outside real-data band 40-60%`)
      assert(t.dupPerPool.some(x => x <= 3), `${setCode}: no clean pools (≤3 dup identities)`)
      assert(loaded >= 0.01 && loaded <= 0.10,
        `${setCode} loaded pool rate ${(100 * loaded).toFixed(1)}% outside band 1-10%`)
      // Floor only. Real pools run var/mean ≈2.07; the model ≈0.5 by the accepted
      // 2026-07-11 pair-gap trade-off. Catches collapse toward determinism only.
      assert(variance / m >= 0.30,
        `${setCode} dup/pool var/mean ${(variance / m).toFixed(2)} < 0.30 — collapsing toward deterministic`)
    })
  }

  // ---- Full-distribution agreement with the transcribed boxes -------------
  // The bands above check the mean, the P(0) point and one tail bucket. All
  // three can sit in range while the SHAPE drifts. This compares the whole
  // empirical CDF of duplicates-per-pool against the real ASH boxes with a
  // two-sample Kolmogorov-Smirnov test — the strongest statement available from
  // the data we actually have. ASH only: KS needs pools in consumer order, and
  // the LAW fixtures are event pools with no recorded box position.
  test('SPEC: duplicate distribution matches the transcribed ASH boxes (KS, α=0.05)', () => {
    const real = realPoolDuplicates()
    if (real.length < 20) {
      console.log(`\x1b[33m   Skipping: only ${real.length} complete real pools available\x1b[0m`)
      return
    }
    const gen = (shapeTally['ASH'] ?? detail['ASH'])!.dupPerPool
    const d = ksStatistic(real, gen)
    const critical = 1.36 * Math.sqrt(1 / real.length + 1 / gen.length)
    console.log(`\x1b[36m   real n=${real.length} mean ${mean(real).toFixed(2)} · generated n=${gen.length} mean ${mean(gen).toFixed(2)}\x1b[0m`)
    console.log(`\x1b[36m   KS D=${d.toFixed(4)}  critical=${critical.toFixed(4)}\x1b[0m`)
    assert(d <= critical,
      `KS D=${d.toFixed(4)} exceeds the α=0.05 critical value ${critical.toFixed(4)} — ` +
      `the generated duplicate distribution no longer matches the real boxes in shape, ` +
      `even if its mean and tail still sit in band`)
  })

  console.log('')
  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  console.log(failed > 0 ? `\x1b[31m❌ Tests failed: ${failed}\x1b[0m` : `\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  if (failed > 0) process.exit(1)
}

run()
