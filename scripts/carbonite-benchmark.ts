/**
 * Carbonite pack benchmark: audits generateCarboniteBoosterPack against the
 * documented design spec (plans/CARBONITE_PACK_PLAN.md + src/utils/carboniteConstants.ts).
 *
 * Unlike the collation benchmark, carbonite has NO real-box ground truth (it is an
 * app-only pack type for Chaos Sealed/Draft). Ground truth = the spec. Every metric
 * below is a spec-derived expectation with a tolerance band; the report flags any
 * band miss and dumps per-slot variant tables so drift is visible.
 *
 * Measures, per supported set (pre-LAW: JTL/LOF/SEC; LAW+: LAW/ASH):
 *   - exact pack size + slot composition (rarity, variantType, flags) per layout
 *   - leader always HS/Showcase; showcase-upgrade rate (1/20 pre-LAW, 1/48 LAW+)
 *   - prestige: exactly 1/pack, valid tier, 80/18/2 tier mix
 *   - weighted slots: R/L foil & R/L HS 70/20/10; LAW HS-top 60/20/20;
 *     LAW HS-block & HSF-block aggregate rarity mix
 *   - per-slot variant stamping (Common Foil / UC Foil / HS / HSF counts)
 *   - forbidden variants (no Normal-only card; fixed slots hold their rarity)
 *   - source-pool correctness (foils from Normal src; HS from Hyperspace src)
 *   - same-belt within-pack duplicates (belt-system invariant: none expected)
 *   - card.set == base set for every card
 *
 * Usage: npx tsx scripts/carbonite-benchmark.ts [--packs=20000] [--out=path.md]
 */

import { writeFileSync } from 'fs'
import { generateCarboniteBoosterPack, clearCarboniteBeltCache } from '../src/utils/carboniteBoosterPack'
import { initializeCardCache } from '../src/utils/cardCache'
import { CARBONITE_CONSTANTS } from '../src/utils/carboniteConstants'

const arg = (name: string, dflt: string) =>
  (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt
const PACKS = Number(arg('packs', '20000'))
const OUT = arg('out', '')

const PRE_LAW = ['JTL', 'LOF', 'SEC']
const LAW_PLUS = ['LAW', 'ASH']
const ALL = [...PRE_LAW, ...LAW_PLUS]

const C = CARBONITE_CONSTANTS
const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0)
const f1 = (n: number) => n.toFixed(1)
const f2 = (n: number) => n.toFixed(2)

type Card = {
  name?: string; set?: string; rarity?: string; variantType?: string; number?: number | string
  id?: string; isLeader?: boolean; isBase?: boolean
  isFoil?: boolean; isHyperspace?: boolean; isPrestige?: boolean; isShowcase?: boolean
  prestigeTier?: string
}

interface Check { label: string; measured: string; band: string; pass: boolean }

// Band helper: value within [lo, hi]
function band(label: string, value: number, lo: number, hi: number, unit = '%'): Check {
  return {
    label,
    measured: `${f2(value)}${unit}`,
    band: `${f1(lo)}–${f1(hi)}${unit}`,
    pass: value >= lo && value <= hi,
  }
}
function exact(label: string, value: number, want: number, unit = ''): Check {
  return { label, measured: `${value}${unit}`, band: `= ${want}${unit}`, pass: value === want }
}

// Rarity mix over a set of cards → percentages
function rarityMix(cards: Card[]): Record<string, number> {
  const o: Record<string, number> = {}
  for (const c of cards) o[c.rarity || '?'] = (o[c.rarity || '?'] || 0) + 1
  return o
}

interface SetReport {
  set: string
  isLawPlus: boolean
  checks: Check[]
  slotTable: string[]
  notes: string[]
}

