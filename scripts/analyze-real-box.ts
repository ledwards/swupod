// @ts-nocheck
/**
 * Analyze a real-box collation CSV (data/real-boxes/*.csv) and optionally
 * compare against the current generator using identical definitions.
 *
 * Definitions (match plans/ASH_COLLATION_FINDINGS.md):
 * - Deck cards only: leaders and bases excluded.
 * - Identity = name + subtitle, treatment-invariant.
 * - Duplicate identities = identities with qty > 1; copies beyond first = Σ(qty−1).
 * - Sealed-pool windows: packs 1-6, 7-12, 13-18, 19-24.
 *
 * Usage:
 *   npx tsx scripts/analyze-real-box.ts data/real-boxes/ash-box-001.csv
 *   npx tsx scripts/analyze-real-box.ts data/real-boxes/ash-box-001.csv --compare [--boxes=500]
 */

import { readFileSync } from 'fs'

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: npx tsx scripts/analyze-real-box.ts <box.csv> [--compare] [--boxes=N]')
  process.exit(1)
}
const compare = process.argv.includes('--compare')
const boxesArg = process.argv.find(a => a.startsWith('--boxes='))
const SIM_BOXES = boxesArg ? Number(boxesArg.split('=')[1]) : 500

// --- CSV parsing (handles quoted fields) ---
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  const header = splitCsvLine(lines[0])
  return lines.slice(1).map(l => {
    const cells = splitCsvLine(l)
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  })
}
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

type CardRow = { pack: number, pos: number, name: string, subtitle: string, type: string, variant: string }
const identity = (c: CardRow) => `${c.name}|${c.subtitle}`
const isDeckCard = (c: CardRow) => c.type !== 'Leader' && c.type !== 'Base'

function windowStats(cards: CardRow[]) {
  const counts: Record<string, CardRow[]> = {}
  cards.forEach(c => { (counts[identity(c)] = counts[identity(c)] || []).push(c) })
  const groups = Object.values(counts)
  const dupGroups = groups.filter(g => g.length > 1)
  const sources: Record<string, number> = {}
  for (const g of dupGroups) {
    const variants = g.map(c => c.variant || 'Normal').sort().join('+')
    sources[variants] = (sources[variants] || 0) + 1
  }
  return {
    pulls: cards.length,
    distinct: groups.length,
    dupIdentities: dupGroups.length,
    copiesBeyondFirst: cards.length - groups.length,
    sources,
  }
}

function analyzeBox(packs: Map<number, CardRow[]>, label: string) {
  console.log(`\n=== ${label} ===`)
  const windows = [[1, 6], [7, 12], [13, 18], [19, 24]]
  const perWindow = []
  for (const [a, b] of windows) {
    const cards: CardRow[] = []
    for (let p = a; p <= b; p++) cards.push(...(packs.get(p) || []).filter(isDeckCard))
    const s = windowStats(cards)
    perWindow.push(s)
    console.log(`packs ${a}-${b}: pulls=${s.pulls} distinct=${s.distinct} dupIdentities=${s.dupIdentities} copiesBeyondFirst=${s.copiesBeyondFirst}`)
    console.log(`  sources: ${Object.entries(s.sources).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`)
  }
  // same-pack collisions
  let samePack = 0
  const samePackSources: Record<string, number> = {}
  for (const [, cards] of packs) {
    const s = windowStats(cards.filter(isDeckCard))
    samePack += s.dupIdentities
    Object.entries(s.sources).forEach(([k, v]) => { samePackSources[k] = (samePackSources[k] || 0) + v })
  }
  console.log(`same-pack collisions: ${samePack} across ${packs.size} packs`)
  if (samePack) console.log(`  sources: ${Object.entries(samePackSources).map(([k, v]) => `${k}×${v}`).join(', ')}`)
  // whole box
  const all: CardRow[] = []
  for (const [, cards] of packs) all.push(...cards.filter(isDeckCard))
  const box = windowStats(all)
  console.log(`whole box: pulls=${box.pulls} distinct=${box.distinct} dupIdentities=${box.dupIdentities} copiesBeyondFirst=${box.copiesBeyondFirst}`)
  return perWindow
}

// --- Real box ---
console.log(`Reading ${csvPath}...`)
const rows = parseCsv(readFileSync(csvPath, 'utf8'))
const realPacks = new Map<number, CardRow[]>()
for (const r of rows) {
  const c: CardRow = { pack: Number(r.pack), pos: Number(r.pos), name: r.name, subtitle: r.subtitle, type: r.type, variant: r.variant }
  if (!realPacks.has(c.pack)) realPacks.set(c.pack, [])
  realPacks.get(c.pack)!.push(c)
}
console.log(`Loaded ${rows.length} cards across ${realPacks.size} packs.`)
analyzeBox(realPacks, `REAL BOX: ${csvPath}`)

// --- Generator comparison ---
if (compare) {
  console.log(`\nSimulating ${SIM_BOXES} generated boxes (this takes a moment)...`)
  const { generateSealedBox } = await import('../src/utils/boosterPack')
  const { initializeCardCache } = await import('../src/utils/cardCache')
  await initializeCardCache()
  const { basename } = await import('path')
  const setCode = (basename(csvPath).match(/^([a-z]{3})-box/i)?.[1] || 'ASH').toUpperCase()
  console.log(`Set: ${setCode}`)

  const agg = { dupIdentities: [] as number[], copies: [] as number[], samePack: 0, packs: 0, boxDup: [] as number[] }
  for (let b = 0; b < SIM_BOXES; b++) {
    const box = generateSealedBox([], setCode, 24)
    const packs = new Map<number, CardRow[]>()
    box.forEach((pack, i) => {
      packs.set(i + 1, pack.cards.map(c => ({
        pack: i + 1, pos: 0, name: c.name, subtitle: c.subtitle || '',
        type: c.isLeader ? 'Leader' : c.isBase ? 'Base' : c.type,
        variant: c.variantType || 'Normal',
      })))
    })
    for (const [a, e] of [[1, 6], [7, 12], [13, 18], [19, 24]]) {
      const cards: CardRow[] = []
      for (let p = a; p <= e; p++) cards.push(...(packs.get(p) || []).filter(isDeckCard))
      const s = windowStats(cards)
      agg.dupIdentities.push(s.dupIdentities)
      agg.copies.push(s.copiesBeyondFirst)
    }
    for (const [, cards] of packs) {
      agg.packs++
      agg.samePack += windowStats(cards.filter(isDeckCard)).dupIdentities
    }
    const all: CardRow[] = []
    for (const [, cards] of packs) all.push(...cards.filter(isDeckCard))
    agg.boxDup.push(windowStats(all).dupIdentities)
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))) }
  console.log(`\n=== GENERATOR (${SIM_BOXES} boxes, same definitions) ===`)
  console.log(`per 6-pack window: dupIdentities ${mean(agg.dupIdentities).toFixed(2)} ± ${sd(agg.dupIdentities).toFixed(2)}, copiesBeyondFirst ${mean(agg.copies).toFixed(2)} ± ${sd(agg.copies).toFixed(2)}`)
  console.log(`same-pack collisions: ${(agg.samePack / agg.packs).toFixed(3)}/pack (${(agg.samePack / agg.packs * 24).toFixed(1)}/box)`)
  console.log(`whole box dupIdentities: ${mean(agg.boxDup).toFixed(1)} ± ${sd(agg.boxDup).toFixed(1)}`)
}
