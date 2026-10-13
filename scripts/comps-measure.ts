/**
 * Measure every simulator in the pack comparison and write the scorecard the
 * /comps page reads (src/data/compsScorecard.json).
 *
 *   Real boxes      — data/real-boxes/ash-box-*.csv, consumer-order kits.
 *   Protect the Pod — generateSealedPod('ASH', 6), the path players open.
 *   Limited Lab     — port of limitedlab.app/sealed/app.js (src/qa/comps/limitedLab.ts).
 *   CCS, SWU Sealed, SWUDraftSim, ManyTCG — ports in src/qa/comps/competitors.ts.
 *   Felt Table      — port of its ASH pack function (forcetable.net client chunk).
 *   SWU-DR4FT       — port of github.com/statukuo/SWU-dr4ft's server booster generator.
 *
 * Every generated column draws from the same ASH card pool as the boxes.
 *
 * Usage: npx tsx scripts/comps-measure.ts [--kits=20000] [--ptp-kits=2400]
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeCardCache, getCachedCards } from '../src/utils/cardCache'
import { histogramValues, kitStat, moment, summarize, type KitCard, type KitSummary, type Moment } from '../src/qa/comps/kitStats'
import { buildReference } from '../src/qa/comps/realKits'
import { computedTargets } from '../src/qa/comps/expectedLegendaries'
import { ptpKitSummary } from '../src/qa/comps/ptpKits'
import {
  ccsKit, deckPool, feltTableKit, manyTcgKit, seededRng, swuDr4ftKit, swuDraftSimKit, swuSealedKit, type DeckPool, type Rng,
} from '../src/qa/comps/competitors'
import { limitedLabKit, limitedLabPool } from '../src/qa/comps/limitedLab'
import { AXES, gradeAll, METRICS, type Feature, type Site } from '../src/services/compsScore'

const arg = (name: string, dflt: string) =>
  (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt
const KITS = Number(arg('kits', '20000'))
const PTP_KITS = Number(arg('ptp-kits', '2400'))
const OUT = join(import.meta.dirname, '..', 'src', 'data', 'compsScorecard.json')

type Features = Record<Feature, boolean>
const f = (draft: boolean, multiplayer: boolean, realOpponent: boolean, sitewideStats: boolean, personalStats: boolean): Features =>
  ({ draft, sealed: true, solo: true, multiplayer, realOpponent, sitewideStats, personalStats })

interface Provenance { method: 'generated' | 'ported' | 'reported' | 'unpublished', source: string }
/** Play vs AI is shown on the page but not graded: real limited has no AI seat. */
type Entry = Site & { playVsAi: boolean | 'alpha', provenance: Provenance }

function measured(s: KitSummary, repeats8: Moment): Site['packs'] {
  return { kind: 'measured', kits: s.kits, repeatsHistogram: s.repeatsHistogram, metrics: s.metrics, repeats8 }
}

/** Duplicates per eight-pack kit, from the same pack function. */
function eight(make: () => KitCard[]): Moment {
  return moment(Array.from({ length: KITS }, () => kitStat(make()).repeats))
}

type PortFn = (p: DeckPool, r: Rng, packs?: number) => KitCard[]

function runPort(pool: DeckPool, kit: PortFn, seed: number): Site['packs'] {
  const rng = seededRng(seed)
  const six = summarize(Array.from({ length: KITS }, () => kitStat(kit(pool, rng))))
  const rng8 = seededRng(seed + 1000)
  return measured(six, eight(() => kit(pool, rng8, 8)))
}

