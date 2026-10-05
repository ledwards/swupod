/**
 * Six-pack duplicate metrics.
 *
 * Same printing is the distance-table count in sixPackMetrics.ts (an even
 * distance that lands both copies in the six). Different printing is a variant
 * copy hitting a normal already in the six. The opened Ashes boxes are the
 * other reference.
 *
 * Run with: npx tsx src/qa/sixPackMetrics.test.ts
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { clearBeltCache, generateSealedPod } from '../utils/boosterPack'
import { getCachedCards, initializeCardCache } from '../utils/cardCache'
import { differentPrinting, samePrintingTheory } from './sixPackMetrics'

const PODS = 200
const REAL_BOX_DIR = join(import.meta.dirname, '..', '..', 'data', 'real-boxes')

let passed = 0
let failed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    console.log(`\x1b[32m✅ ${name}\x1b[0m`)
    passed++
  } catch (e) {
    console.log(`\x1b[31m❌ ${name}\x1b[0m`)
    console.log(`\x1b[33m   ${(e as Error).message}\x1b[0m`)
    failed++
  }
}
function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new Error(message || 'Assertion failed')
}

type Metric = { same: number; different: number }
type Six = { deck: Metric; leader: Metric; base: Metric }

function empty(): Six {
  const z = () => ({ same: 0, different: 0 })
  return { deck: z(), leader: z(), base: z() }
}

function gameId(c: { name?: string; subtitle?: string }): string {
  return `${c.name}|${c.subtitle || ''}`
}
function groupOf(c: { isLeader?: boolean; type?: string; isBase?: boolean }): 'leader' | 'base' | 'deck' {
  if (c.isLeader || c.type === 'Leader') return 'leader'
  if (c.isBase || c.type === 'Base') return 'base'
  return 'deck'
}
function styleOf(c: { variantType?: string; variant?: string }): string {
  return c.variantType || c.variant || 'Normal'
}
function catOf(c: { isLeader?: boolean; type?: string; isBase?: boolean; rarity?: string }): string {
  if (c.isLeader || c.type === 'Leader') return 'Leader'
  if (c.isBase || c.type === 'Base') return 'Base'
  return c.rarity || 'Unknown'
}

function score(cards: Array<{ name?: string; subtitle?: string; isLeader?: boolean; isBase?: boolean; type?: string; variantType?: string; variant?: string }>): Six {
  const groups: Record<'deck' | 'leader' | 'base', Map<string, string[]>> = {
    deck: new Map(), leader: new Map(), base: new Map(),
  }
  for (const c of cards) {
    if (styleOf(c) === 'Unverified') continue
    const g = groups[groupOf(c)]
    const id = gameId(c)
    const arr = g.get(id)
    if (arr) arr.push(styleOf(c))
    else g.set(id, [styleOf(c)])
  }
  const out = empty()
  for (const key of ['deck', 'leader', 'base'] as const) {
    for (const styles of groups[key].values()) {
      if (styles.length < 2) continue
      const counts = new Map<string, number>()
      for (const s of styles) counts.set(s, (counts.get(s) || 0) + 1)
      if ([...counts.values()].some(n => n >= 2)) out[key].same++
      else out[key].different++
    }
  }
  return out
}

function add(into: Six, row: Six): void {
  for (const key of ['deck', 'leader', 'base'] as const) {
    into[key].same += row[key].same
    into[key].different += row[key].different
  }
}
function mean(total: Six, n: number): Six {
  const out = empty()
  for (const key of ['deck', 'leader', 'base'] as const) {
    out[key].same = total[key].same / n
    out[key].different = total[key].different / n
  }
  return out
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim())
  const header = lines[0]!.split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const cells: string[] = []
    let cur = ''
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = (cells[i] || '').trim() })
    return row
  })
}

/** Boxes 1–7, complete sixes only. */
function openedBoxes(): Six | null {
  if (!existsSync(REAL_BOX_DIR)) return null
  const total = empty()
  let n = 0
  for (let box = 1; box <= 7; box++) {
    const file = join(REAL_BOX_DIR, `ash-box-${String(box).padStart(3, '0')}.csv`)
    if (!existsSync(file)) continue
    const rows = parseCsv(readFileSync(file, 'utf8'))
    const byPack: Record<number, Record<string, string>[]> = {}
    for (const r of rows) {
      const p = parseInt(r.pack || '', 10)
      if (p) (byPack[p] = byPack[p] || []).push(r)
    }
    for (let g = 0; g < 4; g++) {
      const packs = [1, 2, 3, 4, 5, 6].map(k => byPack[g * 6 + k])
      if (packs.some(p => !p || p.length !== 16)) continue
      add(total, score(packs.flat() as never))
      n++
    }
  }
  return n > 0 ? mean(total, n) : null
}

function poolSizes(set: string): Record<string, number> {
  const seen = new Map<string, string>()
  for (const c of getCachedCards(set)) {
    const id = gameId(c)
    if (!seen.has(id)) seen.set(id, catOf(c))
  }
  const sizes: Record<string, number> = {}
  for (const cat of seen.values()) sizes[cat] = (sizes[cat] || 0) + 1
  return sizes
}

const DECK_CATS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special']

function fmt(n: number): string {
  return n.toFixed(2)
}
function line(label: string, row: Metric): string {
  return `${label} same ${fmt(row.same)}  different ${fmt(row.different)}`
}

