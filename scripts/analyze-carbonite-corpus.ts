/**
 * Analyze the real carbonite pull corpus against the generator's ASSUMED weights.
 *
 * Carbonite is app-only (no physical box), so historically everything beyond the slot
 * skeleton — the C/UC/R/S/L mix in the HS run and HSF run, intra-block ordering,
 * prestige tier split, showcase rate — was a GUESS in src/utils/carboniteConstants.ts.
 * This measures a real corpus (data/real-boxes/ash-carbonite-*.csv, pull-order photos)
 * against those guesses.
 *
 * Treatment is decoded from the printed collector number (ASH ranges):
 *   Normal <=264 · Hyperspace 265-528 · Hyperspace Foil 529-766 · Showcase 767-784 · Prestige 785-925
 *
 * Rarity rank uses the ORDER OBSERVED in the real packs' collation: C < U < Special < R < L
 * (Special consistently sits just below Rare in the HS run). Change RANK if data says otherwise.
 *
 * Usage: npx tsx scripts/analyze-carbonite-corpus.ts [--dir=data/real-boxes] [--glob=ash-carbonite]
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { CARBONITE_CONSTANTS as C } from '../src/utils/carboniteConstants'

const arg = (n: string, d: string) => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d
const DIR = arg('dir', 'data/real-boxes')
const GLOB = arg('glob', 'ash-carbonite')

const RANK: Record<string, number> = { Common: 0, Uncommon: 1, Special: 2, Rare: 3, Legendary: 4 }
const RAR = ['Common', 'Uncommon', 'Rare', 'Special', 'Legendary']
const pctS = (n: number, d: number) => (d ? (n / d * 100).toFixed(1) : '0.0') + '%'
const per = (n: number, d: number) => (d ? (n / d).toFixed(2) : '0.00')

interface Row {
  pack: string; pos: number; number: number; name: string; rarity: string; type: string
  variant: string; slotRole: string; pullOrder: boolean
}

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch }
  out.push(cur); return out
}
function loadRows(): Row[] {
  const files = readdirSync(DIR).filter(f => f.startsWith(GLOB) && f.endsWith('.csv'))
  const rows: Row[] = []
  for (const f of files) {
    const lines = readFileSync(join(DIR, f), 'utf8').trim().split('\n')
    const h = splitCsv(lines[0]); const idx = (k: string) => h.indexOf(k)
    for (let i = 1; i < lines.length; i++) {
      const c = splitCsv(lines[i])
      rows.push({
        pack: `${f}#${c[idx('pack')]}`, pos: Number(c[idx('pos')]), number: Number(c[idx('number')]),
        name: c[idx('name')], rarity: c[idx('rarity')], type: c[idx('type')], variant: c[idx('variant')],
        slotRole: c[idx('slotRole')], pullOrder: (c[idx('pullOrder')] || '').toLowerCase() === 'true',
      })
    }
  }
  return rows
}
const mix = (rows: Row[]) => { const o: Record<string, number> = {}; for (const r of rows) o[r.rarity] = (o[r.rarity] || 0) + 1; return o }
function expectedBlock(fixedC: number, flexN: number, flexW: Record<string, number>, topN: number, topW: Record<string, number>) {
  const e: Record<string, number> = { Common: fixedC, Uncommon: 0, Rare: 0, Special: 0, Legendary: 0 }
  const add = (n: number, w: Record<string, number>) => { const t = Object.values(w).reduce((a, b) => a + b, 0); for (const r of RAR) e[r] += n * (w[r] || 0) / t }
  if (flexN) add(flexN, flexW); if (topN) add(topN, topW); return e
}

function main() {
  const rows = loadRows()
  const packs = [...new Set(rows.map(r => r.pack))]
  const N = packs.length
  console.log(`# Carbonite Corpus Analysis — ${N} pack(s)\n`)
  if (!N) { console.log('No fixtures.'); return }

  // ---- Structure / position ----
  console.log(`## Slot structure & positions (per pack)`)
  const posRole: Record<number, Record<string, number>> = {}
  for (const r of rows) (posRole[r.pos] = posRole[r.pos] || {})[r.slotRole] = ((posRole[r.pos] || {})[r.slotRole] || 0) + 1
  const prestPos = rows.filter(r => r.slotRole === 'prestige').map(r => r.pos)
  const prestPosMode = [...new Set(prestPos)].map(p => `${p}×${prestPos.filter(x => x === p).length}`).join(', ')
  console.log(`  prestige position: pos ${prestPosMode}  (generator emits prestige at index 1 / pos 2)`)
  console.log(`  layout: pos1 leader, pos2-9 HS, pos10 prestige, pos11-16 HSF (if uniform)\n`)

  // ---- Leader ----
  const leaders = rows.filter(r => r.slotRole === 'leader')
  const lShow = leaders.filter(r => r.variant === 'Showcase').length
  const lMix = mix(leaders)
  console.log(`## Leader (pos 1) — spec: always HS, showcase ${(C.showcaseRate.law * 100).toFixed(2)}%`)
  console.log(`  n=${leaders.length} · showcase ${lShow} (${pctS(lShow, leaders.length)}) · rarity ${RAR.map(r => `${r[0]}:${lMix[r] || 0}`).join(' ')}\n`)

  // ---- HS block (pos 2-9) ----
  const hs = rows.filter(r => r.slotRole === 'hs')
  const hsExp = expectedBlock(C.law.hsCommon, C.law.hsFlex, C.hsFlexWeights, C.law.hsTop, C.hsTopWeights)
  const hsObs = mix(hs)
  console.log(`## HS block (pos 2-9, ${C.law.hsCommon + C.law.hsFlex + C.law.hsTop} cards) — spec 4 fixed-C + 3 flex + 1 top`)
  console.log(`  rarity      observed/pack   spec/pack`)
  for (const r of RAR) console.log(`  ${r.padEnd(10)} ${per(hsObs[r] || 0, N).padStart(6)} (${pctS(hsObs[r] || 0, hs.length).padStart(5)})   ${hsExp[r].toFixed(2)}`)
  // non-common count distribution per pack
  const hsNonC: Record<number, number> = {}
  for (const p of packs) { const nc = hs.filter(r => r.pack === p && r.rarity !== 'Common').length; hsNonC[nc] = (hsNonC[nc] || 0) + 1 }
  console.log(`  non-common count/pack: ${Object.entries(hsNonC).sort().map(([k, v]) => `${k}→${v}pk`).join('  ')}`)
  // top slot = pos 9
  const top = rows.filter(r => r.pos === 9)
  console.log(`  TOP slot (pos 9) rarity: ${RAR.map(r => `${r[0]}:${top.filter(t => t.rarity === r).length}`).join(' ')}  (spec top = R60/S20/L20)\n`)

  // ---- Prestige (pos 10) ----
  const prestige = rows.filter(r => r.slotRole === 'prestige')
  const tierOf = (v: string) => v === 'Standard Prestige' ? 'tier1' : v === 'Foil Prestige' ? 'tier2' : v === 'Serialized Prestige' ? 'serialized' : '?'
  const tiers: Record<string, number> = {}; for (const p of prestige) tiers[tierOf(p.variant)] = (tiers[tierOf(p.variant)] || 0) + 1
  const pMix = mix(prestige); const pLeader = prestige.filter(p => p.type === 'Leader').length
  console.log(`## Prestige (pos 10) — spec tiers ${C.prestigeTierWeights.tier1}/${C.prestigeTierWeights.tier2}/${C.prestigeTierWeights.serialized}`)
  console.log(`  tiers: Standard ${tiers.tier1 || 0} (${pctS(tiers.tier1 || 0, prestige.length)}) · Foil ${tiers.tier2 || 0} (${pctS(tiers.tier2 || 0, prestige.length)}) · Serialized ${tiers.serialized || 0} (${pctS(tiers.serialized || 0, prestige.length)})`)
  console.log(`  rarity: ${RAR.map(r => `${r[0]}:${pMix[r] || 0}`).join(' ')} · leader-type: ${pLeader} (generator draws NON-leader prestige pool)\n`)

  // ---- HSF block (pos 11-16) ----
  const hsf = rows.filter(r => r.slotRole === 'hsf')
  const hsfExp = expectedBlock(C.law.hsfCommon, C.law.hsfFlex, C.hsfFlexWeights, 0, {})
  const hsfObs = mix(hsf); const hsfReal = hsf.filter(r => r.variant === 'Hyperspace Foil').length
  console.log(`## HSF block (pos 11-16, ${C.law.hsfCommon + C.law.hsfFlex} cards) — spec 2 fixed-C + 4 flex`)
  console.log(`  rarity      observed/pack   spec/pack`)
  for (const r of RAR) console.log(`  ${r.padEnd(10)} ${per(hsfObs[r] || 0, N).padStart(6)} (${pctS(hsfObs[r] || 0, hsf.length).padStart(5)})   ${hsfExp[r].toFixed(2)}`)
  const hsfTop = rows.filter(r => r.pos === 11)
  console.log(`  first HSF (pos 11) rarity: ${RAR.map(r => `${r[0]}:${hsfTop.filter(t => t.rarity === r).length}`).join(' ')} (never Common ⇒ a guaranteed ≥U slot)`)
  console.log(`  real 'Hyperspace Foil' variant: ${hsfReal}/${hsf.length}\n`)

  // ---- Ordering (pull-order packs) ----
  const ordered = packs.filter(p => rows.some(r => r.pack === p && r.pullOrder))
  console.log(`## Intra-block rarity ordering — ${ordered.length} pull-order packs (rank C<U<S<R<L)`)
  const run = (p: string, role: string) => rows.filter(r => r.pack === p && r.slotRole === role).sort((a, b) => a.pos - b.pos).map(r => RANK[r.rarity])
  let hsAsc = 0, hsDesc = 0, hsMax9 = 0, hsfAsc = 0, hsfDesc = 0, hsfMax11 = 0
  for (const p of ordered) {
    const h = run(p, 'hs')
    if (h.every((v, i) => i === 0 || v >= h[i - 1])) hsAsc++
    if (h.every((v, i) => i === 0 || v <= h[i - 1])) hsDesc++
    if (h.length && h.indexOf(Math.max(...h)) === h.length - 1) hsMax9++
    const f = run(p, 'hsf')
    if (f.every((v, i) => i === 0 || v >= f[i - 1])) hsfAsc++
    if (f.every((v, i) => i === 0 || v <= f[i - 1])) hsfDesc++
    if (f.length && f.indexOf(Math.max(...f)) === 0) hsfMax11++
  }
  console.log(`  HS run:  ascending ${hsAsc}/${ordered.length} · descending ${hsDesc}/${ordered.length} · rarest-is-last ${hsMax9}/${ordered.length}`)
  console.log(`  HSF run: ascending ${hsfAsc}/${ordered.length} · descending ${hsfDesc}/${ordered.length} · rarest-is-first ${hsfMax11}/${ordered.length}`)
  console.log(`  ⇒ HS ascends to its R/L top at pos 9; HSF descends from an elevated card at pos 11.`)
  console.log(`     The "hits" (HS-top pos9, Prestige pos10, HSF-top pos11) cluster in the middle.\n`)
}

main()
