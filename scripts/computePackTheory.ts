// Compute the THEORETICAL pack-content distribution by Monte-Carlo simulation
// of the real generator, and write it to src/data/packTheory.json.
//
// WHY THIS EXISTS
// ===============
// The "theory" we compare production pulls against is not an analytic formula —
// it's whatever the belt/collation system actually produces. The only faithful
// way to get those rates is to run the generator a great many times and tally.
// That is too expensive to do per web request, so we precompute it here into a
// committed artifact the app can read in O(1).
//
// The artifact is keyed to COLLATION_VERSION. Re-run this script:
//   - when a new set ships (it iterates every configured set automatically), or
//   - whenever the collation algorithm changes (bump COLLATION_VERSION first).
//
// Usage:
//   npx tsx scripts/computePackTheory.ts            # default 4000 pods/set
//   npx tsx scripts/computePackTheory.ts --pods=10000
//
// For each set it generates `pods` sealed pods (6 packs each, belt cache reset
// per pod, exactly mirroring a real sealed open) and records, per pack, counts
// for every rarity bucket, aspect category, and variant treatment. It stores
// the per-pack mean AND standard deviation for each bucket so the app can run a
// CLT z-test of production actuals (observed total over M packs) against theory
// without re-simulating: expected = mean*M, se = sd*sqrt(M).

import { generateSealedPod, clearBeltCache } from '../src/utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../src/utils/cardCache'
import { classifyAspect, ASPECT_CATEGORIES } from '../src/services/expectedDistribution'
import { getAllSetCodes } from '../src/utils/setConfigs'
import { COLLATION_VERSION } from '../src/utils/packConstants'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'packTheory.json')

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special'] as const
const VARIANTS = ['foil', 'hyperspace', 'hyperspaceFoil', 'showcase', 'prestige'] as const
const PACKS_PER_POD = 6

const podsArg = process.argv.find((a) => a.startsWith('--pods='))
const PODS = podsArg ? Math.max(100, parseInt(podsArg.split('=')[1], 10) || 0) : 4000

// Online accumulator: sum and sum-of-squares of a per-pack count, so we can
// emit { mean, sd } over all packs without retaining every observation.
class Stat {
  n = 0
  sum = 0
  sumSq = 0
  add(x: number) {
    this.n += 1
    this.sum += x
    this.sumSq += x * x
  }
  get mean() {
    return this.n > 0 ? this.sum / this.n : 0
  }
  get sd() {
    if (this.n < 2) return 0
    const v = this.sumSq / this.n - this.mean * this.mean
    return v > 0 ? Math.sqrt(v) : 0
  }
  out() {
    return { mean: round(this.mean), sd: round(this.sd) }
  }
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6
}

function variantOf(card: any): (typeof VARIANTS)[number] | null {
  const vt = card.variantType
  if (card.isPrestige) return 'prestige'
  if (vt === 'Hyperspace Foil') return 'hyperspaceFoil'
  if (vt === 'Hyperspace') return 'hyperspace'
  if (vt === 'Showcase') return 'showcase'
  if (vt === 'Foil' || card.isFoil) return 'foil'
  return null // Normal
}

function blankBuckets() {
  const rarity: Record<string, Stat> = {}
  for (const r of RARITIES) rarity[r] = new Stat()
  const aspect: Record<string, Stat> = {}
  for (const a of ASPECT_CATEGORIES) aspect[a] = new Stat()
  const variant: Record<string, Stat> = {}
  for (const v of VARIANTS) variant[v] = new Stat()
  return { rarity, aspect, variant, cards: new Stat() }
}

function outBuckets(b: ReturnType<typeof blankBuckets>) {
  const rarity: Record<string, { mean: number; sd: number }> = {}
  for (const r of RARITIES) rarity[r] = b.rarity[r].out()
  const aspect: Record<string, { mean: number; sd: number }> = {}
  for (const a of ASPECT_CATEGORIES) aspect[a] = b.aspect[a].out()
  const variant: Record<string, { mean: number; sd: number }> = {}
  for (const v of VARIANTS) variant[v] = b.variant[v].out()
  return { cardsPerPack: b.cards.out(), rarity, aspect, variant }
}

async function main() {
  const t0 = Date.now()
  console.log(`Computing pack theory — collation v${COLLATION_VERSION}, ${PODS} pods/set (${PODS * PACKS_PER_POD} packs/set)\n`)
  await initializeCardCache()

  const sets: Record<string, any> = {}
  for (const setCode of getAllSetCodes()) {
    const cards = getCachedCards(setCode)
    if (!cards || cards.length === 0) {
      console.log(`  ${setCode}: no card data — skipped`)
      continue
    }
    const buckets = blankBuckets()
    let packCount = 0
    const setStart = Date.now()
    try {
      for (let p = 0; p < PODS; p++) {
        clearBeltCache()
        const pod = generateSealedPod(cards, setCode, PACKS_PER_POD)
        for (const pack of pod) {
          packCount += 1
          const rar: Record<string, number> = {}
          const asp: Record<string, number> = {}
          const vrt: Record<string, number> = {}
          for (const card of pack.cards) {
            rar[card.rarity] = (rar[card.rarity] || 0) + 1
            const a = classifyAspect(card)
            asp[a] = (asp[a] || 0) + 1
            const v = variantOf(card)
            if (v) vrt[v] = (vrt[v] || 0) + 1
          }
          buckets.cards.add(pack.cards.length)
          for (const r of RARITIES) buckets.rarity[r].add(rar[r] || 0)
          for (const a of ASPECT_CATEGORIES) buckets.aspect[a].add(asp[a] || 0)
          for (const v of VARIANTS) buckets.variant[v].add(vrt[v] || 0)
        }
      }
    } catch (err) {
      console.log(`  ${setCode}: generation failed (${(err as Error).message}) — skipped`)
      continue
    }
    sets[setCode] = { pods: PODS, packs: packCount, ...outBuckets(buckets) }
    console.log(`  ${setCode}: ${packCount} packs in ${((Date.now() - setStart) / 1000).toFixed(1)}s`)
  }

  const artifact = {
    collationVersion: COLLATION_VERSION,
    generatedAt: new Date().toISOString(),
    podsPerSet: PODS,
    packsPerPod: PACKS_PER_POD,
    rarities: RARITIES,
    aspects: ASPECT_CATEGORIES,
    variants: VARIANTS,
    notes:
      'Per-pack mean and sd from Monte-Carlo of the real generator. CLT z-test ' +
      'of actuals over M packs: expected = mean*M, se = sd*sqrt(M), z = (obs-expected)/se.',
    sets,
  }
  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2) + '\n')
  console.log(`\nWrote ${OUT_PATH} (${Object.keys(sets).length} sets) in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