async function main(): Promise<void> {
  await initializeCardCache()
  const theorySame = samePrintingTheory()
  const sizes = poolSizes('ASH')
  const boxes = openedBoxes()

  console.log('\x1b[1m\x1b[35mSix-pack duplicate metrics\x1b[0m')
  console.log(`theory same  deck ${fmt(theorySame.deck)}  leader ${fmt(theorySame.leader)}  base ${fmt(theorySame.base)}`)

  test('same-printing theory is the even-distance count, and it is above zero', () => {
    assert(theorySame.deck > 0.25 && theorySame.deck < 0.7,
      `deck same-printing theory ${fmt(theorySame.deck)} left the distance-table count`)
    assert(theorySame.leader > 0.03 && theorySame.leader < 0.16,
      `leader same-printing theory ${fmt(theorySame.leader)} left the distance-table count`)
    assert(theorySame.base > 0.1 && theorySame.base < 0.45,
      `base same-printing theory ${fmt(theorySame.base)} left the distance-table count`)
  })

  clearBeltCache()
  const genTotal = empty()
  const varLoad: Record<string, number> = {}
  const normPresent: Record<string, number> = {}
  for (let i = 0; i < PODS; i++) {
    const cards = generateSealedPod([], 'ASH', 6).flatMap(p => p.cards)
    add(genTotal, score(cards))
    const normals: Record<string, Set<string>> = {}
    for (const c of cards) {
      const cat = catOf(c)
      const variant = !!(c.isFoil || c.isHyperspace || c.isShowcase || c.isPrestige) ||
        (c.variantType && c.variantType !== 'Normal')
      if (variant) varLoad[cat] = (varLoad[cat] || 0) + 1
      else {
        if (!normals[cat]) normals[cat] = new Set()
        normals[cat].add(gameId(c))
      }
    }
    for (const [cat, names] of Object.entries(normals)) {
      normPresent[cat] = (normPresent[cat] || 0) + names.size
    }
  }
  const generated = mean(genTotal, PODS)
  const theoryDifferent: Six = empty()
  for (const cat of DECK_CATS) {
    theoryDifferent.deck.different += differentPrinting(
      (varLoad[cat] || 0) / PODS,
      (normPresent[cat] || 0) / PODS,
      sizes[cat] || 0,
    )
  }
  theoryDifferent.leader.different = differentPrinting(
    (varLoad.Leader || 0) / PODS, (normPresent.Leader || 0) / PODS, sizes.Leader || 0)
  theoryDifferent.base.different = differentPrinting(
    (varLoad.Base || 0) / PODS, (normPresent.Base || 0) / PODS, sizes.Base || 0)

  console.log(line('generated deck  ', generated.deck))
  console.log(line('generated leader', generated.leader))
  console.log(line('generated base  ', generated.base))
  console.log(`theory diff deck ${fmt(theoryDifferent.deck.different)}  leader ${fmt(theoryDifferent.leader.different)}  base ${fmt(theoryDifferent.base.different)}`)
  if (boxes) {
    console.log(`boxes      deck same ${fmt(boxes.deck.same)}  different ${fmt(boxes.deck.different)}`)
    console.log(`boxes      leader same ${fmt(boxes.leader.same)}  different ${fmt(boxes.leader.different)}`)
    console.log(`boxes      base same ${fmt(boxes.base.same)}  different ${fmt(boxes.base.different)}`)
  }

  test('different-printing matches its formula, and leader same-printing matches the distance count', () => {
    const rows: Array<[string, number, number, number]> = [
      ['deck different', generated.deck.different, theoryDifferent.deck.different, 0.8],
      ['leader same', generated.leader.same, theorySame.leader, 0.12],
      ['leader different', generated.leader.different, theoryDifferent.leader.different, 0.2],
      ['base different', generated.base.different, theoryDifferent.base.different, 0.25],
    ]
    const misses = rows
      .filter(([, got, target, band]) => Math.abs(got - target) > band)
      .map(([name, got, target, band]) => `${name} ${fmt(got)} vs theory ${fmt(target)} (band ±${band})`)
    assert(misses.length === 0, misses.join('; '))
  })

  // Deck and base same-printing sit above the distance count. Commons are a
  // little heavier on the short even distances than the 453-pair table, and an
  // upgraded uncommon is returned to the front of its sheet, which moves the
  // copies after it by one slot. The fence rejects 0 and the old ~2.3.
  test('deck and base same-printing stay above zero and below the old carried-sheet figure', () => {
    assert(generated.deck.same > 0.2 && generated.deck.same < 1.4,
      `deck same ${fmt(generated.deck.same)} left the fence (theory ${fmt(theorySame.deck)}, boxes ${boxes ? fmt(boxes.deck.same) : '?'})`)
    assert(generated.base.same > 0.05 && generated.base.same < 0.8,
      `base same ${fmt(generated.base.same)} left the fence (theory ${fmt(theorySame.base)}, boxes ${boxes ? fmt(boxes.base.same) : '?'})`)
  })

  test('opened boxes are the other reference, and the generator has not left them', () => {
    assert(boxes !== null, 'opened Ashes boxes 1–7 are missing')
    const rows: Array<[string, number, number, number]> = [
      ['deck same', generated.deck.same, boxes!.deck.same, 0.6],
      ['deck different', generated.deck.different, boxes!.deck.different, 1.2],
      ['leader same', generated.leader.same, boxes!.leader.same, 0.15],
      ['leader different', generated.leader.different, boxes!.leader.different, 0.25],
      ['base same', generated.base.same, boxes!.base.same, 0.35],
      ['base different', generated.base.different, boxes!.base.different, 0.3],
    ]
    const misses = rows
      .filter(([, got, target, band]) => Math.abs(got - target) > band)
      .map(([name, got, target, band]) => `${name} ${fmt(got)} vs boxes ${fmt(target)} (band ±${band})`)
    assert(misses.length === 0, misses.join('; '))
  })

  console.log(`\x1b[32m✅ Tests passed: ${passed}\x1b[0m`)
  if (failed > 0) {
    console.log(`\x1b[31m   Tests failed: ${failed}\x1b[0m`)
    process.exit(1)
  }
}

main()
