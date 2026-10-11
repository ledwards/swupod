/**
 * Pack comparison scorecard QA.
 *
 * The /comps page reads src/data/compsScorecard.json, written by
 * scripts/comps-measure.ts. This suite keeps that file honest:
 *   - its real-box reference is what the transcriptions say today,
 *   - Protect the Pod is RE-MEASURED live from the generator and graded on
 *     every metric — the page's number is a test, not a typed figure,
 *   - each competitor port matches the rates written in that site's code.
 *
 * Run with: npx tsx src/qa/compsScorecard.test.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCachedCards, initializeCardCache } from '../utils/cardCache'
import { kitStat, summarize, type KitCard } from './comps/kitStats'
import { buildReference, realKits } from './comps/realKits'
import { ptpKitSummary } from './comps/ptpKits'
import { ccsKit, deckPool, manyTcgKit, seededRng, swuDraftSimKit, swuSealedKit, type DeckPool, type Rng } from './comps/competitors'
import { limitedLabKit, limitedLabPool } from './comps/limitedLab'
import { AXES, METRICS, gradeSite, type Reference, type Site } from '../services/compsScore'

const SCORECARD = join(import.meta.dirname, '..', 'data', 'compsScorecard.json')
const PTP_KITS = 1200
const PORT_KITS = 4000

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

/** |observed - expected| within 4 standard errors of a per-kit count. */
function near(label: string, observed: number, expected: number, sdPerKit: number, kits: number): void {
  const se = Math.max(1e-9, sdPerKit / Math.sqrt(kits))
  assert(Math.abs(observed - expected) <= 4 * se,
    `${label}: ${observed.toFixed(3)} vs spec ${expected.toFixed(3)} (±${(4 * se).toFixed(3)})`)
}

const label = (id: string) => id === 'repeatsKs' ? 'Repeat spread (KS)' : METRICS.find(m => m.id === id)!.label

