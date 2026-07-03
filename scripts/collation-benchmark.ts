/**
 * Collation benchmark: scores the current generator against real-data targets.
 *
 * Measures CONSUMER order (the order generateSealedBox returns packs, i.e. what
 * players experience). Definitions match plans/LINE_STACKING_COLLATION_PLAN.md:
 * deck cards only (no leaders/bases), identity = name+subtitle (treatment-
 * invariant), pools = the 4 consecutive 6-pack windows of a box.
 *
 * Usage: npx tsx scripts/collation-benchmark.ts [--boxes=300] [--set=ASH] [--out=path.md]
 */

import { writeFileSync } from 'fs'
import { generateSealedBox } from '../src/utils/boosterPack'
import { initializeCardCache } from '../src/utils/cardCache'

const arg = (name: string, dflt: string) =>
  (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt
const BOXES = Number(arg('boxes', '300'))
const SET = arg('set', 'ASH')
const OUT = arg('out', '')

type Card = {
  name: string; subtitle?: string; rarity: string; variantType?: string
  isLeader?: boolean; isBase?: boolean
}
const id = (c: Card) => `${c.name}|${c.subtitle || ''}`
const isDeck = (c: Card) => !c.isLeader && !c.isBase
const isNormal = (c: Card) => (c.variantType || 'Normal') === 'Normal'
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) }

// Real-data targets (sources: data/real-boxes/*, scripts/eval/fixtures/*;
// see plans/ASH_COLLATION_FINDINGS.md)
const TARGETS = {
  M1: 'Normal+Normal pairs/pool — real pools: 0,0,3,7 (box 001) and 10 (pool 002); band: mean 1.0-4.0, max ≥5',
  M2: 'Dup identities/pool mean — real 13 full pools mean ≈6.5; band 5.5-8.0',
  M3: '% pools ≥10 dup identities — real 4/13 ≈31%; band 10-45%',
  M4: 'Box unique identities — real 183; band 178-188',
  M5: 'Within-pack dup groups/pack — real 4/30 ≈0.13, all cross-variant; band 0.10-0.20, ≥90% cross-variant',
  M6: 'Base same-aspect adjacency (consumer) — real 5/21 ≈ random 25%; band 15-35%',
  M7: 'Leader same-name repeat min gap (consumer) — real min 2; target ≤4',
  M8: 'Rare-slot same-name repeat min gap (consumer) — real min 2; target ≤4',
  M9: 'Slot rates: HS leader ≈1/6, HS base ≈1/6, HS common =1/pack, UC1/UC2 HS =0, foil always HSF, R:L ≈5:1',
}

