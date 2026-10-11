/**
 * Printing-strip alignment: do hyperspace and hyperspace-foil commons sit at a
 * structured distance from their normal copies? See plans/PRINTING_STRIP_ALIGNMENT_PLAN.md.
 *
 * 1. Measures, for the real ASH boxes and for the generator:
 *    - kit-hit: how often a printed common lands in a six-pack kit that holds a
 *      normal copy of the same card;
 *    - the line-distance profile of its normal copies (line = press order,
 *      box positions mapped back through stackBoxOrder).
 * 2. Fits a shared-plate model per slot: with probability p the printed common
 *    is a copy of a normal common printed k line packs away (a lagged hopper on
 *    the same plate); otherwise it is independent, as the generator is today.
 *    The fit runs on a continuous simulated press line — persistent belts, box
 *    after box — so a lag can reach across a box boundary.
 *
 * Real data: boxes with all 24 packs. The title-read boxes (008-011) count:
 * their pos 7 (hyperspace common) and pos 12 (hyperspace foil) printings are
 * fixed by slot and recorded, and every other common is a normal.
 *
 * Usage: npx tsx scripts/analyze-strip-alignment.ts [--boxes=400]
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { initializeCardCache } from '../src/utils/cardCache'
import { clearBeltCache, generateSealedPod } from '../src/utils/boosterPack'
import { parseCsv, realBoxFiles, REAL_BOX_DIR } from '../src/qa/comps/realKits'
import { seededRng } from '../src/qa/comps/competitors'

const arg = (name: string, dflt: string) =>
  (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt
const SIM_BOXES = Number(arg('boxes', '400'))
const MAX_D = 16

type Slot = 'HS' | 'HSF'
/** One pack in LINE order: normal common ids, and the printed commons by slot. */
interface Pack { normals: string[], printed: Partial<Record<Slot, string>> }
type Line = Pack[]   // 24 packs of one box, line order

/** Box position (1-24) → line index (0-23), the inverse of stackBoxOrder. */
const lineOf = (p: number) => (p <= 12 ? 2 * (12 - p) + 1 : 2 * (24 - p) + 2) - 1
/** Line index (0-23) → six-pack kit index in box order (positions 1-6 → 0, …). */
const kitOfLine: number[] = Array.from({ length: 24 }, (_, l) => {
  const pos = Array.from({ length: 24 }, (_, i) => i + 1).find(p => lineOf(p) === l)!
  return Math.floor((pos - 1) / 6)
})

function realLines(): Line[] {
  const out: Line[] = []
  for (const f of realBoxFiles()) {
    const rows = parseCsv(readFileSync(join(REAL_BOX_DIR, f), 'utf8'))
    const packs: Line = Array.from({ length: 24 }, () => ({ normals: [], printed: {} }))
    const seen = new Set<number>()
    for (const r of rows) {
      const pos = +r.pack!
      if (!pos || r.rarity !== 'Common' || r.type === 'Leader' || r.type === 'Base') continue
      seen.add(pos)
      const id = `${r.name}|${r.subtitle || ''}`
      const pack = packs[lineOf(pos)]!
      const variant = r.variant === 'Unverified' ? 'Normal' : r.variant
      if (variant === 'Hyperspace' && r.pos === '7') pack.printed.HS = id
      else if (variant === 'Hyperspace Foil') pack.printed.HSF = id
      else if (variant === 'Normal') pack.normals.push(id)
    }
    if (seen.size === 24) out.push(packs)
  }
  return out
}

/** A continuous press line: persistent belts, boxes cut one after another, un-stacked. */
function simLines(boxes: number): Line[] {
  clearBeltCache()
  const out: Line[] = []
  for (let b = 0; b < boxes; b++) {
    const box = [...generateSealedPod([], 'ASH', 12), ...generateSealedPod([], 'ASH', 12)]
    const packs: Line = Array.from({ length: 24 }, () => ({ normals: [], printed: {} }))
    box.forEach((p, i) => {
      const pack = packs[lineOf(i + 1)]!
      p.cards.forEach((c, slot) => {
        if (c.rarity !== 'Common' || c.isLeader || c.isBase) return
        const id = `${c.name}|${c.subtitle || ''}`
        const v = c.variantType || 'Normal'
        if (slot === 6 && v === 'Hyperspace') pack.printed.HS = id
        else if (slot === 11 && v === 'Hyperspace Foil') pack.printed.HSF = id
        else if (v === 'Normal') pack.normals.push(id)
      })
    })
    out.push(packs)
  }
  return out
}

interface Stats { n: number, kitHits: number, dist: number[] }

function measure(lines: Line[], slot: Slot): Stats {
  const s: Stats = { n: 0, kitHits: 0, dist: Array(MAX_D + 1).fill(0) }
  for (const line of lines) {
    line.forEach((pack, l) => {
      const id = pack.printed[slot]
      if (!id) return
      s.n++
      let hit = false
      line.forEach((other, m) => {
        const copies = other.normals.filter(x => x === id).length
        if (!copies) return
        const d = Math.abs(m - l)
        if (d <= MAX_D) s.dist[d]! += copies
        if (kitOfLine[m] === kitOfLine[l]) hit = true
      })
      if (hit) s.kitHits++
    })
  }
  return s
}

