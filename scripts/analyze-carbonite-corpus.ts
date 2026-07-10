/**
 * Analyze the real carbonite pull corpus against the generator's ASSUMED weights.
 *
 * Carbonite has no physical product to transcribe from a box, but real pulls
 * (Chaos Sealed/Draft opens, or representative pulls) can be logged slot-by-slot in
 * data/real-boxes/ash-carbonite-*.csv. Everything beyond the basic slot skeleton
 * (flex/top rarity weights, prestige tier split, showcase rate, leader-in-prestige)
 * is currently a GUESS in src/utils/carboniteConstants.ts — this script measures the
 * corpus against those guesses so they can be retuned against reality.
 *
 * Treatment is decoded from the printed collector number (ASH ranges):
 *   Normal <=264 · Hyperspace 265-528 · Hyperspace Foil 529-766 · Showcase 767-784 · Prestige 785-925
 *
 * Usage: npx tsx scripts/analyze-carbonite-corpus.ts [--dir=data/real-boxes] [--glob=ash-carbonite]
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { CARBONITE_CONSTANTS as C } from '../src/utils/carboniteConstants'

const arg = (n: string, d: string) => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d
const DIR = arg('dir', 'data/real-boxes')
const GLOB = arg('glob', 'ash-carbonite')

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Special', 'Legendary']
const rank = (r: string) => { const i = RARITY_ORDER.indexOf(r); return i < 0 ? 99 : i }
const pctS = (n: number, d: number) => (d ? (n / d * 100).toFixed(1) : '0.0') + '%'

interface Row {
  pack: string; pos: number; number: number; name: string; subtitle: string
  rarity: string; type: string; variant: string; slotRole: string; pullOrder: boolean; note: string
}

// quote-aware CSV line split
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out
}

function loadRows(): Row[] {
  const files = readdirSync(DIR).filter(f => f.startsWith(GLOB) && f.endsWith('.csv'))
  const rows: Row[] = []
  for (const f of files) {
    const lines = readFileSync(join(DIR, f), 'utf8').trim().split('\n')
    const header = splitCsv(lines[0])
    const idx = (k: string) => header.indexOf(k)
    for (let i = 1; i < lines.length; i++) {
      const c = splitCsv(lines[i])
      rows.push({
        pack: `${f}#${c[idx('pack')]}`,
        pos: Number(c[idx('pos')]),
        number: Number(c[idx('number')]),
        name: c[idx('name')], subtitle: c[idx('subtitle')] || '',
        rarity: c[idx('rarity')], type: c[idx('type')], variant: c[idx('variant')],
        slotRole: c[idx('slotRole')], pullOrder: (c[idx('pullOrder')] || '').toLowerCase() === 'true',
        note: c[idx('note')] || '',
      })
    }
  }
  return rows
}

function mix(rows: Row[]): Record<string, number> {
  const o: Record<string, number> = {}
  for (const r of rows) o[r.rarity] = (o[r.rarity] || 0) + 1
  return o
}

// Expected per-pack rarity counts for a block = fixed(Common) + flex*weights + top*weights
function expectedBlock(fixedC: number, flexN: number, flexW: Record<string, number>, topN: number, topW: Record<string, number>) {
  const exp: Record<string, number> = { Common: fixedC, Uncommon: 0, Rare: 0, Special: 0, Legendary: 0 }
  const add = (n: number, w: Record<string, number>) => {
    const tot = Object.values(w).reduce((a, b) => a + b, 0)
    for (const r of RARITY_ORDER) exp[r] += n * (w[r] || 0) / tot
  }
  if (flexN) add(flexN, flexW)
  if (topN) add(topN, topW)
  return exp
}

function main() {
  const rows = loadRows()
  const packs = [...new Set(rows.map(r => r.pack))]
  const N = packs.length
  console.log(`# Carbonite Corpus Analysis — ${N} pack(s) from ${DIR}/${GLOB}-*.csv\n`)
  if (!N) { console.log('No fixtures found.'); return }

  // --- Leader ---
  const leaders = rows.filter(r => r.slotRole === 'leader')
  const showcase = leaders.filter(r => r.variant === 'Showcase').length
  const hsLead = leaders.filter(r => r.variant === 'Hyperspace').length
  console.log(`## Leader (spec: always HS, showcase ${(C.showcaseRate.law * 100).toFixed(2)}%)`)
  console.log(`  n=${leaders.length} · Hyperspace ${hsLead} · Showcase ${showcase} → showcase ${pctS(showcase, leaders.length)}\n`)

  // --- Prestige ---
  const prestige = rows.filter(r => r.slotRole === 'prestige')
  const tierOf = (v: string) => v === 'Standard Prestige' ? 'tier1' : v === 'Foil Prestige' ? 'tier2' : v === 'Serialized Prestige' ? 'serialized' : '?'
  const tiers: Record<string, number> = {}
  for (const p of prestige) tiers[tierOf(p.variant)] = (tiers[tierOf(p.variant)] || 0) + 1
  const leaderPrestige = prestige.filter(p => p.type === 'Leader').length
  const pw = C.prestigeTierWeights
  console.log(`## Prestige (spec tiers ${pw.tier1}/${pw.tier2}/${pw.serialized}; generator draws from NON-leader pool only)`)
  console.log(`  n=${prestige.length} · tier1 ${pctS(tiers.tier1 || 0, prestige.length)} · tier2 ${pctS(tiers.tier2 || 0, prestige.length)} · serialized ${pctS(tiers.serialized || 0, prestige.length)}`)
  console.log(`  LEADER prestiges: ${leaderPrestige}/${prestige.length} ${leaderPrestige ? '⚠️ generator can NEVER produce these (CarbonitePrestigeBelt filters !isLeader)' : ''}\n`)

  // --- HS block ---
  const hs = rows.filter(r => r.slotRole === 'hs')
  const hsExp = expectedBlock(C.law.hsCommon, C.law.hsFlex, C.hsFlexWeights, C.law.hsTop, C.hsTopWeights)
  const hsObs = mix(hs)
  console.log(`## HS block (spec ${C.law.hsCommon}×fixed-C + ${C.law.hsFlex}×flex + ${C.law.hsTop}×top, per pack)`)
  for (const r of RARITY_ORDER) {
    const obsPer = (hsObs[r] || 0) / N
    console.log(`  ${r.padEnd(10)} observed ${obsPer.toFixed(2)}/pack (${pctS(hsObs[r] || 0, hs.length)})  vs spec ${hsExp[r].toFixed(2)}/pack`)
  }

  // --- HSF block ---
  const hsf = rows.filter(r => r.slotRole === 'hsf')
  const hsfExp = expectedBlock(C.law.hsfCommon, C.law.hsfFlex, C.hsfFlexWeights, 0, {})
  const hsfObs = mix(hsf)
  const hsfRealVariant = hsf.filter(r => r.variant === 'Hyperspace Foil').length
  console.log(`\n## HSF block (spec ${C.law.hsfCommon}×fixed-C + ${C.law.hsfFlex}×flex, per pack)`)
  for (const r of RARITY_ORDER) {
    const obsPer = (hsfObs[r] || 0) / N
    console.log(`  ${r.padEnd(10)} observed ${obsPer.toFixed(2)}/pack (${pctS(hsfObs[r] || 0, hsf.length)})  vs spec ${hsfExp[r].toFixed(2)}/pack`)
  }
  console.log(`  real 'Hyperspace Foil' variant: ${hsfRealVariant}/${hsf.length} ${hsfRealVariant === hsf.length ? '(all real HSF printings — supports OPEN-1 reading (b))' : ''}`)

  // --- Order analysis (pull-order packs only) ---
  const orderedPacks = packs.filter(p => rows.some(r => r.pack === p && r.pullOrder))
  console.log(`\n## Intra-block rarity ordering (pull-order packs only)`)
  if (!orderedPacks.length) {
    console.log(`  0 pull-order packs. Need photos laid in EXACT pull order to test the ascending/descending-rarity-run hypothesis.`)
  } else {
    const check = (role: string) => {
      let asc = 0, desc = 0, flat = 0, mixed = 0, numAsc = 0, numDesc = 0
      for (const p of orderedPacks) {
        const seq = rows.filter(r => r.pack === p && r.slotRole === role).sort((a, b) => a.pos - b.pos)
        const rk = seq.map(r => rank(r.rarity))
        const nn = seq.map(r => r.number)
        const nonDec = rk.every((v, i) => i === 0 || v >= rk[i - 1])
        const nonInc = rk.every((v, i) => i === 0 || v <= rk[i - 1])
        if (nonDec && nonInc) flat++; else if (nonDec) asc++; else if (nonInc) desc++; else mixed++
        if (nn.every((v, i) => i === 0 || v >= nn[i - 1])) numAsc++
        if (nn.every((v, i) => i === 0 || v <= nn[i - 1])) numDesc++
      }
      console.log(`  ${role.toUpperCase()} run over ${orderedPacks.length} packs — rarity: asc ${asc} · desc ${desc} · flat ${flat} · mixed ${mixed} | number: asc ${numAsc} · desc ${numDesc}`)
    }
    check('hs'); check('hsf')
  }
  console.log('')
}

main()
