/**
 * Measure every simulator in the pack comparison and write the scorecard the
 * /comps page reads (src/data/compsScorecard.json).
 *
 *   Real boxes      — data/real-boxes/ash-box-*.csv, consumer-order kits.
 *   Protect the Pod — generateSealedPod('ASH', 6), the path players open.
 *   Limited Lab     — port of limitedlab.app/sealed/app.js (src/qa/comps/limitedLab.ts).
 *   CCS, SWU Sealed, SWUDraftSim, ManyTCG — ports in src/qa/comps/competitors.ts.
 *   Felt Table      — pack code not public in a readable form; repeats and
 *                     rarity figures from docs/research/competitive-report.md.
 *   SWU-DR4FT       — booster odds are not in the client; unpublished.
 *
 * Every generated column draws from the same ASH card pool as the boxes.
 *
 * Usage: npx tsx scripts/comps-measure.ts [--kits=20000] [--ptp-kits=2400]
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeCardCache, getCachedCards } from '../src/utils/cardCache'
import { kitStat, summarize, type KitCard, type KitSummary } from '../src/qa/comps/kitStats'
import { buildReference } from '../src/qa/comps/realKits'
import { ptpKitSummary } from '../src/qa/comps/ptpKits'
import {
  ccsKit, deckPool, manyTcgKit, seededRng, swuDraftSimKit, swuSealedKit, type DeckPool, type Rng,
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
type Entry = Site & { playVsAi: boolean, provenance: Provenance }

function measured(s: KitSummary): Site['packs'] {
  return { kind: 'measured', kits: s.kits, repeatsHistogram: s.repeatsHistogram, metrics: s.metrics }
}

function runPort(pool: DeckPool, kit: (p: DeckPool, r: Rng) => KitCard[], seed: number): KitSummary {
  const rng = seededRng(seed)
  return summarize(Array.from({ length: KITS }, () => kitStat(kit(pool, rng))))
}

async function main() {
  console.log('Loading card data…')
  await initializeCardCache()
  const ash = getCachedCards('ASH') as unknown as Parameters<typeof deckPool>[0]
  const pool = deckPool(ash)
  console.log(`ASH pool: ${pool.Common.length} C · ${pool.Uncommon.length} U · ${pool.Rare.length} R · ${pool.Legendary.length} L · ${pool.Special.length} S · ${pool.Leaders.length} leaders · ${pool.Bases.length} bases`)

  const reference = buildReference()
  console.log(`Real boxes: ${reference.kits} kits`)

  console.log(`Protect the Pod: ${PTP_KITS} kits…`)
  const ptp = ptpKitSummary(PTP_KITS)
  console.log('Limited Lab and ports…')
  const llPool = limitedLabPool(ash)
  const llRng = seededRng(2)
  const ll = summarize(Array.from({ length: KITS }, () => kitStat(limitedLabKit(llPool, llRng))))
  const realCrowded = reference.repeatsHistogram.slice(10).reduce((a, n) => a + n, 0) / reference.kits
  const fixed = (mean: number) => ({ mean, sd: 0, n: 1 })

  const sites: Entry[] = [
    { id: 'ptp', playVsAi: false, name: 'Protect the Pod', packs: measured(ptp), features: f(true, true, true, true, true),
      provenance: { method: 'generated', source: "generateSealedPod([], 'ASH', 6)" } },
    { id: 'limitedlab', playVsAi: false, name: 'Limited Lab', packs: measured(ll), features: f(false, false, false, true, true),
      provenance: { method: 'ported', source: 'limitedlab.app/sealed/app.js (makeBox, openKit)' } },
    { id: 'swudraftsim', playVsAi: false, name: 'SWUDraftSim', packs: measured(runPort(pool, swuDraftSimKit, 3)), features: f(true, false, false, false, false),
      provenance: { method: 'ported', source: 'github.com/Trys2Hard/swu-draft-sim client/src/Hooks/useCreatePacks.jsx + server/app.js' } },
    { id: 'felttable', playVsAi: true, name: 'Felt Table', features: f(true, false, false, false, false),
      // Reported: 13.5 repeats/kit, 96% of kits at 10+. KS can be no smaller than the gap in the 10+ share.
      packs: {
        kind: 'bounded', ksLowerBound: Number(Math.abs(0.96 - realCrowded).toFixed(3)), meanRepeats: 13.5, crowded: 0.96,
        metrics: { legendary: fixed(1.3), rare: fixed(5.0), special: fixed(0.2), uncommon: fixed(19.4), common: fixed(58.2) },
      },
      provenance: { method: 'reported', source: 'docs/research/competitive-report.md (forcetable.net/swu HMW pack function, 2026-10-02)' } },
    { id: 'swusealed', playVsAi: false, name: 'SWU Sealed', packs: measured(runPort(pool, swuSealedKit, 4)), features: f(false, false, false, true, false),
      provenance: { method: 'ported', source: 'github.com/MPaap/SWU-Sealed-Sim app/Services/Packs/LAWPackStrategy.php' } },
    { id: 'swudr4ft', playVsAi: false, name: 'SWU-DR4FT', packs: { kind: 'unpublished' }, features: f(true, true, true, false, false),
      provenance: { method: 'unpublished', source: 'swu-dr4ft.up.railway.app — booster odds are not in the client' } },
    { id: 'ccs', playVsAi: false, name: 'CCS', packs: measured(runPort(pool, ccsKit, 5)), features: f(false, false, false, false, false),
      provenance: { method: 'ported', source: 'github.com/doctor-kat/swu-ccs src/app/api/booster/generateBooster.ts' } },
    { id: 'manytcg', playVsAi: false, name: 'ManyTCG', packs: measured(runPort(pool, manyTcgKit, 6)), features: f(true, true, true, false, true),
      provenance: { method: 'ported', source: 'manytcg.com/draft client pack registry (tcgId SWU)' } },
  ]

  writeFileSync(OUT, JSON.stringify({
    measuredAt: new Date().toISOString().slice(0, 10),
    set: 'ASH',
    reference: { ...reference, source: 'data/real-boxes/ash-box-*.csv (treatment metrics: number-verified boxes only)' },
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