async function main() {
  await initializeCardCache()
  console.log(`Benchmarking ${BOXES} ${SET} boxes (consumer order)...`)

  const nnPairsPerPool: number[] = []
  const dupIdsPerPool: number[] = []
  const boxUnique: number[] = []
  let packCount = 0, packDupGroups = 0, packDupCross = 0
  let baseAdjSame = 0, baseAdjTotal = 0
  let leaderMinGap = Infinity, rareMinGap = Infinity
  let hsLeader = 0, hsBase = 0, hsCommonExactly1 = 0
  let ucSlotHS = 0, foilNotHSF = 0, rareCount = 0, legendaryCount = 0

  for (let b = 0; b < BOXES; b++) {
    const box = generateSealedBox([], SET, 24)
    const boxIds: Record<string, number> = {}
    const leaderSeen: Record<string, number> = {}
    const rareSeen: Record<string, number> = {}
    let prevBaseAspects: string[] | null = null

    box.forEach((pack, p) => {
      packCount++
      const cards: Card[] = pack.cards
      const leader = cards.find(c => c.isLeader)
      const base = cards.find(c => c.isBase)
      const deck = cards.filter(isDeck)

      // M9 slot rates
      if (leader?.variantType === 'Hyperspace') hsLeader++
      if (base?.variantType === 'Hyperspace') hsBase++
      const hsCommons = deck.filter(c => c.variantType === 'Hyperspace' && c.rarity === 'Common').length
      if (hsCommons === 1) hsCommonExactly1++
      const foil = deck.find(c => (c.variantType || '').includes('Foil'))
      if (foil && foil.variantType !== 'Hyperspace Foil') foilNotHSF++
      // UC1/UC2 HS check: HS uncommons NOT at the UC3 position. UC3 = last
      // uncommon-or-upgraded slot; approximate: >1 HS uncommon in a pack means
      // one came from UC1/UC2 (UC3 produces at most one).
      const hsUCs = deck.filter(c => c.variantType === 'Hyperspace' && c.rarity === 'Uncommon').length
      if (hsUCs > 1) ucSlotHS++
      const rl = deck.filter(c => isNormal(c) && (c.rarity === 'Rare' || c.rarity === 'Legendary'))
      const rlCard = rl[rl.length - 1]
      if (rlCard?.rarity === 'Rare') rareCount++
      if (rlCard?.rarity === 'Legendary') legendaryCount++

      // M5 within-pack dups
      const seen: Record<string, Card[]> = {}
      deck.forEach(c => { (seen[id(c)] = seen[id(c)] || []).push(c) })
      for (const g of Object.values(seen)) if (g.length > 1) {
        packDupGroups++
        if (new Set(g.map(c => c.variantType || 'Normal')).size > 1) packDupCross++
      }

      // M6 base aspect adjacency (consumer order)
      const bAspects: string[] = (base as any)?.aspects || []
      if (prevBaseAspects) {
        baseAdjTotal++
        if (bAspects.some(a => prevBaseAspects!.includes(a))) baseAdjSame++
      }
      prevBaseAspects = bAspects

      // M7/M8 repeat gaps (any variant, same name)
      if (leader) {
        const k = leader.name
        if (leaderSeen[k] !== undefined) leaderMinGap = Math.min(leaderMinGap, p - leaderSeen[k])
        leaderSeen[k] = p
      }
      if (rlCard) {
        const k = id(rlCard)
        if (rareSeen[k] !== undefined) rareMinGap = Math.min(rareMinGap, p - rareSeen[k])
        rareSeen[k] = p
      }

      deck.forEach(c => { boxIds[id(c)] = (boxIds[id(c)] || 0) + 1 })
    })

    boxUnique.push(Object.keys(boxIds).length)

    // pools = 4 consecutive 6-pack windows
    for (let g = 0; g < 4; g++) {
      const byId: Record<string, Card[]> = {}
      for (let p = g * 6; p < g * 6 + 6; p++) {
        box[p].cards.filter(isDeck).forEach((c: Card) => { (byId[id(c)] = byId[id(c)] || []).push(c) })
      }
      const groups = Object.values(byId)
      const dups = groups.filter(x => x.length > 1)
      dupIdsPerPool.push(dups.length)
      nnPairsPerPool.push(dups.filter(x => x.length === 2 && x.every(isNormal)).length)
    }
  }

  const pools = dupIdsPerPool.length
  const results = [
    { m: 'M1', v: `mean ${mean(nnPairsPerPool).toFixed(2)}, max ${Math.max(...nnPairsPerPool)}, pools≥5: ${(nnPairsPerPool.filter(x => x >= 5).length / pools * 100).toFixed(1)}%` },
    { m: 'M2', v: `mean ${mean(dupIdsPerPool).toFixed(2)} ± ${sd(dupIdsPerPool).toFixed(2)}` },
    { m: 'M3', v: `${(dupIdsPerPool.filter(x => x >= 10).length / pools * 100).toFixed(1)}% of pools ≥10` },
    { m: 'M4', v: `mean ${mean(boxUnique).toFixed(1)} ± ${sd(boxUnique).toFixed(1)}` },
    { m: 'M5', v: `${(packDupGroups / packCount).toFixed(3)}/pack, cross-variant ${(packDupGroups ? packDupCross / packDupGroups * 100 : 0).toFixed(1)}%` },
    { m: 'M6', v: `${(baseAdjSame / baseAdjTotal * 100).toFixed(1)}% adjacent same-aspect` },
    { m: 'M7', v: `leader min repeat gap ${leaderMinGap === Infinity ? 'none' : leaderMinGap}` },
    { m: 'M8', v: `rare min repeat gap ${rareMinGap === Infinity ? 'none' : rareMinGap}` },
    { m: 'M9', v: `HS leader ${(hsLeader / packCount).toFixed(3)}, HS base ${(hsBase / packCount).toFixed(3)}, HS common=1 ${(hsCommonExactly1 / packCount * 100).toFixed(1)}%, packs w/ 2+ HS UC ${(ucSlotHS / packCount * 100).toFixed(2)}%, non-HSF foils ${foilNotHSF}, R:L ${(rareCount / Math.max(1, legendaryCount)).toFixed(1)}:1` },
  ]

  const lines: string[] = []
  lines.push(`# Collation Benchmark — ${SET}, ${BOXES} boxes (${pools} pools)`)
  lines.push('')
  lines.push(`Generated: consumer-order stats from \`generateSealedBox\`. Targets from real data`)
  lines.push(`(box 001, pool 002, LAW event fixtures) — see plans/LINE_STACKING_COLLATION_PLAN.md.`)
  lines.push('')
  lines.push('| # | Target (real data) | Measured |')
  lines.push('|---|---|---|')
  for (const r of results) lines.push(`| ${r.m} | ${TARGETS[r.m as keyof typeof TARGETS]} | ${r.v} |`)
  const report = lines.join('\n')
  console.log('\n' + report)
  if (OUT) { writeFileSync(OUT, report + '\n'); console.log(`\nWrote ${OUT}`) }
}

main()