async function main() {
  console.log('\n\x1b[1m📊 Pack comparison scorecard QA\x1b[0m\n')
  await initializeCardCache()
  const ash = getCachedCards('ASH')
  assert(ash.length > 0, 'no ASH card data')
  const pool: DeckPool = deckPool(ash as never)
  const card = JSON.parse(readFileSync(SCORECARD, 'utf8')) as { reference: Reference, sites: Site[] }
  const real = buildReference()

  test('SPEC: the scorecard reference is the current real-box transcription', () => {
    assert(card.reference.kits === real.kits, `scorecard has ${card.reference.kits} kits, boxes give ${real.kits} — re-run scripts/comps-measure.ts`)
    assert(JSON.stringify(card.reference.repeatsHistogram) === JSON.stringify(real.repeatsHistogram),
      'repeats histogram is stale — re-run scripts/comps-measure.ts')
    for (const m of METRICS) {
      assert(Math.abs(card.reference.metrics[m.id].mean - real.metrics[m.id].mean) < 1e-3, `${m.id} reference stale — re-run scripts/comps-measure.ts`)
    }
  })

  test('SPEC: every site on the page is graded, and Protect the Pod is on it', () => {
    const ids = card.sites.map(s => s.id)
    assert(new Set(ids).size === ids.length, 'duplicate site ids')
    assert(ids.includes('ptp'), 'Protect the Pod missing')
    for (const s of card.sites) {
      const p = s.packs
      if (p.kind === 'measured') assert(p.repeatsHistogram.reduce((a, n) => a + n, 0) === p.kits, `${s.id}: histogram does not sum to kits`)
      if (p.kind === 'bounded') assert(Number.isFinite(p.meanRepeats) && Number.isFinite(p.crowded), `${s.id}: reported figures missing`)
    }
  })

  const ptp = ptpKitSummary(PTP_KITS)

  test('SPEC: Protect the Pod, re-measured live, is indistinguishable from the real boxes on every metric', () => {
    const committed = card.sites.find(x => x.id === 'ptp')!
    const live: Site = { ...committed, packs: { kind: 'measured', kits: ptp.kits, repeatsHistogram: ptp.repeatsHistogram, metrics: ptp.metrics } }
    const g = gradeSite(card.reference, live)
    console.log(`   live grade ${g.total}% · ${AXES.map(a => `${a} ${g.axes[a]}`).join(' · ')}`)
    assert(g.misses.length === 0, g.misses.map(m =>
      `${label(m.id)} ${m.id === 'repeatsKs' ? `D=${m.z?.toFixed(3)}` : `${m.z?.toFixed(1)}σ`} (real ${m.id === 'repeatsKs' ? '' : card.reference.metrics[m.id].mean.toFixed(2)}, ours ${m.id === 'repeatsKs' ? '' : ptp.metrics[m.id]!.mean.toFixed(2)})`).join('; '))
  })

  // FIXED (2026-10-10): every one of the 11 real ASH boxes held 4-6 rare
  // leaders — 52 in 252 packs of complete kits, 1 in 4.8, a 4:1 strip. The
  // sheet printed 6:1 AND parked its rare holes at the end of each cell, past
  // a fresh box's 24 pulls, so ASH came out 1 in 9. Fixed in the strip:
  // beltRatios.leaderPrints = 4:1 for ASH, rare holes placed at random
  // (src/belts/leaderSheet.ts). Rarity is read from the card name, so all 11
  // boxes count.
  test('FIXED: rare leaders per pack match the real ASH boxes (4:1 strip, random rare holes)', () => {
    const kits = realKits()
    const realPacks = kits.length * 6
    const realRare = kits.reduce((a, k) => a + k.stat.values.rareLeaders, 0)
    const p = realRare / realPacks
    const se = Math.sqrt(p * (1 - p) / realPacks)
    const ours = ptp.metrics.rareLeaders!.mean / 6
    console.log(`   rare leaders per pack: real ${realRare}/${realPacks} = ${p.toFixed(3)} (1 in ${(1 / p).toFixed(1)}) · ours ${ours.toFixed(3)} (1 in ${(1 / ours).toFixed(1)})`)
    assert(Math.abs(ours - p) <= 3 * se, `ours ${ours.toFixed(3)} vs real ${p.toFixed(3)} ± ${(3 * se).toFixed(3)} (3σ)`)
  })

  const run = (kit: (p: DeckPool, r: Rng) => KitCard[], seed: number) => {
    const rng = seededRng(seed)
    return summarize(Array.from({ length: PORT_KITS }, () => kitStat(kit(pool, rng))))
  }
  const mean = (s: ReturnType<typeof run>, id: keyof typeof s.metrics) => s.metrics[id]!.mean
  const sd = (s: ReturnType<typeof run>, id: keyof typeof s.metrics) => s.metrics[id]!.sd

  test('SPEC: CCS port — legendaries/kit = 6 × (1/8 rare slot + 1/104 foil); one plain foil a pack', () => {
    const s = run(ccsKit, 11)
    near('CCS legendaries', mean(s, 'legendary'), 6 * (1 / 8 + 1 / 104), sd(s, 'legendary'), s.kits)
    assert(mean(s, 'special') === 0, 'CCS has no specials')
    assert(mean(s, 'plainFoil') === 6, 'CCS foil slot is a plain foil every pack')
  })

  test('SPEC: SWUDraftSim port — specials/kit = 6 × 10% foil; no bases; undeduped slots still repeat', () => {
    const s = run(swuDraftSimKit, 12)
    near('SWUDraftSim specials', mean(s, 'special'), 0.6, sd(s, 'special'), s.kits)
    assert(mean(s, 'bases') === 0, 'packs carry no base')
    assert(s.meanRepeats > 0, 'rare, rare-uncommon and foil slots are not redrawn, so repeats must occur')
  })

  test('SPEC: SWU Sealed port — no bases; prestige/kit = 6/18; one hyperspace and one HS foil a pack', () => {
    const s = run(swuSealedKit, 14)
    assert(mean(s, 'bases') === 0, 'addBase() is commented out')
    near('SWU Sealed prestige', mean(s, 'prestige'), 6 / 18, sd(s, 'prestige'), s.kits)
    assert(mean(s, 'hyperspace') === 6 && mean(s, 'hyperspaceFoil') === 6, 'one HS and one HSF per pack')
  })

  test('SPEC: ManyTCG port — legendaries/kit = 6 × (1/5 + legendaries/deck pool); never foil or hyperspace', () => {
    const s = run(manyTcgKit, 13)
    near('ManyTCG legendaries', mean(s, 'legendary'), 6 * (0.2 + pool.Legendary.length / pool.all.length), sd(s, 'legendary'), s.kits)
    assert(mean(s, 'hyperspace') + mean(s, 'hyperspaceFoil') + mean(s, 'plainFoil') === 0, 'no treatments')
  })

  test('SPEC: Limited Lab port — hyperspace/kit = 6 × (2/3 HS common + 1/15 rare slot); no prestige, no HS leaders or bases', () => {
    const llPool = limitedLabPool(ash as never)
    const rng = seededRng(15)
    const s = summarize(Array.from({ length: PORT_KITS }, () => kitStat(limitedLabKit(llPool, rng))))
    near('Limited Lab hyperspace', mean(s, 'hyperspace'), 6 * (2 / 3 + 1 / 15), sd(s, 'hyperspace'), s.kits)
    assert(mean(s, 'prestige') === 0 && mean(s, 'hyperspaceBases') === 0, 'their code prints no prestige and no HS bases')
    near('Limited Lab showcase-only leaders', mean(s, 'hyperspaceLeaders'), 6 / 288, sd(s, 'hyperspaceLeaders'), s.kits)
  })

  console.log(`\n\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  console.log(`\x1b[90m   Tests failed: ${failed}\x1b[0m`)
  if (failed > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
