/**
 * Evaluate the anomaly builder against ground truth across all 3 fixtures.
 *
 * For each fixture:
 *   1. Load cached extraction (scripts/eval/extractions/<fixture>.json)
 *   2. Build resolvedRows mirroring the reducer's EXTRACTION_SUCCESS path
 *   3. Run buildAnomalies() from the production module
 *   4. Diff surfaced anomalies vs the ground-truth real issues
 *   5. Report coverage = real issues caught by ANY surfaced anomaly
 *
 * "Caught" = a surfaced anomaly's targetId resolves to the affected row
 * (or, for section-level catches, the surfaced anomaly's sectionName equals
 * the real issue's section).
 *
 * Run: npx tsx scripts/eval-anomalies.ts
 */
import * as fs from 'fs'
import { buildAnomalies, type AnomalyInput, type AnomalyInputRow } from '../src/services/importPool/buildAnomalies'

const FIXTURES = ['sq-tom-law', 'sq-lee-law', 'casual-lee-law']

const MAIN = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
const SEC = new Set(['Heroism', 'Villainy'])

function sectionOf(card: any): string {
  if (!card) return '?'
  if (card.isLeader) return 'Leaders'
  if (card.isBase) return 'Bases'
  const aspects: string[] = card.aspects || []
  const mains = aspects.filter((a) => MAIN.has(a))
  const secs = aspects.filter((a) => SEC.has(a))
  if (mains.length >= 2) return 'Multicolor'
  if (mains.length === 1) return mains[0]
  if (secs.length >= 1) return secs[0]
  return 'NoAspect'
}

interface RealIssue {
  kind: 'miss' | 'phantom' | 'wrong_deck'
  card: string
  subtitle: string | null
  section: string
  truthPool: number
  truthDeck: number
  extPool: number
  extDeck: number
}

function computeRealIssues(extRows: any[], truthRows: any[], lawByKey: Map<string, any>): RealIssue[] {
  const truthByKey = new Map<string, any>()
  for (const t of truthRows) truthByKey.set(`${t.name}|${t.subtitle || ''}`, t)
  const extByKey = new Map<string, any>()
  for (const e of extRows) extByKey.set(`${e.name}|${e.subtitle || ''}`, e)

  const issues: RealIssue[] = []
  // Pool misses + wrong-pool from truth side
  for (const t of truthRows) {
    const key = `${t.name}|${t.subtitle || ''}`
    const e = extByKey.get(key)
    const card = lawByKey.get(key)
    const sec = sectionOf(card)
    const ePool = e?.poolQty ?? 0
    const eDeck = e?.deckQty ?? 0
    if (t.poolQty > ePool) {
      issues.push({ kind: 'miss', card: t.name, subtitle: t.subtitle, section: sec, truthPool: t.poolQty, truthDeck: t.deckQty, extPool: ePool, extDeck: eDeck })
    }
    if (e && ePool > t.poolQty) {
      issues.push({ kind: 'phantom', card: t.name, subtitle: t.subtitle, section: sec, truthPool: t.poolQty, truthDeck: t.deckQty, extPool: ePool, extDeck: eDeck })
    }
    if (e && t.deckQty !== eDeck) {
      issues.push({ kind: 'wrong_deck', card: t.name, subtitle: t.subtitle, section: sec, truthPool: t.poolQty, truthDeck: t.deckQty, extPool: ePool, extDeck: eDeck })
    }
  }
  // Phantoms not in truth at all
  for (const e of extRows) {
    const key = `${e.name}|${e.subtitle || ''}`
    if (!truthByKey.has(key) && (e.poolQty > 0 || e.deckQty > 0)) {
      const card = lawByKey.get(key)
      const sec = sectionOf(card)
      issues.push({ kind: 'phantom', card: e.name, subtitle: e.subtitle, section: sec, truthPool: 0, truthDeck: 0, extPool: e.poolQty, extDeck: e.deckQty })
    }
  }
  return issues
}

function buildResolvedRows(extRows: any[], lawByKey: Map<string, any>): AnomalyInputRow[] {
  // Mirror the EXTRACTION_SUCCESS reducer in src/hooks/useImportPool.ts: each
  // ext row becomes a ResolvedRow with poolQty/deckQty preserved and the
  // matched card looked up from the catalog.
  return extRows.map((row, i) => {
    const key = `${row.name}|${row.subtitle || ''}`
    const cat = lawByKey.get(key)
    const card = cat ? {
      id: cat.id,
      cardId: cat.cardId,
      name: cat.name,
      subtitle: cat.subtitle || null,
      isLeader: !!cat.isLeader,
      isBase: !!cat.isBase,
      aspects: cat.aspects || [],
    } : null
    return {
      key: `row-${i}`,
      card,
      extracted: {
        name: row.name,
        type: row.type,
        poolQtyConfidence: row.poolQtyConfidence,
        deckQtyConfidence: row.deckQtyConfidence,
      },
      poolQty: row.poolQty,
      deckQty: row.deckQty,
      confidence: card ? 'exact' : 'unmatched',
    }
  })
}

