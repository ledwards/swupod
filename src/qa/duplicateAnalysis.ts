// @ts-nocheck
/**
 * Duplicate-rate analysis: THEORETICAL vs ACTUAL, per set.
 *
 * "Duplicate" = same card irrespective of variant (a normal common and the
 * hyperspace common of the same card are one duplicate). Keyed on name+subtitle.
 *
 * THEORETICAL model (closed form): the belt's boots are longer than a pool, so
 * normal-vs-normal repeats are ~0; duplicates come from VARIANT cards (foil /
 * hyperspace / HS-foil / prestige / showcase) colliding with a card of the same
 * name already in the pool. Model each variant card as an independent Bernoulli
 * collision with p = (distinct normals of its category in the pool) / (category
 * pool size). The pool duplicate count is then Poisson-Binomial.
 *
 * ACTUAL: Monte Carlo over the real generator (generateSealedPod / generateSealedBox).
 *
 * STATS: 95% CI on the Monte-Carlo mean, z-score of (actual-theory), and a
 * chi-square goodness-of-fit of the actual dup-count histogram vs the
 * Poisson-Binomial prediction. Also reports the NAIVE occupancy model (ignores
 * the belt) for contrast.
 *
 * Usage:
 *   tsx duplicateAnalysis.ts <N> run <SET>   -> per-set JSON to stdout (parallelizable)
 *   tsx duplicateAnalysis.ts <N> build       -> merge /tmp/da_<SET>.json -> src/data/duplicateStats.json + summary
 */
import { generateSealedPod, generateSealedBox } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'

const N = parseInt(process.argv[2] || '2000', 10)
const SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH']
const CATS = ['Leader', 'Base', 'Common', 'Uncommon', 'Rare', 'Legendary', 'Special']

const gameId = (c: any) => (c.name || c.cardId || c.id) + '|' + (c.subtitle || '')
const isVariant = (c: any) => !!(c.isFoil || c.isHyperspace || c.isShowcase || c.isPrestige) || (c.variantType && c.variantType !== 'Normal')
const vtag = (c: any) => {
  const t = c.variantType || ''
  if (c.isPrestige || /Prestige/i.test(t)) return 'Prestige'
  if (c.isShowcase || /Showcase/i.test(t)) return 'Showcase'
  if (c.isFoil && c.isHyperspace) return 'HyperspaceFoil'
  if (c.isHyperspace) return 'Hyperspace'
  if (c.isFoil) return 'Foil'
  return 'Normal'
}
const catOf = (c: any) => (c.isLeader || c.type === 'Leader') ? 'Leader' : (c.isBase || c.type === 'Base') ? 'Base' : (c.rarity || 'Unknown')
const flat = (packs: any[]) => packs.flatMap((p: any) => p.cards)
function pickK(n: number, k: number) {
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[idx[i], idx[j]] = [idx[j], idx[i]] }
  return idx.slice(0, k)
}

// distinct card NAMES per category in a set (the gameplay pool size N_r)
function poolSizes(set: string) {
  const cards = getCachedCards(set)
  const seen = new Map<string, string>() // name -> category
  for (const c of cards) { const k = gameId(c); if (!seen.has(k)) seen.set(k, catOf(c)) }
  const sizes: any = {}; for (const cat of CATS) sizes[cat] = 0
  for (const cat of seen.values()) if (sizes[cat] !== undefined) sizes[cat]++
  return sizes
}

function emptyAcc() {
  return {
    pods: 0, dupSum: 0, dupSq: 0,
    hist: new Array(16).fill(0),
    byCat: Object.fromEntries(CATS.map(c => [c, 0])),
    pair: {} as any,
    // per-pool category aggregates for the theoretical model
    varLoad: Object.fromEntries(CATS.map(c => [c, 0])),     // mean variant cards / pool by category
    normPresent: Object.fromEntries(CATS.map(c => [c, 0])), // mean distinct normal names / pool by category
  }
}
function recordPod(a: any, cards: any[]) {
  const groups = new Map<string, any[]>()
  for (const c of cards) { const k = gameId(c); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(c) }
  let dups = 0
  for (const arr of groups.values()) {
    if (arr.length >= 2) {
      dups++
      const combo = arr.map(vtag).sort().join(' + ')
      a.pair[combo] = (a.pair[combo] || 0) + 1
      a.byCat[catOf(arr[0])] = (a.byCat[catOf(arr[0])] || 0) + 1
    }
  }
  a.pods++; a.dupSum += dups; a.dupSq += dups * dups; a.hist[Math.min(dups, 15)]++
  // variant load + distinct normals per category (for theory parameters)
  const normNames: any = Object.fromEntries(CATS.map(c => [c, new Set()]))
  for (const c of cards) {
    const cat = catOf(c)
    if (isVariant(c)) a.varLoad[cat] = (a.varLoad[cat] || 0) + 1
    else if (normNames[cat]) normNames[cat].add(gameId(c))
  }
  for (const cat of CATS) a.normPresent[cat] += normNames[cat].size
}

