// @ts-nocheck
/**
 * Carbonite Distribution QA
 *
 * Statistical + structural guards for the Carbonite pack generator, run as part of
 * `npm run qa`. Carbonite is app-only (Chaos Sealed/Draft) — ground truth is the
 * design spec (plans/CARBONITE_PACK_PLAN.md + src/utils/carboniteConstants.ts).
 *
 * Rate checks use bands (never hard === over seeded samples). The one hard === 0 is
 * the identical-printing invariant, which the generator enforces DETERMINISTICALLY
 * (drawUnique placement dedup), not by luck — see plans/CARBONITE_COLLATION_FINDINGS.md.
 *
 * Run: npx tsx src/qa/carboniteDistribution.test.ts  (or npm run qa)
 */

import { generateCarboniteBoosterPack, clearCarboniteBeltCache } from '../utils/carboniteBoosterPack'
import { initializeCardCache } from '../utils/cardCache'
import { CARBONITE_CONSTANTS } from '../utils/carboniteConstants'

let passed = 0
let failed = 0

function ok(name: string) { console.log(`\x1b[32m✅ ${name}\x1b[0m`); passed++ }
function bad(name: string, msg: string) { console.log(`\x1b[31m❌ ${name}\x1b[0m\n\x1b[33m   ${msg}\x1b[0m`); failed++ }
function check(name: string, cond: boolean, msg: string) { cond ? ok(name) : bad(name, msg) }

const PRE_LAW = ['JTL', 'LOF', 'SEC']
const LAW_PLUS = ['LAW', 'ASH']
const ALL = [...PRE_LAW, ...LAW_PLUS]
const SAMPLE = 3000

const treatmentKey = (c: any): string =>
  `${c.id ?? `${c.name}|${c.number}`}|${c.variantType}|${c.isFoil ? 1 : 0}|${c.isHyperspace ? 1 : 0}`
const isDeck = (c: any): boolean => !c.isLeader && !c.isPrestige
const pctOf = (n: number, d: number) => (d ? (n / d) * 100 : 0)

async function main() {
  console.log('\x1b[36m🔄 Initializing card cache...\x1b[0m')
  await initializeCardCache()
  console.log('\x1b[1m\x1b[35m🧊 Carbonite Distribution QA\x1b[0m')
  console.log('\x1b[35m' + '='.repeat(50) + '\x1b[0m')

  for (const set of ALL) {
    const code = `${set}-CB`
    const isLawPlus = LAW_PLUS.includes(set)
    clearCarboniteBeltCache()

    let dupPacks = 0, notSized = 0, leaderBad = 0, prestigeBad = 0, showcase = 0
    const tier: Record<string, number> = {}
    const rlFoil: Record<string, number> = {}, rlHS: Record<string, number> = {}, top: Record<string, number> = {}

    for (let i = 0; i < SAMPLE; i++) {
      const cards = generateCarboniteBoosterPack(code).cards as any[]
      if (cards.length !== 16) notSized++
      const keys = cards.filter(isDeck).map(treatmentKey)
      if (new Set(keys).size !== keys.length) dupPacks++
      const leader = cards[0]
      if (!leader?.isLeader || !(leader.isHyperspace || leader.isShowcase)) leaderBad++
      if (leader?.isShowcase) showcase++
      if (cards.filter(c => c.isPrestige).length !== 1) prestigeBad++
      const prestige = cards.find(c => c.isPrestige)
      if (prestige?.prestigeTier) tier[prestige.prestigeTier] = (tier[prestige.prestigeTier] || 0) + 1
      if (isLawPlus) {
        const t = cards[9]; if (t) top[t.rarity] = (top[t.rarity] || 0) + 1
      } else {
        const f = cards[7]; if (f) rlFoil[f.rarity] = (rlFoil[f.rarity] || 0) + 1
        const h = cards[13]; if (h) rlHS[h.rarity] = (rlHS[h.rarity] || 0) + 1
      }
    }

    console.log(`\n\x1b[1m${code} (${isLawPlus ? 'LAW+' : 'pre-LAW'})\x1b[0m`)
    check(`${code}: all packs 16 cards`, notSized === 0, `${notSized}/${SAMPLE} wrong size`)
    check(`${code}: no identical-printing dup (SPEC: 0)`, dupPacks === 0, `${dupPacks}/${SAMPLE} packs had a same-treatment dup`)
    check(`${code}: leader always HS/Showcase`, leaderBad === 0, `${leaderBad}/${SAMPLE} bad leaders`)
    check(`${code}: exactly 1 prestige/pack`, prestigeBad === 0, `${prestigeBad}/${SAMPLE} wrong prestige count`)

    // Showcase rate band (spec 5% / 2.08%)
    const scRate = pctOf(showcase, SAMPLE)
    const scT = (isLawPlus ? CARBONITE_CONSTANTS.showcaseRate.law : CARBONITE_CONSTANTS.showcaseRate.preLaw) * 100
    check(`${code}: showcase rate ~${scT.toFixed(1)}% (band ±2)`, Math.abs(scRate - scT) <= 2,
      `got ${scRate.toFixed(2)}%, spec ${scT.toFixed(2)}%`)

    // Prestige tier1 band (spec 80%)
    const tTot = Object.values(tier).reduce((a, b) => a + b, 0)
    const t1 = pctOf(tier.tier1 || 0, tTot)
    check(`${code}: prestige tier1 ~80% (band 75-85)`, t1 >= 75 && t1 <= 85, `got ${t1.toFixed(1)}%`)

    // Weighted R/S/L slots — Rare majority ~70% / top ~60%
    if (isLawPlus) {
      const tt = Object.values(top).reduce((a, b) => a + b, 0)
      const r = pctOf(top.Rare || 0, tt)
      const forbidden = tt - (top.Rare || 0) - (top.Special || 0) - (top.Legendary || 0)
      check(`${code}: HS-top Rare ~60% (band 54-66)`, r >= 54 && r <= 66, `got ${r.toFixed(1)}%`)
      check(`${code}: HS-top only R/S/L`, forbidden === 0, `${forbidden} non-R/S/L`)
    } else {
      const fT = Object.values(rlFoil).reduce((a, b) => a + b, 0)
      const hT = Object.values(rlHS).reduce((a, b) => a + b, 0)
      const fr = pctOf(rlFoil.Rare || 0, fT), hr = pctOf(rlHS.Rare || 0, hT)
      check(`${code}: R/L Foil Rare ~70% (band 63-77)`, fr >= 63 && fr <= 77, `got ${fr.toFixed(1)}%`)
      check(`${code}: R/L HS Rare ~70% (band 63-77)`, hr >= 63 && hr <= 77, `got ${hr.toFixed(1)}%`)
    }
  }

  console.log('\n\x1b[35m' + '='.repeat(50) + '\x1b[0m')
  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  console.log(failed > 0 ? `\x1b[31m❌ Tests failed: ${failed}\x1b[0m` : `\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  if (failed > 0) { console.log('\x1b[31m\x1b[1m💥 CARBONITE QA FAILED\x1b[0m'); process.exit(1) }
  console.log('\x1b[32m\x1b[1m🎉 CARBONITE QA PASSED!\x1b[0m')
}

main()