function isCovered(issue: RealIssue, anomalies: any[], resolvedRows: AnomalyInputRow[]): boolean {
  // Strict coverage: either a row-kind anomaly targets the EXACT row, or
  // a section-kind anomaly targets the issue's section. A row anomaly that
  // happens to be in the same section but points at a different card does
  // NOT count — the user would have no way to navigate from anomaly Y to
  // row X just because they share a section.
  const rowsForIssue = resolvedRows.filter(
    (r) => r.card?.name === issue.card && (r.card?.subtitle || null) === (issue.subtitle || null),
  )
  if (rowsForIssue.length === 0) {
    rowsForIssue.push(
      ...resolvedRows.filter((r) => r.extracted.name === issue.card),
    )
  }
  for (const r of rowsForIssue) {
    if (anomalies.some((a) => a.kind === 'row' && a.targetId === `ip-row-${r.key}`)) return true
  }
  if (anomalies.some((a) => a.kind === 'section' && a.sectionName === issue.section)) return true
  return false
}

function evalFixture(fixture: string): { coverage: number; total: number; caught: number; missed: RealIssue[]; surfacedNoise: number } {
  const ext = JSON.parse(fs.readFileSync(`./scripts/eval/extractions/${fixture}.json`, 'utf8'))
  const truth = JSON.parse(fs.readFileSync(`./scripts/eval/fixtures/${fixture}/ground-truth.json`, 'utf8'))
  const catalog = JSON.parse(fs.readFileSync('./src/data/cards.json', 'utf8'))
  const lawByKey = new Map<string, any>()
  for (const c of catalog.cards) {
    if (c.set === 'LAW' && c.variantType === 'Normal') {
      lawByKey.set(`${c.name}|${c.subtitle || ''}`, c)
    }
  }

  const realIssues = computeRealIssues(ext.rows, truth.rows, lawByKey)
  const resolvedRows = buildResolvedRows(ext.rows, lawByKey)
  const poolCount = resolvedRows.reduce((s, r) => s + r.poolQty, 0)
  const deckCount = resolvedRows.reduce((s, r) => s + r.deckQty, 0)
  const input: AnomalyInput = {
    resolvedRows,
    sectionGaps: ext.sectionGaps || [],
    poolCount,
    poolTarget: 96,
    deckCount,
    deckTarget: 30,
  }
  const anomalies = buildAnomalies(input)

  const caughtIssues: RealIssue[] = []
  const missedIssues: RealIssue[] = []
  for (const issue of realIssues) {
    if (isCovered(issue, anomalies, resolvedRows)) {
      caughtIssues.push(issue)
    } else {
      missedIssues.push(issue)
    }
  }

  // Surfaced noise = surfaced anomalies that don't match any real issue
  let surfacedNoise = 0
  for (const a of anomalies) {
    // Section anomalies counted as noise only if no real issue is in that section
    if (a.kind === 'section') {
      const matches = realIssues.some((i) => i.section === a.sectionName)
      if (!matches) surfacedNoise++
      continue
    }
    // Row anomalies: noise if the row's card isn't in any real issue
    const targetRow = resolvedRows.find((r) => `ip-row-${r.key}` === a.targetId)
    if (!targetRow) { surfacedNoise++; continue }
    const cardName = targetRow.card?.name || targetRow.extracted.name
    const cardSub = targetRow.card?.subtitle || null
    const matches = realIssues.some((i) => i.card === cardName && (i.subtitle || null) === cardSub)
    if (!matches) surfacedNoise++
  }

  return {
    coverage: realIssues.length === 0 ? 1 : caughtIssues.length / realIssues.length,
    total: realIssues.length,
    caught: caughtIssues.length,
    missed: missedIssues,
    surfacedNoise,
  }
}

function main() {
  console.log('Anomaly coverage eval — measure: real issues caught / total real issues')
  console.log('='.repeat(80))

  let allTotal = 0
  let allCaught = 0
  for (const fix of FIXTURES) {
    const r = evalFixture(fix)
    allTotal += r.total
    allCaught += r.caught
    console.log(`\n${fix}: caught ${r.caught}/${r.total} = ${(r.coverage * 100).toFixed(1)}% (${r.surfacedNoise} surfaced anomalies were noise)`)
    if (r.missed.length > 0) {
      console.log(`  MISSED:`)
      for (const m of r.missed) {
        const sub = m.subtitle ? ` — ${m.subtitle}` : ''
        console.log(`    [${m.kind.padEnd(11)}] [${m.section.padEnd(11)}] ${m.card}${sub}  truth ${m.truthPool}/${m.truthDeck}, ext ${m.extPool}/${m.extDeck}`)
      }
    }
  }
  console.log('\n' + '='.repeat(80))
  console.log(`OVERALL: ${allCaught}/${allTotal} = ${(100 * allCaught / Math.max(1, allTotal)).toFixed(1)}%`)
}

main()