// Poisson-Binomial pmf from a list of success probabilities
function poissonBinomial(ps: number[]) {
  let pmf = [1]
  for (const p of ps) {
    const next = new Array(pmf.length + 1).fill(0)
    for (let k = 0; k < pmf.length; k++) { next[k] += pmf[k] * (1 - p); next[k + 1] += pmf[k] * p }
    pmf = next
  }
  return pmf
}
// naive occupancy: E[# names with >=2 copies] = N*(1-(1-1/N)^n - n/N*(1-1/N)^(n-1)); exact under multinomial
function naiveDupSets(n: number, P: number) {
  if (P <= 0 || n < 2) return 0
  const q = 1 - 1 / P
  return P * (1 - Math.pow(q, n) - n * (1 / P) * Math.pow(q, n - 1))
}

function runSet(set: string) {
  const sizes = poolSizes(set)
  const sealed = emptyAcc(), draft = emptyAcc()
  for (let i = 0; i < N; i++) recordPod(sealed, flat(generateSealedPod([], set, 6)))
  const BOX = Math.max(150, Math.floor(N / 6))
  for (let b = 0; b < BOX; b++) { const box = generateSealedBox([], set, 24); for (let t = 0; t < 25; t++) recordPod(draft, pickK(24, 3).flatMap(ix => box[ix].cards)) }
  return { set, sizes, sealed, draft }
}

