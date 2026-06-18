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
import { getAllSetCodes } from '../utils/setConfigs/index'

const N = parseInt(process.argv[2] || '2000', 10)
// Derived from the set-config registry, so a newly added set is picked up automatically.
const SETS = getAllSetCodes()
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

// "Naive random trials": keep the real pool's rarity composition but re-assign each
// card a uniformly random identity from its category pool (no belt collation).
// dedup=false allows repeats anywhere; dedup=true forbids repeats within a pack
// (the basic rule any simple generator enforces). Counts variant-neutral duplicates.
function naiveCount(packs: any[], sizes: any, dedup: boolean) {
  const counts = new Map<string, number>()
  for (const pack of packs) {
    const used: any = {}
    for (const c of pack.cards) {
      const cat = catOf(c); const P = sizes[cat] || 1
      let id: number
      if (dedup) {
        const s = used[cat] || (used[cat] = new Set())
        let guard = 0
        do { id = Math.floor(Math.random() * P); guard++ } while (s.has(id) && s.size < P && guard < 64)
        s.add(id)
      } else id = Math.floor(Math.random() * P)
      const k = cat + ':' + id
      counts.set(k, (counts.get(k) || 0) + 1)
    }
  }
  let d = 0; for (const v of counts.values()) if (v >= 2) d++
  return d
}

function runSet(set: string) {
  const sizes = poolSizes(set)
  const sealed = emptyAcc(), sealedShuffled = emptyAcc(), draft = emptyAcc()
  const naiveND = { sum: 0, n: 0 }, naiveD = { sum: 0, n: 0 } // naive random trials: no-dedup vs within-pack dedup
  // non-shuffled sealed = 6 consecutive packs from a fresh belt (tight collation)
  for (let i = 0; i < N; i++) {
    const packs = generateSealedPod([], set, 6)
    recordPod(sealed, flat(packs))
    naiveND.sum += naiveCount(packs, sizes, false); naiveND.n++
    naiveD.sum += naiveCount(packs, sizes, true); naiveD.n++
  }
  // box-based scenarios: draft (3 packs) and shuffled-sealed (6 packs) sampled spread across a 24-box
  const BOX = Math.max(150, Math.floor(N / 6))
  for (let b = 0; b < BOX; b++) {
    const box = generateSealedBox([], set, 24)
    for (let t = 0; t < 25; t++) recordPod(draft, pickK(24, 3).flatMap(ix => box[ix].cards))
    for (let t = 0; t < 12; t++) recordPod(sealedShuffled, pickK(24, 6).flatMap(ix => box[ix].cards))
  }
  return { set, sizes, sealed, sealedShuffled, draft, naiveND, naiveD }
}