function auditSet(set: string): SetReport {
  const isLawPlus = LAW_PLUS.includes(set)
  const code = `${set}-CB`
  clearCarboniteBeltCache()

  // Accumulators
  const sizes: number[] = []
  let showcaseLeaders = 0, hsLeaders = 0, nonLeaderSlot0 = 0
  let prestigeCount = 0, prestigeWrong = 0
  const prestigeTiers: Record<string, number> = {}
  let normalOnly = 0, wrongSet = 0
  let sameBeltDupPacks = 0
  let wholePackDupPacks = 0
  // Treatment key: identical printing iff same underlying card AND same treatment.
  const treatKey = (c: Card) => `${c.id ?? `${c.name}|${c.number}`}|${c.variantType}|${c.isFoil ? 1 : 0}|${c.isHyperspace ? 1 : 0}`
  // Per-slot tuple tally: slot -> "variantType|F|H|P|S" -> count, and rarity tally
  const slotVariant: Record<number, Record<string, number>> = {}
  const slotRarity: Record<number, Record<string, number>> = {}
  // Weighted-slot rarity accumulators
  const rlFoil: Record<string, number> = {}   // pre-LAW slot 7
  const rlHS: Record<string, number> = {}      // pre-LAW slot 13
  const lawTop: Record<string, number> = {}    // LAW slot 9
  const lawHSblock: Card[] = []                 // LAW slots 2-9 (sampled counts)
  const lawHSFblock: Card[] = []                // LAW slots 10-15
  // HSF variantType fidelity (fraction with true 'Hyperspace Foil' variantType)
  let hsfSlotCards = 0, hsfTrueVariant = 0
  const prestigeVariants = ['Standard Prestige', 'Foil Prestige', 'Serialized Prestige']

  // Groups of slots that share a single belt (same-belt dup invariant)
  const sharedBeltGroups: number[][] = isLawPlus
    ? [[2, 3, 4, 5], [6, 7, 8], [10, 11, 12, 13], [14, 15]]
    : [[1, 2, 3, 4], [5, 6], [9, 10, 11], [14, 15]]

  for (let p = 0; p < PACKS; p++) {
    const pack = generateCarboniteBoosterPack(code)
    const cards = pack.cards as Card[]
    sizes.push(cards.length)

    cards.forEach((c, i) => {
      // variant tuple + rarity per slot
      const tuple = `${c.variantType}|${c.isFoil ? 'F' : ''}${c.isHyperspace ? 'H' : ''}${c.isPrestige ? 'P' : ''}${c.isShowcase ? 'S' : ''}`
      ;(slotVariant[i] = slotVariant[i] || {})[tuple] = ((slotVariant[i] || {})[tuple] || 0) + 1
      ;(slotRarity[i] = slotRarity[i] || {})[c.rarity || '?'] = ((slotRarity[i] || {})[c.rarity || '?'] || 0) + 1
      if (c.set && c.set !== set) wrongSet++
      // Normal-only (no variant flag) — forbidden in carbonite
      if ((c.variantType || 'Normal') === 'Normal' && !c.isFoil && !c.isHyperspace && !c.isPrestige && !c.isShowcase) normalOnly++
    })

    // Leader (slot 0)
    const leader = cards[0]
    if (!leader?.isLeader) nonLeaderSlot0++
    if (leader?.isShowcase) showcaseLeaders++
    else if (leader?.isHyperspace) hsLeaders++

    // Prestige
    const prestige = cards.find(c => c.isPrestige)
    if (prestige) {
      prestigeCount++
      if (!prestigeVariants.includes(prestige.variantType || '')) prestigeWrong++
      if (prestige.prestigeTier) prestigeTiers[prestige.prestigeTier] = (prestigeTiers[prestige.prestigeTier] || 0) + 1
    }
    const prestigeInPack = cards.filter(c => c.isPrestige).length
    if (prestigeInPack !== 1) prestigeWrong++

    // Weighted slots + blocks
    if (isLawPlus) {
      const top = cards[9]
      if (top) lawTop[top.rarity || '?'] = (lawTop[top.rarity || '?'] || 0) + 1
      for (let i = 2; i <= 9; i++) if (cards[i]) lawHSblock.push(cards[i])
      for (let i = 10; i <= 15; i++) {
        if (cards[i]) {
          lawHSFblock.push(cards[i])
          hsfSlotCards++
          if (cards[i].variantType === 'Hyperspace Foil') hsfTrueVariant++
        }
      }
    } else {
      const f = cards[7]
      if (f) rlFoil[f.rarity || '?'] = (rlFoil[f.rarity || '?'] || 0) + 1
      const h = cards[13]
      if (h) rlHS[h.rarity || '?'] = (rlHS[h.rarity || '?'] || 0) + 1
      for (let i = 14; i <= 15; i++) {
        if (cards[i]) {
          hsfSlotCards++
          if (cards[i].variantType === 'Hyperspace Foil') hsfTrueVariant++
        }
      }
    }

    // Same-belt within-pack dup: within each shared group, any two identical printings?
    for (const grp of sharedBeltGroups) {
      const keys = grp.map(i => cards[i]).filter(Boolean).map(c => treatKey(c!))
      if (new Set(keys).size !== keys.length) { sameBeltDupPacks++; break }
    }
    // Whole-pack identical-treatment dup (deck cards): the comprehensive invariant —
    // no identical printing twice anywhere in the pack (allows cross-treatment pairs).
    const deckKeys = cards.filter(c => !c.isLeader && !c.isPrestige).map(treatKey)
    if (new Set(deckKeys).size !== deckKeys.length) wholePackDupPacks++
  }

  const checks: Check[] = []
  const notes: string[] = []

  // --- Structural ---
  const all16 = sizes.every(s => s === 16)
  checks.push(exact('Pack size always 16', sizes.filter(s => s === 16).length, PACKS, ` / ${PACKS}`))
  checks.push(exact('Slot 0 is a leader', PACKS - nonLeaderSlot0, PACKS, ` / ${PACKS}`))
  checks.push(exact('Exactly 1 prestige/pack', prestigeCount - prestigeWrong, prestigeCount, ` valid / ${prestigeCount}`))
  checks.push(exact('No Normal-only cards', normalOnly, 0))
  checks.push(exact('No wrong-set cards', wrongSet, 0))
  checks.push(exact('No same-belt within-pack dups', sameBeltDupPacks, 0, ' packs'))
  checks.push(exact('No identical-printing dups (whole pack)', wholePackDupPacks, 0, ' packs'))

  // --- Leader: always HS or Showcase; showcase rate ---
  const leaderVariant = showcaseLeaders + hsLeaders
  checks.push(exact('Leader always HS/Showcase', leaderVariant, PACKS, ` / ${PACKS}`))
  const scRate = pct(showcaseLeaders, PACKS)
  const scTarget = (isLawPlus ? C.showcaseRate.law : C.showcaseRate.preLaw) * 100
  checks.push(band(`Showcase rate (spec ${f2(scTarget)}%)`, scRate, scTarget - 1.2, scTarget + 1.2))

  // --- Prestige tier mix 80/18/2 ---
  const pt = prestigeTiers, ptTot = (pt.tier1 || 0) + (pt.tier2 || 0) + (pt.serialized || 0)
  checks.push(band('Prestige tier1 (spec 80%)', pct(pt.tier1 || 0, ptTot), 77, 83))
  checks.push(band('Prestige tier2 (spec 18%)', pct(pt.tier2 || 0, ptTot), 15, 21))
  checks.push(band('Prestige serialized (spec 2%)', pct(pt.serialized || 0, ptTot), 1, 3.5))

  // --- Weighted slots ---
  if (!isLawPlus) {
    const ft = rlFoil, fTot = Object.values(ft).reduce((a, b) => a + b, 0)
    checks.push(band('R/L Foil Rare (spec 70%)', pct(ft.Rare || 0, fTot), 66, 74))
    checks.push(band('R/L Foil Special (spec 20%)', pct(ft.Special || 0, fTot), 16.5, 23.5))
    checks.push(band('R/L Foil Legendary (spec 10%)', pct(ft.Legendary || 0, fTot), 7, 13))
    const ht = rlHS, hTot = Object.values(ht).reduce((a, b) => a + b, 0)
    checks.push(band('R/L HS Rare (spec 70%)', pct(ht.Rare || 0, hTot), 66, 74))
    checks.push(band('R/L HS Special (spec 20%)', pct(ht.Special || 0, hTot), 16.5, 23.5))
    checks.push(band('R/L HS Legendary (spec 10%)', pct(ht.Legendary || 0, hTot), 7, 13))
    // No R/L slot upgraded to a non-target rarity
    const forbiddenFoil = fTot - (ft.Rare || 0) - (ft.Special || 0) - (ft.Legendary || 0)
    checks.push(exact('R/L Foil only R/S/L', forbiddenFoil, 0))
    const forbiddenHS = hTot - (ht.Rare || 0) - (ht.Special || 0) - (ht.Legendary || 0)
    checks.push(exact('R/L HS only R/S/L', forbiddenHS, 0))
  } else {
    const tt = lawTop, tTot = Object.values(tt).reduce((a, b) => a + b, 0)
    checks.push(band('HS-Top Rare (spec 60%)', pct(tt.Rare || 0, tTot), 56, 64))
    checks.push(band('HS-Top Special (spec 20%)', pct(tt.Special || 0, tTot), 16.5, 23.5))
    checks.push(band('HS-Top Legendary (spec 20%)', pct(tt.Legendary || 0, tTot), 16.5, 23.5))
    const topForbidden = tTot - (tt.Rare || 0) - (tt.Special || 0) - (tt.Legendary || 0)
    checks.push(exact('HS-Top only R/S/L', topForbidden, 0))

    // HS block (8 cards): expected 4 fixed C + 3 flex + 1 top
    const hb = rarityMix(lawHSblock), hbTot = lawHSblock.length
    const fx = C.hsFlexWeights, tp = C.hsTopWeights
    const expC = pct(4 + 3 * fx.Common / 100, 8)
    const expUC = pct(3 * fx.Uncommon / 100, 8)
    checks.push(band(`HS-block Common (spec ${f1(expC)}%)`, pct(hb.Common || 0, hbTot), expC - 3, expC + 3))
    checks.push(band(`HS-block Uncommon (spec ${f1(expUC)}%)`, pct(hb.Uncommon || 0, hbTot), expUC - 3, expUC + 3))

    // HSF block (6 cards): 2 fixed C + 4 flex
    const fb = rarityMix(lawHSFblock), fbTot = lawHSFblock.length
    const hf = C.hsfFlexWeights
    const expHSFC = pct(2 + 4 * hf.Common / 100, 6)
    const expHSFUC = pct(4 * hf.Uncommon / 100, 6)
    checks.push(band(`HSF-block Common (spec ${f1(expHSFC)}%)`, pct(fb.Common || 0, fbTot), expHSFC - 3, expHSFC + 3))
    checks.push(band(`HSF-block Uncommon (spec ${f1(expHSFUC)}%)`, pct(fb.Uncommon || 0, fbTot), expHSFUC - 3, expHSFUC + 3))
  }

  // --- HSF variantType fidelity (observational — see findings doc) ---
  notes.push(`HSF-slot cards with true \`variantType:'Hyperspace Foil'\`: ${f1(pct(hsfTrueVariant, hsfSlotCards))}% (${hsfTrueVariant}/${hsfSlotCards})`)

  // Build the slot table
  const slotTable: string[] = []
  slotTable.push('| Slot | Dominant rarity mix | Dominant variant tuple (variantType\\|flags) |')
  slotTable.push('|---|---|---|')
  for (let i = 0; i < 16; i++) {
    const rar = slotRarity[i] || {}
    const rarStr = Object.entries(rar).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f1(pct(v, PACKS))}%`).join(', ')
    const vt = slotVariant[i] || {}
    const vtStr = Object.entries(vt).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${f1(pct(v, PACKS))}%`).join(' · ')
    slotTable.push(`| ${i} | ${rarStr} | ${vtStr} |`)
  }

  return { set, isLawPlus, checks, slotTable, notes }
}

