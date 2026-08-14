/**
 * Printer Distribution QA (Set 7+)
 *
 * The checks a card printer runs on a press before shipping a run: is every card
 * on the checklist actually coming out, at the frequency the sheet says, with the
 * slot rates independent where they should be and the pool-level duplicate
 * distribution the right SHAPE — not just the right mean.
 *
 * These complement lineStacking.test.ts (which asserts pool means and one tail
 * bucket) and sealedPodCollation.test.ts (which asserts seat fairness).
 *
 * Run with: npx tsx src/qa/printerDistribution.test.ts
 */

import { generateSealedBox, clearBeltCache } from '../utils/boosterPack'
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

const id = (c) => `${c.name}|${c.subtitle || ''}`
const isDeck = (c) => !c.isLeader && !c.isBase
const isNormal = (c) => (c.variantType || 'Normal') === 'Normal'
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

const SET = 'ASH'
const BOXES = 250

// SPEC (packConstants / ASH.ts / .claude/rules/belt-system.md):
const HS_LEADER_RATE = 1 / 6            // leaderHyperspaceRate
const HS_BASE_RATE = 1 / 6              // baseHyperspaceRate
const T1_PRESTIGE_RATE = 1 / 22         // ASH_T1_PRESTIGE_RATE, 11 verified boxes
const PACKS_PER_BOX = 24

// "Equal occurrence rate: every card appears exactly once per boot"
// (.claude/rules/belt-system.md). A card systematically starved relative to its
// rarity pool is a short-print. Threshold is scale-aware: sigma = sqrt(mean) is
// the Poisson upper bound on noise, and a sheet-based belt should be TIGHTER
// than Poisson, so 6 sigma is generous.
const STARVATION_SIGMA = 6
const MIN_EXPECTED_FOR_UNIFORMITY = 20  // pools sparser than this are untestable here