// ---- DB actual: count duplicates (by name) in real opened pools ----
function simpleAcc() { return { n: 0, sum: 0, sq: 0, hist: new Array(16).fill(0) } }
function recordCount(a: any, d: number) { a.n++; a.sum += d; a.sq += d * d; a.hist[Math.min(d, 15)]++ }
function dupCountFromNames(names: string[]) {
  const m = new Map<string, number>()
  for (const k of names) m.set(k, (m.get(k) || 0) + 1)
  let d = 0; for (const v of m.values()) if (v >= 2) d++
  return d
}
async function runActual() {
  const fs = await import('fs')
  // prefer an explicit DATABASE_URL; otherwise fall back to the LOCAL dev DB (.env.local), never prod (.env)
  if (!process.env.DATABASE_URL) {
    try { const e = fs.readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.*)$/m); if (e) process.env.DATABASE_URL = e[1].trim().replace(/^["']|["']$/g, '') } catch {}
  }
  const { queryRows } = await import('../../lib/db')
  const LIMIT = parseInt(process.env.DA_ACTUAL_LIMIT || '4000', 10)
  const out: any = {}
  for (const set of SETS) {
    // project just the gameplay identity (name|subtitle) per card — keeps payload small
    const rows = await queryRows(
      `SELECT (SELECT jsonb_agg((elem->>'name') || '|' || COALESCE(elem->>'subtitle','')) FROM jsonb_array_elements(cards) elem) AS names,
              COALESCE(shuffled_packs, false) AS shuffled
       FROM card_pools
       WHERE pool_type = 'sealed' AND set_code = $1 AND cards IS NOT NULL
       ORDER BY created_at DESC LIMIT $2`, [set, LIMIT])
    const ns = simpleAcc(), sh = simpleAcc()
    for (const r of rows as any[]) {
      const names = r.names
      if (!Array.isArray(names) || names.length < 16) continue // skip malformed / partial pools
      recordCount(r.shuffled ? sh : ns, dupCountFromNames(names))
    }
    out[set] = { nonShuffled: ns, shuffled: sh }
    console.error(`actual ${set}: nonShuffled n=${ns.n} (mean ${(ns.sum / (ns.n || 1)).toFixed(2)})  shuffled n=${sh.n}`)
  }
  fs.writeFileSync('/tmp/da_actual.json', JSON.stringify(out))
  console.error('wrote /tmp/da_actual.json')
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

// compute actual (DB) stats from a simpleAcc and compare to the simulated reference
function actualStats(acc: any, simMean: number | null, simSd: number, simPods: number) {
  if (!acc || acc.n < 1) return { n: 0, verdict: 'no-data' }
  const mean = acc.sum / acc.n
  const variance = acc.sq / acc.n - mean * mean
  const sd = Math.sqrt(Math.max(0, variance))
  const se = sd / Math.sqrt(acc.n)
  let z: number | null = null, relDiff: number | null = null, verdict = 'sparse'
  if (acc.n >= 30 && simMean != null) {
    const simSe = simSd / Math.sqrt(simPods || 1)
    z = (mean - simMean) / Math.sqrt(se * se + simSe * simSe)
    relDiff = (mean - simMean) / simMean
    const ad = Math.abs(relDiff)
    // verdict combines effect size (relative diff) with significance, so huge N alone doesn't flag a bug
    verdict = ad < 0.05 ? 'consistent' : ad < 0.12 ? 'minor-drift' : 'investigate'
  }
  return {
    n: acc.n, mean: +mean.toFixed(4), sd: +sd.toFixed(4),
    ci95: [+(mean - 1.96 * se).toFixed(4), +(mean + 1.96 * se).toFixed(4)],
    hist: acc.hist.slice(0, 12),
    z: z == null ? null : +z.toFixed(2), relDiff: relDiff == null ? null : +relDiff.toFixed(4), verdict,
  }
}

async function main() {
  const mode = process.argv[3]
  if (mode === 'list') { process.stdout.write(SETS.join(' ')); return }
  if (mode === 'run') {
    await initializeCardCache()
    const set = process.argv[4]
    const t = Date.now()
    const r = runSet(set)
    console.error(`[${((Date.now() - t) / 1000).toFixed(1)}s] ${set} done`)
    process.stdout.write(JSON.stringify(r))
    return
  }
  if (mode === 'actual') {
    await runActual()
    return
  }
  // Lightweight, single-process naive computation (low memory — one card-cache load).
  if (mode === 'naiveall') {
    await initializeCardCache()
    const fs = await import('fs')
    const NN = parseInt(process.env.DA_NAIVE_N || '1000', 10)
    const out: any = {}
    for (const set of SETS) {
      const sizes = poolSizes(set)
      let nd = 0, dd = 0
      for (let i = 0; i < NN; i++) {
        const packs = generateSealedPod([], set, 6)
        nd += naiveCount(packs, sizes, false)
        dd += naiveCount(packs, sizes, true)
      }
      out[set] = { noDedup: +(nd / NN).toFixed(3), dedup: +(dd / NN).toFixed(3) }
      console.error(`naive ${set}: noDedup=${out[set].noDedup} dedup=${out[set].dedup}`)
    }
    fs.writeFileSync('/tmp/da_naive.json', JSON.stringify(out))
    console.error('wrote /tmp/da_naive.json')
    return
  }
  // Patch naive numbers into the existing duplicateStats.json (no full rebuild needed).
  if (mode === 'mergenaive') {
    const fs = await import('fs'); const path = await import('path'); const url = await import('url')
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
    const dataPath = path.join(__dirname, '..', 'data', 'duplicateStats.json')
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
    const naive = JSON.parse(fs.readFileSync('/tmp/da_naive.json', 'utf8'))
    for (const s of Object.keys(data.sets || {})) if (naive[s]) data.sets[s].naive = naive[s]
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2))
    console.log('Merged naive into', dataPath)
    for (const s of Object.keys(data.sets)) console.log(`  ${s}: noDedup=${data.sets[s].naive?.noDedup} dedup=${data.sets[s].naive?.dedup}`)
    return
  }
  // build mode: merge simulated per-set files + DB actual, compute stats, write src/data/duplicateStats.json
  const fs = await import('fs')
  const path = await import('path')
  const url = await import('url')
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
  let actual: any = {}
  try { if (fs.existsSync('/tmp/da_actual.json')) actual = JSON.parse(fs.readFileSync('/tmp/da_actual.json', 'utf8')) } catch {}
  const out: any = {
    generatedAt: process.env.DA_DATE || '', sampleSizePerSet: N,
    metric: 'same card irrespective of variant (name+subtitle)',
    actualSource: Object.keys(actual).length ? 'opened sealed pools (DB)' : 'none', sets: {},
  }
  for (const s of SETS) {
    const p = `/tmp/da_${s}.json`
    if (!fs.existsSync(p)) { console.error(`missing ${s}`); continue }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    const sealed6 = statsFor(raw.sealed, raw.sizes, 6)
    const sealedShuffled = raw.sealedShuffled ? statsFor(raw.sealedShuffled, raw.sizes, 6) : null
    const draft3 = statsFor(raw.draft, raw.sizes, 3)
    const av = actual[s] || {}
    const naive = {
      noDedup: raw.naiveND ? +(raw.naiveND.sum / raw.naiveND.n).toFixed(3) : sealed6.naiveMean,
      dedup: raw.naiveD ? +(raw.naiveD.sum / raw.naiveD.n).toFixed(3) : null,
    }
    out.sets[s] = {
      poolSizes: raw.sizes,
      sealed6, sealedShuffled, draft3, naive,
      actual: {
        nonShuffled: actualStats(av.nonShuffled, sealed6.mean, sealed6.sd, sealed6.pods),
        shuffled: actualStats(av.shuffled, sealedShuffled ? sealedShuffled.mean : null, sealedShuffled ? sealedShuffled.sd : 0, sealedShuffled ? sealedShuffled.pods : 1),
      },
    }
  }
  const dataPath = path.join(__dirname, '..', 'data', 'duplicateStats.json')
  fs.writeFileSync(dataPath, JSON.stringify(out, null, 2))
  console.log(`Wrote ${dataPath}\n`)
  // summary table: simulated vs theory vs actual(DB)
  console.log('Set  | Simulated (95% CI)      Theory  Naive | Actual DB (n)            relDiff  verdict')
  for (const s of SETS) {
    const o = out.sets[s]; if (!o) continue
    const a = o.sealed6, ac = o.actual.nonShuffled
    const acStr = ac && ac.n >= 1
      ? `${(ac.mean ?? 0).toFixed(2)} (n=${ac.n})`.padEnd(20) + `${ac.relDiff != null ? (ac.relDiff * 100).toFixed(1) + '%' : '—'}`.padStart(7) + `  ${ac.verdict}`
      : '(no data)'
    console.log(`${s.padEnd(4)} | ${a.mean.toFixed(2)} [${a.ci95[0].toFixed(2)},${a.ci95[1].toFixed(2)}]   ${a.theoryMean.toFixed(2).padStart(5)}  ${a.naiveMean.toFixed(1).padStart(4)} | ${acStr}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
