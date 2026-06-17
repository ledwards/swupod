// @ts-nocheck
// Duplicate = SAME CARD irrespective of variant (normal/foil/hyperspace/prestige/showcase
// all collapse to one identity). Keyed on name+subtitle (consistent across sets).
// Usage:
//   tsx _dupSim2.ts <N> dump <SET>   -> print example pods with explicit duplicate groups
//   tsx _dupSim2.ts <N> run  <SET>   -> JSON of sealed + draft duplicate stats for one set
//   tsx _dupSim2.ts <N> fmt          -> format /tmp/d2_<SET>.json into tables
import { generateSealedPod, generateSealedBox } from '../utils/boosterPack'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'

const N = parseInt(process.argv[2] || '2000', 10)
const SETS = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH']

const gameId = (c: any) => (c.name || c.cardId || c.id) + '|' + (c.subtitle || '')
const vtag = (c: any) => {
  const t = c.variantType || ''
  if (c.isPrestige || /Prestige/i.test(t)) return 'Prestige'
  if (c.isShowcase || /Showcase/i.test(t)) return 'Showcase'
  if (c.isFoil && c.isHyperspace) return 'HyperspaceFoil'
  if (c.isHyperspace) return 'Hyperspace'
  if (c.isFoil) return 'Foil'
  return 'Normal'
}
const catOf = (c: any) => (c.isLeader || c.type === 'Leader') ? 'Leader' : (c.isBase || c.type === 'Base') ? 'Base' : (c.rarity || '?')
const flat = (packs: any[]) => packs.flatMap(p => p.cards)
function pickK(n: number, k: number) {
  const idx = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[idx[i], idx[j]] = [idx[j], idx[i]] }
  return idx.slice(0, k)
}

function podDupGroups(cards: any[]) {
  const g = new Map<string, any[]>()
  for (const c of cards) { const k = gameId(c); if (!g.has(k)) g.set(k, []); g.get(k)!.push(c) }
  const dups: any[][] = []
  for (const arr of g.values()) if (arr.length >= 2) dups.push(arr)
  return dups
}
function accStats() { return { pods: 0, dupSets: 0, excess: 0, sq: 0, dist: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pair: {} as any, byCat: {} as any } }
function recordPod(a: any, cards: any[]) {
  const dups = podDupGroups(cards)
  a.pods++; a.dupSets += dups.length
  let ex = 0
  for (const arr of dups) {
    ex += arr.length - 1
    const combo = arr.map(vtag).sort().join(' + ')
    a.pair[combo] = (a.pair[combo] || 0) + 1
    const cat = catOf(arr[0]); a.byCat[cat] = (a.byCat[cat] || 0) + 1
  }
  a.excess += ex
  a.sq += dups.length * dups.length
  a.dist[Math.min(dups.length, 10)]++
}
const mean = (a: any, f: string) => a[f] / a.pods

function runSet(set: string) {
  const sealed = accStats(), draft = accStats()
  for (let i = 0; i < N; i++) recordPod(sealed, flat(generateSealedPod([], set, 6)))
  const BOX = Math.max(150, Math.floor(N / 5))
  for (let b = 0; b < BOX; b++) {
    const box = generateSealedBox([], set, 24)
    for (let t = 0; t < 25; t++) recordPod(draft, pickK(24, 3).flatMap(ix => box[ix].cards))
  }
  return { sealed, draft }
}

async function main() {
  const mode = process.argv[3]
  if (mode === 'dump') {
    await initializeCardCache()
    const set = process.argv[4] || 'LAW'
    for (let p = 0; p < 2; p++) {
      const cards = flat(generateSealedPod([], set, 6))
      const dups = podDupGroups(cards).sort((x, y) => y.length - x.length)
      console.log(`\n===== ${set} sealed 6-pack pod #${p + 1}: ${cards.length} cards, ${dups.length} duplicated cards (irrespective of variant) =====`)
      for (const arr of dups) {
        const name = (arr[0].name || arr[0].cardId)
        const cat = catOf(arr[0])
        console.log(`  • ${name} [${cat}] x${arr.length}: ` + arr.map(c => vtag(c)).join(' + '))
      }
    }
    return
  }
  if (mode === 'run') {
    await initializeCardCache()
    const set = process.argv[4]
    const t = Date.now()
    const r = runSet(set)
    console.error(`[${((Date.now() - t) / 1000).toFixed(1)}s] ${set} done`)
    process.stdout.write(JSON.stringify({ set, ...r }))
    return
  }
  // fmt
  const fs = await import('fs')
  const R: any = {}
  for (const s of SETS) { const p = `/tmp/d2_${s}.json`; if (fs.existsSync(p)) { try { R[s] = JSON.parse(fs.readFileSync(p, 'utf8')) } catch {} } }
  const f = (x: number) => x.toFixed(2)
  console.log('\n===== DUPLICATES PER POOL — same card, ANY variant (normal/foil/HS/prestige/showcase merged) =====')
  console.log('Set  | SEALED 6-pack: dupSets  excess  P(0)   P(>=5) | DRAFT 3-pack: dupSets  excess')
  for (const s of SETS) { const o = R[s]; if (!o) continue; const a = o.sealed, d = o.draft
    const p0 = (a.dist[0] / a.pods * 100).toFixed(0), p5 = ((a.dist.slice(5).reduce((x: number, y: number) => x + y, 0)) / a.pods * 100).toFixed(0)
    console.log(`${s.padEnd(4)} | ${f(mean(a, 'dupSets')).padStart(13)}  ${f(mean(a, 'excess')).padStart(5)}  ${(p0 + '%').padStart(4)}  ${(p5 + '%').padStart(5)}  | ${f(mean(d, 'dupSets')).padStart(11)}  ${f(mean(d, 'excess')).padStart(5)}`)
  }
  console.log('\n===== SEALED 6-pack: duplicated cards by category (per pod avg) =====')
  console.log('Set  | Leader  Base   Common  Uncommon  Rare   Legendary  Special')
  for (const s of SETS) { const a = R[s]?.sealed; if (!a) continue; const g = (k: string) => f((a.byCat[k] || 0) / a.pods).padStart(6)
    console.log(`${s.padEnd(4)} | ${g('Leader')}  ${g('Base')}  ${g('Common')}  ${g('Uncommon').padStart(8)}  ${g('Rare')}  ${g('Legendary').padStart(9)}  ${g('Special')}`)
  }
  console.log('\n===== SEALED 6-pack: what variant pairing causes each duplicate (per pod avg) =====')
  const combos = new Set<string>()
  for (const s of SETS) if (R[s]) for (const k of Object.keys(R[s].sealed.pair)) combos.add(k)
  const order = [...combos].sort((x, y) => {
    const tot = (k: string) => SETS.reduce((acc, s) => acc + (R[s]?.sealed.pair[k] || 0), 0)
    return tot(y) - tot(x)
  }).slice(0, 8)
  console.log('Set  | ' + order.map(c => c.length > 16 ? c.slice(0, 16) : c).map(c => c.padStart(17)).join(' '))
  for (const s of SETS) { const a = R[s]?.sealed; if (!a) continue
    console.log(`${s.padEnd(4)} | ` + order.map(c => f((a.pair[c] || 0) / a.pods).padStart(17)).join(' '))
  }
  const any = SETS.find(s => R[s]); console.log(`\n(N=${any ? R[any].sealed.pods : 0} sealed pods, draft=${any ? R[any].draft.pods : 0} samples)`)
}
main().catch(e => { console.error(e); process.exit(1) })