/** Rebuild one slot's printed commons under the shared-plate model (p, k) on the continuous line. */
function apply(lines: Line[], slot: Slot, p: number, k: number, seed: number): Line[] {
  const rng = seededRng(seed)
  const flat = lines.flat()
  const rebuilt = flat.map(pack => ({ normals: pack.normals, printed: { ...pack.printed } }))
  rebuilt.forEach((pack, i) => {
    if (!pack.printed[slot] || rng() >= p) return
    const src = flat[i - k]
    if (!src || !src.normals.length) return
    pack.printed[slot] = src.normals[Math.floor(rng() * src.normals.length)]!
  })
  const out: Line[] = []
  for (let b = 0; b < lines.length; b++) out.push(rebuilt.slice(b * 24, b * 24 + 24))
  return out
}

/** Poisson deviance of the real distance profile + binomial deviance of kit-hit. */
function deviance(real: Stats, model: Stats): number {
  let dev = 0
  for (let d = 0; d <= MAX_D; d++) {
    const o = real.dist[d]!, e = Math.max(1e-9, (model.dist[d]! / model.n) * real.n)
    dev += 2 * (o > 0 ? o * Math.log(o / e) - (o - e) : e)
  }
  const pm = Math.min(1 - 1e-9, Math.max(1e-9, model.kitHits / model.n))
  const o1 = real.kitHits, o0 = real.n - real.kitHits
  const e1 = pm * real.n, e0 = (1 - pm) * real.n
  dev += 2 * ((o1 ? o1 * Math.log(o1 / e1) : 0) + (o0 ? o0 * Math.log(o0 / e0) : 0))
  return dev
}

/** Repeated common identities per six-pack kit (normals + printed commons). */
function commonRepeatsPerKit(lines: Line[]): number {
  let total = 0, kits = 0
  for (const line of lines) {
    for (let k = 0; k < 4; k++) {
      const counts = new Map<string, number>()
      line.forEach((pack, l) => {
        if (kitOfLine[l] !== k) return
        for (const id of [...pack.normals, ...Object.values(pack.printed)]) counts.set(id!, (counts.get(id!) || 0) + 1)
      })
      total += [...counts.values()].filter(n => n > 1).length
      kits++
    }
  }
  return total / kits
}

async function main() {
  await initializeCardCache()
  const real = realLines()
  console.log(`Real: ${real.length} complete boxes · simulating ${SIM_BOXES} boxes on a continuous line…`)
  const sim = simLines(SIM_BOXES)

  const best: Partial<Record<Slot, { p: number, k: number }>> = {}
  for (const slot of ['HS', 'HSF'] as Slot[]) {
    const r = measure(real, slot)
    const base = measure(sim, slot)
    const d0 = deviance(r, base)
    console.log(`\n=== ${slot === 'HS' ? 'Hyperspace common (pos 7)' : 'Hyperspace-foil commons (pos 12)'} — real n ${r.n}`)
    console.log(`independent (today): kit-hit ${(100 * base.kitHits / base.n).toFixed(1)}% vs real ${(100 * r.kitHits / r.n).toFixed(1)}% · deviance ${d0.toFixed(1)}`)

    const fits: Array<{ p: number, k: number, dev: number, hit: number }> = []
    for (let k = -23; k <= 23; k++) {
      if (k === 0) continue
      for (const p of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]) {
        const m = measure(apply(sim, slot, p, k, 1000 + k * 13 + Math.round(p * 100)), slot)
        fits.push({ p, k, dev: deviance(r, m), hit: m.kitHits / m.n })
      }
    }
    fits.sort((a, b) => a.dev - b.dev)
    console.log('best shared-plate fits (p = share copied from k line packs away):')
    for (const f of fits.slice(0, 6)) {
      console.log(`  k ${String(f.k).padStart(3)}  p ${f.p.toFixed(1)}  kit-hit ${(100 * f.hit).toFixed(1)}%  deviance ${f.dev.toFixed(1)}  (Δ vs independent ${(f.dev - d0).toFixed(1)})`)
    }
    const byParity = (odd: boolean) => fits.filter(f => (Math.abs(f.k) % 2 === 1) === odd)[0]!
    const o = byParity(true), e = byParity(false)
    console.log(`best odd lag  k ${o.k} p ${o.p} deviance ${o.dev.toFixed(1)} · best even lag k ${e.k} p ${e.p} deviance ${e.dev.toFixed(1)}`)
    best[slot] = { p: fits[0]!.p, k: fits[0]!.k }
  }

  // Out-of-sample check: the fit used distances 0-${MAX_D}. A copy-from-~20-packs
  // model predicts EXTRA normal copies at 17-23 in the real boxes.
  const far = (lines: Line[], slot: Slot) => {
    let n = 0, c = 0
    for (const line of lines) line.forEach((pack, l) => {
      const id = pack.printed[slot]; if (!id) return
      n++
      line.forEach((o, m) => { const d = Math.abs(m - l); if (d > MAX_D) c += o.normals.filter(x => x === id).length })
    })
    return c / n
  }
  console.log('\n=== Out of sample: normal copies 17-23 line packs away, per printed common')
  for (const slot of ['HS', 'HSF'] as Slot[]) {
    const fit = apply(sim, slot, best[slot]!.p, best[slot]!.k, 9)
    console.log(`${slot.padEnd(4)} real ${far(real, slot).toFixed(3)} · today ${far(sim, slot).toFixed(3)} · fitted model ${far(fit, slot).toFixed(3)}`)
  }

  const both = apply(apply(sim, 'HS', best.HS!.p, best.HS!.k, 7), 'HSF', best.HSF!.p, best.HSF!.k, 8)
  console.log('\n=== Repeated commons per six-pack kit')
  console.log(`real ${commonRepeatsPerKit(real).toFixed(2)} (n ${real.length * 4} kits) · today ${commonRepeatsPerKit(sim).toFixed(2)} · with both fits ${commonRepeatsPerKit(both).toFixed(2)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