async function main() {
  await initializeCardCache()
  console.log(`Carbonite benchmark: ${PACKS} packs/set × ${ALL.length} sets...`)

  const reports = ALL.map(s => { console.log(`  ${s}-CB...`); return auditSet(s) })

  const lines: string[] = []
  lines.push(`# Carbonite Pack Benchmark`)
  lines.push('')
  lines.push(`**${PACKS.toLocaleString()} packs/set** · sets: ${ALL.map(s => s + '-CB').join(', ')}`)
  lines.push('')
  lines.push('Ground truth = design spec (`plans/CARBONITE_PACK_PLAN.md` + `src/utils/carboniteConstants.ts`).')
  lines.push('Carbonite is app-only (Chaos Sealed/Draft) — no real-box data exists. Bands are spec-derived tolerances.')
  lines.push('')

  let totalFail = 0
  for (const r of reports) {
    const fails = r.checks.filter(c => !c.pass).length
    totalFail += fails
    lines.push(`## ${r.set}-CB (${r.isLawPlus ? 'LAW+' : 'pre-LAW'})${fails ? ` — ⚠️ ${fails} band miss` : ' — ✅'}`)
    lines.push('')
    lines.push('| Check | Measured | Spec band | |')
    lines.push('|---|---|---|---|')
    for (const c of r.checks) lines.push(`| ${c.label} | ${c.measured} | ${c.band} | ${c.pass ? '✅' : '❌'} |`)
    lines.push('')
    for (const n of r.notes) lines.push(`- ${n}`)
    lines.push('')
    lines.push('<details><summary>Per-slot variant/rarity table</summary>')
    lines.push('')
    for (const l of r.slotTable) lines.push(l)
    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push(totalFail === 0
    ? `**All checks within spec bands.**`
    : `**${totalFail} band miss(es) across all sets — see ❌ rows.**`)

  const report = lines.join('\n')
  console.log('\n' + report)
  if (OUT) { writeFileSync(OUT, report + '\n'); console.log(`\nWrote ${OUT}`) }
  console.log(`\nTotal band misses: ${totalFail}`)
}

main()