async function run() {
  await initializeCardCache()
  console.log('\x1b[1m\x1b[35m🖨️  Printer Distribution QA (Set 7+)\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')
  console.log(`\x1b[36m   Generating ${BOXES} ${SET} boxes (${BOXES * PACKS_PER_BOX} packs)...\x1b[0m`)

    // SPEC: the Normal-variant deck slots print Common/Uncommon/Rare/Legendary only.
  // Specials reach a pack solely as Hyperspace Foil (ASH rarityWeights
  // .hyperspaceFoilSlot Special: 2) or as prestige, so Normal-variant Specials are
  // correctly absent from standard packs and are not part of this checklist.
  const PRINTED_RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary']
  const catalog = getCachedCards(SET)
    .filter(c => isNormal(c) && isDeck(c) && PRINTED_RARITIES.includes(c.rarity))
  const poolByRarity: Record<string, string[]> = {}
  for (const c of catalog) (poolByRarity[c.rarity] = poolByRarity[c.rarity] || []).push(id(c))

  const counts: Record<string, Record<string, number>> = {}
  let hsLeader = 0, hsBase = 0, hsBoth = 0, packCount = 0
  const prestigePerBox: number[] = []
  const dupPerPool: number[] = [], nnPerPool: number[] = []

  clearBeltCache()
  for (let b = 0; b < BOXES; b++) {
    const box = generateSealedBox([], SET, PACKS_PER_BOX)
    let prestige = 0
    box.forEach(pk => {
      packCount++
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

  // ---- Per-card frequency ------------------------------------------------
  const testablePools = Object.keys(poolByRarity).filter(r => {
    const obs = poolByRarity[r]!.map(n => counts[r]?.[n] || 0)
    return obs.length > 1 && mean(obs) >= MIN_EXPECTED_FOR_UNIFORMITY
  })

  test('SPEC: every card on the checklist appears — nothing is printed zero times', () => {
    const missing: string[] = []
    for (const r of Object.keys(poolByRarity)) {
      for (const n of poolByRarity[r]!) {
        if (!(counts[r]?.[n] > 0)) missing.push(`${n.split('|')[0]} [${r}]`)
      }
    }
    console.log(`\x1b[36m   catalog ${catalog.length} normal deck cards; never printed: ${missing.length}\x1b[0m`)
    assert(missing.length === 0, `never printed in ${BOXES} boxes: ${missing.slice(0, 8).join(', ')}`)
  })

  test(`SPEC: no card is short-printed — every card within ${STARVATION_SIGMA}σ of its rarity pool mean`, () => {
    const starved: string[] = []
    for (const r of testablePools) {
      const obs = poolByRarity[r]!.map(n => counts[r]?.[n] || 0)
      const m = mean(obs)
      const sigma = Math.sqrt(m)
      const lo = Math.min(...obs), hi = Math.max(...obs)
      console.log(`\x1b[36m   ${r.padEnd(10)} pool=${String(obs.length).padStart(3)} exp/card ${m.toFixed(0).padStart(5)}  min ${lo}  max ${hi}  max/min ${(hi / Math.max(1, lo)).toFixed(2)}\x1b[0m`)
      poolByRarity[r]!.forEach((n, i) => {
        const deficit = (m - obs[i]!) / sigma
        if (deficit > STARVATION_SIGMA) {
          starved.push(`${n.split('|')[0]} [${r}] ${obs[i]} vs ${m.toFixed(0)} (${deficit.toFixed(1)}σ low)`)
        }
      })
    }
    assert(starved.length === 0, `short-printed: ${starved.join('; ')}`)
  })

  // ---- Independence -------------------------------------------------------
  test('SPEC: HS leader and HS base are independent (joint ≈ 1/6 × 1/6 = 1/36)', () => {
    const lRate = hsLeader / packCount, bRate = hsBase / packCount, joint = hsBoth / packCount
    const expected = HS_LEADER_RATE * HS_BASE_RATE
    console.log(`\x1b[36m   HS leader ${lRate.toFixed(4)} · HS base ${bRate.toFixed(4)} · joint ${joint.toFixed(4)} (independence ${expected.toFixed(4)})\x1b[0m`)
    assert(Math.abs(lRate - HS_LEADER_RATE) / HS_LEADER_RATE < 0.15, `HS leader rate ${lRate.toFixed(4)} off spec 1/6`)
    assert(Math.abs(bRate - HS_BASE_RATE) / HS_BASE_RATE < 0.15, `HS base rate ${bRate.toFixed(4)} off spec 1/6`)
    // Real ASH boxes show leader+base HS co-occurrence at the independence rate —
    // an exclusivity constraint here was falsified by pool 002 pack06 and removed.
    // Do NOT "fix" a high reading by re-adding one.
    assert(Math.abs(joint - expected) / expected < 0.40,
      `leader+base HS co-occurrence ${joint.toFixed(4)} deviates >40% from independence ${expected.toFixed(4)}`)
  })

  // ---- Prestige per box ---------------------------------------------------
  test('SPEC: tier-1 prestige ≈ 1/22 packs (~1.1/box), never 3+ in one box', () => {
    const perBox = mean(prestigePerBox)
    const expected = PACKS_PER_BOX * T1_PRESTIGE_RATE
    const hist: Record<number, number> = {}
    prestigePerBox.forEach(x => { hist[x] = (hist[x] || 0) + 1 })
    console.log(`\x1b[36m   prestige/box mean ${perBox.toFixed(2)} (spec ${expected.toFixed(2)}) — ` +
      Object.keys(hist).map(Number).sort((a, b) => a - b).map(k => `${k}x:${(100 * hist[k]! / BOXES).toFixed(1)}%`).join(' ') + `\x1b[0m`)
    assert(Math.abs(perBox - expected) / expected < 0.25,
      `prestige/box ${perBox.toFixed(2)} deviates >25% from spec ${expected.toFixed(2)}`)
    const clustered = prestigePerBox.filter(x => x >= 3).length
    assert(clustered === 0,
      `${clustered} boxes had 3+ tier-1 prestige — 11 verified real boxes show mode 1, max 2`)
  })

  // ---- Distribution SHAPE, not just the mean ------------------------------
  // Mean and a single tail bucket can both sit in band while the shape drifts.
  test('SPEC: pool duplicate distribution has the right shape (clean mode + clumpy tail)', () => {
    const m = mean(dupPerPool)
    const variance = mean(dupPerPool.map(x => (x - m) ** 2))
    const nnZero = nnPerPool.filter(x => x === 0).length / nnPerPool.length
    const loaded = dupPerPool.filter(x => x >= 10).length / dupPerPool.length
    console.log(`\x1b[36m   dup/pool mean ${m.toFixed(2)} var ${variance.toFixed(2)} (var/mean ${(variance / m).toFixed(2)}); nn P(0) ${(100 * nnZero).toFixed(1)}%; loaded ${(100 * loaded).toFixed(1)}%\x1b[0m`)

    // M1 real-data spec: 39 real pools, P(0 Normal+Normal pairs) = 56%.
    assert(nnZero >= 0.40 && nnZero <= 0.60,
      `P(0 nn-pairs) ${(100 * nnZero).toFixed(1)}% outside real-data band 40-60%`)
    // Both modes must exist: clean pools AND a genuine clumpy tail.
    assert(dupPerPool.some(x => x <= 3), 'no clean pools (≤3 dup identities) — tail-heavy drift')
    assert(loaded >= 0.01 && loaded <= 0.10,
      `loaded pool rate ${(100 * loaded).toFixed(1)}% outside band 1-10%`)
    // Dispersion regression guard. Real pools are var/mean ≈ 2.07 (13 transcribed
    // pools: mean 7.0, var 14.5); the model sits near 0.5 — a KNOWN and accepted
    // trade-off (the pair-gap knob controls both the tail and NN texture; tail was
    // prioritised, 2026-07-11). This floor only catches further COLLAPSE toward a
    // deterministic distribution. Do not "fix" a low reading by adding spacing.
    assert(variance / m >= 0.30,
      `dup/pool var/mean ${(variance / m).toFixed(2)} < 0.30 — distribution collapsing toward deterministic`)
  })

  console.log('')
  console.log('\x1b[36m============================\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  console.log(failed > 0 ? `\x1b[31m❌ Tests failed: ${failed}\x1b[0m` : `\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  if (failed > 0) process.exit(1)
}

run()
