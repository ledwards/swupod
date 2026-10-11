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
import { clearBeltCache, generateSealedBox, generateSealedPod } from '../utils/boosterPack'
import { kitStat, moment, summarize, type KitCard } from './comps/kitStats'
import { buildReference, realKits } from './comps/realKits'
import { expectedLegendaries } from './comps/expectedLegendaries'
import { ptpCard, ptpKitSummary } from './comps/ptpKits'
import { ccsKit, deckPool, feltTableKit, manyTcgKit, seededRng, swuDr4ftKit, swuDraftSimKit, swuSealedKit, type DeckPool, type Rng } from './comps/competitors'
import { limitedLabKit, limitedLabPool } from './comps/limitedLab'
import { AXES, METRICS, gradeSite, zScore, type Reference, type Site } from '../services/compsScore'

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
  const expected = expectedLegendaries('ASH', ash as never)
  const real = buildReference(undefined, { legendary: expected.perKit })

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

  // Eight-pack windows 1-8 and 17-24 sit inside one box column; 9-16 crosses
  // the column seam. Real boxes put 17 duplicates in the seam window against
  // ~12 inside a column; our stacking gives ~11 everywhere, and reversing the
  // second column gives ~28. The seam depends on the order packs are pulled
  // across columns, which the transcriptions do not pin down (it looks like it
  // varied by box). Inside a column there is no such question, so that is the
  // spec; the seam is logged until pull order is measured.
  test('SPEC: duplicates per eight packs inside one box column match the real boxes (|z| ≤ 3)', () => {
    const kits8 = realKits(undefined, 8)
    const realIn = kits8.filter(k => k.window !== 1).map(k => k.stat.repeats)
    const realSeam = kits8.filter(k => k.window === 1).map(k => k.stat.repeats)
    const BOXES = 300
    const ours: number[][] = [[], [], []]
    for (let b = 0; b < BOXES; b++) {
      clearBeltCache()
      const box = generateSealedBox([], 'ASH')
      for (let w = 0; w < 3; w++) {
        ours[w]!.push(kitStat(box.slice(w * 8, w * 8 + 8).flatMap(p => p.cards).map(c => ptpCard(c as never))).repeats)
      }
    }
    const m = (xs: number[]) => moment(xs)
    const inside = m([...ours[0]!, ...ours[2]!])
    const z = zScore(m(realIn), inside)
    console.log(`   eight packs inside a column: real ${m(realIn).mean.toFixed(2)} (n ${realIn.length}) · ours ${inside.mean.toFixed(2)} · z ${z.toFixed(2)}`)
    console.log(`   eight packs across the seam: real ${m(realSeam).mean.toFixed(2)} (n ${realSeam.length}) · ours ${m(ours[1]!).mean.toFixed(2)} — depends on pull order, not graded`)
    assert(z <= 3, `inside a column: ours ${inside.mean.toFixed(2)} vs real ${m(realIn).mean.toFixed(2)} (z ${z.toFixed(2)})`)
  })

  // Number-verified boxes: a foil common lands in a six-pack kit that holds its
  // normal 41.7% of the time (n 120); an independent foil sheet gives ~47%.
  // packRules.foilCommonPlate prints part of the foil commons from the normal
  // plate 15 packs back (src/belts/CommonPlate.ts).
  test('SPEC: foil commons sit with their normal at the verified-box rate (41.7%, within 2.5σ)', () => {
    clearBeltCache()
    let n = 0, hit = 0
    for (let b = 0; b < 400; b++) {
      const box = [...generateSealedPod([], 'ASH', 12), ...generateSealedPod([], 'ASH', 12)]
      for (let k = 0; k < 4; k++) {
        const kit = box.slice(k * 6, k * 6 + 6).flatMap(p => p.cards)
        const normals = new Set(kit.filter(c => c.rarity === 'Common' && !c.isLeader && !c.isBase && (c.variantType || 'Normal') === 'Normal').map(c => `${c.name}|${c.subtitle || ''}`))
        for (const c of kit) {
          if (c.rarity !== 'Common' || c.variantType !== 'Hyperspace Foil') continue
          n++
          if (normals.has(`${c.name}|${c.subtitle || ''}`)) hit++
        }
      }
    }
    const rate = hit / n
    const se = Math.sqrt(0.417 * 0.583 / 120)
    console.log(`   foil commons with their normal in the kit: ours ${(100 * rate).toFixed(1)}% · real 41.7% (n 120)`)
    assert(Math.abs(rate - 0.417) <= 2.5 * se, `ours ${(100 * rate).toFixed(1)}% vs real 41.7% ± ${(250 * se).toFixed(1)}`)
  })

  // The R/L sheet, foil sheet, UC3 sheet and prestige checklist fix the
  // legendary rate exactly; the generator must print it. (The opened boxes
  // agree within noise: 72 legendaries in 261 packs vs 63 expected, 1.1σ.)
  test('SPEC: legendaries per kit equal the rate computed from the strips (ASH 1.455)', () => {
    const m = ptp.metrics.legendary!
    console.log(`   legendaries/kit: computed ${expected.perKit.toFixed(3)} (R/L ${expected.rareSlot.toFixed(4)} + foil ${expected.foil.toFixed(4)} + UC3 ${expected.uc3.toFixed(4)} + prestige ${expected.prestige.toFixed(4)} per pack) · ours ${m.mean.toFixed(3)}`)
    near('legendaries/kit', m.mean, expected.perKit, m.sd, m.n)
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

  test('SPEC: Felt Table port — legendaries/kit = 6 × (1/5 rare slot + 1/13 × 4/5 × 1/5 foil); a base every pack', () => {
    const s = run(feltTableKit, 16)
    near('Felt Table legendaries', mean(s, 'legendary'), 6 * (1 / 5 + (1 / 13) * (4 / 5) * (1 / 5)), sd(s, 'legendary'), s.kits)
    near('Felt Table rare leaders', mean(s, 'rareLeaders'), 6 / 6, sd(s, 'rareLeaders'), s.kits)
    assert(mean(s, 'bases') === 6, 'one common base per pack')
  })

  test('SPEC: SWU-DR4FT port — legendaries/kit = 6 × (0.20 rare slot + 0.015 UC3 + 0.025 foil); rare leader 1 in 7; no bases', () => {
    const s = run(swuDr4ftKit, 17)
    near('SWU-DR4FT legendaries', mean(s, 'legendary'), 6 * (0.2 + 0.015 + 0.025), sd(s, 'legendary'), s.kits)
    near('SWU-DR4FT rare leaders', mean(s, 'rareLeaders'), 6 / 7, sd(s, 'rareLeaders'), s.kits)
    assert(mean(s, 'bases') === 0, 'bases come as a separate pool, not in packs')
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