async function main() {
  console.log('Loading card data…')
  await initializeCardCache()
  const ash = getCachedCards('ASH') as unknown as Parameters<typeof deckPool>[0]
  const pool = deckPool(ash)
  console.log(`ASH pool: ${pool.Common.length} C · ${pool.Uncommon.length} U · ${pool.Rare.length} R · ${pool.Legendary.length} L · ${pool.Special.length} S · ${pool.Leaders.length} leaders · ${pool.Bases.length} bases`)

  // The rarity mix is computed from the published pack and the strips; the
  // opened boxes set the tolerance.
  const computed = computedTargets('ASH', ash as never)
  const reference = buildReference(undefined, computed)
  console.log(`Real boxes: ${reference.kits} kits · rarity mix computed ${['legendary', 'rare', 'special', 'uncommon', 'common'].map(id => computed[id as 'rare']!.toFixed(2)).join(' / ')} per kit`)

  console.log(`Protect the Pod: ${PTP_KITS} kits…`)
  const ptp = ptpKitSummary(PTP_KITS)
  const ptp8 = ptpKitSummary(PTP_KITS, 8)
  console.log('Limited Lab and ports…')
  const llPool = limitedLabPool(ash)
  const llRng = seededRng(2)
  const ll = summarize(Array.from({ length: KITS }, () => kitStat(limitedLabKit(llPool, llRng))))
  const ll8 = eight(() => limitedLabKit(llPool, llRng, 8))

  const sites: Entry[] = [
    // AI play is alpha-only (lib/play/soloAuth.ts). Set true when it reaches regular users.
    { id: 'ptp', playVsAi: 'alpha', name: 'Protect the Pod', packs: measured(ptp, moment(histogramValues(ptp8.repeatsHistogram))), features: f(true, true, true, true, true),
      provenance: { method: 'generated', source: "generateSealedPod([], 'ASH', 6)" } },
    { id: 'limitedlab', playVsAi: false, name: 'Limited Lab', packs: measured(ll, ll8), features: f(false, false, false, true, true),
      provenance: { method: 'ported', source: 'limitedlab.app/sealed/app.js (makeBox, openKit)' } },
    { id: 'swudraftsim', playVsAi: false, name: 'SWUDraftSim', packs: runPort(pool, swuDraftSimKit, 3), features: f(true, false, false, false, false),
      provenance: { method: 'ported', source: 'github.com/Trys2Hard/swu-draft-sim client/src/Hooks/useCreatePacks.jsx + server/app.js' } },
    { id: 'felttable', playVsAi: true, name: 'Felt Table', packs: runPort(pool, feltTableKit, 7), features: f(true, false, false, false, false),
      provenance: { method: 'ported', source: 'forcetable.net/swu static/js/2.b6e781ae.chunk.js (ASH pack function, sealed pool builder)' } },
    { id: 'swusealed', playVsAi: false, name: 'SWU Sealed', packs: runPort(pool, swuSealedKit, 4), features: f(false, false, false, true, false),
      provenance: { method: 'ported', source: 'github.com/MPaap/SWU-Sealed-Sim app/Services/Packs/LAWPackStrategy.php' } },
    { id: 'swudr4ft', playVsAi: false, name: 'SWU-DR4FT', packs: runPort(pool, swuDr4ftKit, 8), features: f(true, true, true, false, false),
      provenance: { method: 'ported', source: 'github.com/statukuo/SWU-dr4ft backend/boosterGenerator.js + scripts/generateBoosterData.js (ASH)' } },
    { id: 'ccs', playVsAi: false, name: 'CCS', packs: runPort(pool, ccsKit, 5), features: f(false, false, false, false, false),
      provenance: { method: 'ported', source: 'github.com/doctor-kat/swu-ccs src/app/api/booster/generateBooster.ts' } },
    { id: 'manytcg', playVsAi: false, name: 'ManyTCG', packs: runPort(pool, manyTcgKit, 6), features: f(true, true, true, false, true),
      provenance: { method: 'ported', source: 'manytcg.com/draft client pack registry (tcgId SWU)' } },
  ]

  writeFileSync(OUT, JSON.stringify({
    measuredAt: new Date().toISOString().slice(0, 10),
    set: 'ASH',
    reference: { ...reference, source: 'data/real-boxes/ash-box-*.csv (treatment metrics: number-verified boxes only; rarity mix computed from the published pack and the strips)' },
    sites,
  }, null, 2) + '\n')
  console.log(`Wrote ${OUT}\n`)

  const label = (id: string) => id === 'repeatsKs' ? 'Repeat spread' : METRICS.find(m => m.id === id)!.label
  for (const g of gradeAll(reference, sites)) {
    console.log(`${String(g.total).padStart(3)}%  ${g.name.padEnd(16)} ${AXES.map(a => `${a} ${g.axes[a]}`).join(' · ')}`)
    const misses = g.misses.map(m => `${label(m.id)} ${m.z === null ? '—' : m.id === 'repeatsKs' ? `D=${m.z.toFixed(2)}` : `${m.z.toFixed(1)}σ`}`)
    if (misses.length) console.log(`      misses: ${misses.join(', ')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