// ---- statistics built at merge time from the raw accumulators ----
function statsFor(a: any, sizes: any, packs: number) {
  const pods = a.pods
  const mean = a.dupSum / pods
  const variance = a.dupSq / pods - mean * mean
  const sd = Math.sqrt(Math.max(0, variance))
  const se = sd / Math.sqrt(pods)
  const ci95 = [mean - 1.96 * se, mean + 1.96 * se]
  const varLoad: any = {}, normPresent: any = {}, p: any = {}
  for (const cat of CATS) { varLoad[cat] = a.varLoad[cat] / pods; normPresent[cat] = a.normPresent[cat] / pods; p[cat] = sizes[cat] ? Math.min(1, normPresent[cat] / sizes[cat]) : 0 }
  // theoretical: each expected variant card is a Bernoulli collision with p[cat]
  const trials: number[] = []
  let theoryMean = 0
  for (const cat of CATS) {
    const load = varLoad[cat]; const pc = p[cat]
    theoryMean += load * pc
    const whole = Math.floor(load); for (let i = 0; i < whole; i++) trials.push(pc)
    const frac = load - whole; if (frac > 1e-9) trials.push(frac * pc) // fractional trial preserves the mean
  }
  const theoryPmf = poissonBinomial(trials)
  // naive occupancy (ignores belt): treat each category's slots as iid draws
  // slots/pool: leader 1*packs, base 1*packs, common 9*packs, uncommon 3*packs, R/L 1*packs split
  const naive = naiveDupSets(1 * packs, sizes.Leader) + naiveDupSets(1 * packs, sizes.Base)
    + naiveDupSets(9 * packs, sizes.Common) + naiveDupSets(3 * packs, sizes.Uncommon)
    + naiveDupSets((5 / 6) * packs, sizes.Rare) + naiveDupSets((1 / 6) * packs, sizes.Legendary)
  // z-score of actual vs theory mean
  const z = se > 0 ? (mean - theoryMean) / se : 0
  // chi-square GoF: actual histogram vs theoryPmf, pooled tails so every E>=5
  const obs = a.hist.slice(); const exp = theoryPmf.map((x: number) => x * pods)
  const L = Math.max(obs.length, exp.length)
  while (obs.length < L) obs.push(0); while (exp.length < L) exp.push(0)
  // pool from both ends until expected >=5
  const O: number[] = [], E: number[] = []
  let oa = 0, ea = 0
  for (let k = 0; k < L; k++) {
    oa += obs[k]; ea += exp[k]
    if (ea >= 5) { O.push(oa); E.push(ea); oa = 0; ea = 0 }
  }
  if (oa > 0 || ea > 0) { if (E.length) { O[O.length - 1] += oa; E[E.length - 1] += ea } else { O.push(oa); E.push(ea) } }
  let chi2 = 0; for (let k = 0; k < E.length; k++) if (E[k] > 0) chi2 += (O[k] - E[k]) ** 2 / E[k]
  const dof = Math.max(1, E.length - 1)
  return {
    mean: +mean.toFixed(4), sd: +sd.toFixed(4), se: +se.toFixed(4), ci95: ci95.map((x: number) => +x.toFixed(4)),
    pods, hist: a.hist.slice(0, 12),
    theoryMean: +theoryMean.toFixed(4), theoryPmf: theoryPmf.slice(0, 12).map((x: number) => +x.toFixed(5)),
    naiveMean: +naive.toFixed(3),
    z: +z.toFixed(2), chi2: +chi2.toFixed(2), dof, chi2PerDof: +(chi2 / dof).toFixed(2),
    varLoad: Object.fromEntries(CATS.map(c => [c, +varLoad[c].toFixed(3)])),
    collisionP: Object.fromEntries(CATS.map(c => [c, +p[c].toFixed(3)])),
    byCat: Object.fromEntries(CATS.map(c => [c, +(a.byCat[c] / pods).toFixed(3)])),
    pair: Object.fromEntries(Object.entries(a.pair).map(([k, v]: any) => [k, +(v / pods).toFixed(3)]).sort((x: any, y: any) => y[1] - x[1]).slice(0, 8)),
  }
}

async function main() {
  const mode = process.argv[3]
  if (mode === 'run') {
    await initializeCardCache()
    const set = process.argv[4]
    const t = Date.now()
    const r = runSet(set)
    console.error(`[${((Date.now() - t) / 1000).toFixed(1)}s] ${set} done`)
    process.stdout.write(JSON.stringify(r))
    return
  }
  // build mode: merge per-set raw files, compute stats, write src/data/duplicateStats.json
  const fs = await import('fs')
  const path = await import('path')
  const url = await import('url')
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
  const out: any = { generatedAt: process.env.DA_DATE || '', sampleSizePerSet: N, metric: 'same card irrespective of variant (name+subtitle)', sets: {} }
  for (const s of SETS) {
    const p = `/tmp/da_${s}.json`
    if (!fs.existsSync(p)) { console.error(`missing ${s}`); continue }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    out.sets[s] = {
      poolSizes: raw.sizes,
      sealed6: statsFor(raw.sealed, raw.sizes, 6),
      draft3: statsFor(raw.draft, raw.sizes, 3),
    }
  }
  const dataPath = path.join(__dirname, '..', 'data', 'duplicateStats.json')
  fs.writeFileSync(dataPath, JSON.stringify(out, null, 2))
  console.log(`Wrote ${dataPath}\n`)
  // summary table
  console.log('Set  | SEALED actual (95% CI)        theory   naive  | z     chi2/dof | DRAFT actual')
  for (const s of SETS) {
    const o = out.sets[s]; if (!o) continue
    const a = o.sealed6, d = o.draft3
    console.log(`${s.padEnd(4)} | ${a.mean.toFixed(2)} [${a.ci95[0].toFixed(2)},${a.ci95[1].toFixed(2)}]   ${a.theoryMean.toFixed(2).padStart(6)}  ${a.naiveMean.toFixed(1).padStart(5)}  | ${a.z.toFixed(2).padStart(5)}  ${a.chi2PerDof.toFixed(2).padStart(7)} | ${d.mean.toFixed(2)} [${d.ci95[0].toFixed(2)},${d.ci95[1].toFixed(2)}]`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
