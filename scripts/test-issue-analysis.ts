/**
 * Run all 3 fixtures through the production extraction code, then
 * compute:
 *   1. REAL issues — extraction vs ground truth
 *   2. SIMULATED current-code issues — what the resolve UI's anomaly
 *      list would surface
 *   3. Side-by-side analysis of which heuristics A-G would catch
 *      which real issues
 */
import * as fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

interface ExtractedRow {
  name: string
  type: string
  subtitle: string | null
  poolQty: number
  deckQty: number
  poolQtyConfidence: 'high' | 'medium' | 'low'
  deckQtyConfidence: 'high' | 'medium' | 'low'
  aspectGroup: string | null
}

interface TruthRow {
  name: string
  subtitle: string | null
  type: string
  poolQty: number
  deckQty: number
}

interface RealIssue {
  kind: 'missed' | 'phantom' | 'wrong_pool' | 'wrong_deck'
  card: string
  subtitle: string | null
  type: string
  truthPool: number
  truthDeck: number
  extractedPool: number
  extractedDeck: number
  section: string | null
}

const MAIN_ASPECTS = new Set(['Vigilance', 'Command', 'Aggression', 'Cunning'])
const SECONDARY_ASPECTS = new Set(['Heroism', 'Villainy'])

function sectionForCard(card: { isLeader?: boolean; isBase?: boolean; aspects?: string[] }): string | null {
  if (card.isLeader) return 'Leaders'
  if (card.isBase) return 'Bases'
  const aspects = card.aspects || []
  const mains = aspects.filter((a) => MAIN_ASPECTS.has(a))
  const secs = aspects.filter((a) => SECONDARY_ASPECTS.has(a))
  if (mains.length >= 2) return 'Multicolor'
  if (mains.length === 1) return mains[0]
  if (secs.length >= 1) return secs[0]
  return 'NoAspect'
}

function loadCardCatalog(): Map<string, any> {
  const data = JSON.parse(fs.readFileSync('./src/data/cards.json', 'utf8'))
  const map = new Map<string, any>()
  for (const c of data.cards) {
    if (c.set === 'LAW' && c.variantType === 'Normal') {
      map.set(`${c.name}|${c.subtitle || ''}`, c)
    }
  }
  return map
}

function diffExtractionVsTruth(
  fixture: string,
  extracted: ExtractedRow[],
  truth: TruthRow[],
  catalog: Map<string, any>,
): { realIssues: RealIssue[]; sectionTruth: Map<string, { pool: number; rows: number; deck: number }> } {
  // Build truth map by (name, subtitle)
  const truthMap = new Map<string, TruthRow>()
  for (const r of truth) truthMap.set(`${r.name}|${r.subtitle || ''}`, r)

  // Extracted map
  const extMap = new Map<string, ExtractedRow>()
  for (const r of extracted) extMap.set(`${r.name}|${r.subtitle || ''}`, r)

  const realIssues: RealIssue[] = []

  // 1. MISSED: in truth pool>0 but extracted pool=0 (or absent)
  for (const t of truth) {
    if (t.poolQty <= 0 && t.deckQty <= 0) continue
    const key = `${t.name}|${t.subtitle || ''}`
    const card = catalog.get(key)
    const section = card ? sectionForCard(card) : null
    const e = extMap.get(key)
    if (!e || e.poolQty < t.poolQty) {
      realIssues.push({
        kind: 'missed',
        card: t.name,
        subtitle: t.subtitle,
        type: t.type,
        truthPool: t.poolQty,
        truthDeck: t.deckQty,
        extractedPool: e?.poolQty ?? 0,
        extractedDeck: e?.deckQty ?? 0,
        section,
      })
    } else if (e.poolQty > t.poolQty) {
      realIssues.push({
        kind: 'wrong_pool',
        card: t.name,
        subtitle: t.subtitle,
        type: t.type,
        truthPool: t.poolQty,
        truthDeck: t.deckQty,
        extractedPool: e.poolQty,
        extractedDeck: e.deckQty,
        section,
      })
    }
    if (e && e.deckQty !== t.deckQty) {
      realIssues.push({
        kind: 'wrong_deck',
        card: t.name,
        subtitle: t.subtitle,
        type: t.type,
        truthPool: t.poolQty,
        truthDeck: t.deckQty,
        extractedPool: e.poolQty,
        extractedDeck: e.deckQty,
        section,
      })
    }
  }

  // 2. PHANTOM: extracted pool>0 but truth absent or pool=0
  for (const e of extracted) {
    if (e.poolQty <= 0 && e.deckQty <= 0) continue
    const key = `${e.name}|${e.subtitle || ''}`
    if (!truthMap.has(key)) {
      const card = catalog.get(key)
      const section = card ? sectionForCard(card) : null
      realIssues.push({
        kind: 'phantom',
        card: e.name,
        subtitle: e.subtitle,
        type: e.type,
        truthPool: 0,
        truthDeck: 0,
        extractedPool: e.poolQty,
        extractedDeck: e.deckQty,
        section,
      })
    }
  }

  // Section truth
  const sectionTruth = new Map<string, { pool: number; rows: number; deck: number }>()
  for (const t of truth) {
    const card = catalog.get(`${t.name}|${t.subtitle || ''}`)
    if (!card) continue
    const sec = sectionForCard(card)
    if (!sec) continue
    if (!sectionTruth.has(sec)) sectionTruth.set(sec, { pool: 0, rows: 0, deck: 0 })
    const s = sectionTruth.get(sec)!
    if (t.poolQty > 0) s.rows += 1
    s.pool += t.poolQty
    s.deck += t.deckQty
  }

  return { realIssues, sectionTruth }
}

interface SimulatedIssue {
  label: string
  card: string
  matchesRealIssue: boolean
  realIssueKind?: string
}

function simulateCurrentAnomalyList(
  extracted: ExtractedRow[],
  realIssues: RealIssue[],
): SimulatedIssue[] {
  // Approximate the resolve-step anomaly builder.
  // Categories: section gaps (skip — depend on `sectionGaps` we don't have),
  // unmatched/ambiguous (skip — assume all matched), low-conf, possibly-missed.
  const issues: SimulatedIssue[] = []
  const realByCard = new Map<string, RealIssue>()
  for (const ri of realIssues) realByCard.set(ri.card, ri)

  const seenCards = new Set<string>()
  const isReal = (name: string): boolean => realByCard.has(name)

  // 3) Low confidence reads
  for (const r of extracted) {
    if (r.poolQtyConfidence === 'low') {
      const label = `Uncertain pool count: ${r.name} (read as ${r.poolQty})`
      issues.push({ label, card: r.name, matchesRealIssue: isReal(r.name) })
      seenCards.add(r.name)
    }
    if (r.deckQtyConfidence === 'low') {
      const label = `Uncertain deck count: ${r.name} (read as ${r.deckQty})`
      issues.push({ label, card: r.name, matchesRealIssue: isReal(r.name) })
      seenCards.add(r.name)
    }
  }

  // 4) Pool short → "Possibly missed"
  const poolSum = extracted.reduce((s, r) => s + r.poolQty, 0)
  if (poolSum < 96) {
    const delta = 96 - poolSum
    const candidates = extracted
      .filter(
        (r) => !seenCards.has(r.name) && r.poolQty === 0 && r.type !== 'Leader' && r.type !== 'Base',
      )
      .map((r) => ({ r, score: r.poolQtyConfidence === 'low' ? 0 : r.poolQtyConfidence === 'medium' ? 1 : 2 }))
      .sort((a, b) => a.score - b.score || a.r.name.localeCompare(b.r.name))
      .slice(0, delta)
    for (const { r } of candidates) {
      issues.push({
        label: `Uncertain pool count: ${r.name} (read as 0)`,
        card: r.name,
        matchesRealIssue: isReal(r.name),
      })
      seenCards.add(r.name)
    }
  }

  // 5) Deck over → "Possibly mis-counted in deck"
  const deckSum = extracted.reduce((s, r) => s + r.deckQty, 0)
  if (deckSum > 35) {
    const delta = deckSum - 35
    const candidates = extracted
      .filter(
        (r) => !seenCards.has(r.name) && r.deckQty > 0 && r.type !== 'Leader' && r.type !== 'Base',
      )
      .map((r) => ({ r, score: r.deckQtyConfidence === 'low' ? 0 : r.deckQtyConfidence === 'medium' ? 1 : 2 }))
      .sort((a, b) => a.score - b.score || a.r.name.localeCompare(b.r.name))
      .slice(0, delta)
    for (const { r } of candidates) {
      issues.push({
        label: `Uncertain deck count: ${r.name} (read as ${r.deckQty})`,
        card: r.name,
        matchesRealIssue: isReal(r.name),
      })
      seenCards.add(r.name)
    }
  }

  // Mark realIssueKind on matching issues
  for (const i of issues) {
    if (realByCard.has(i.card)) i.realIssueKind = realByCard.get(i.card)!.kind
  }

  return issues
}

async function run() {
  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')
  const catalog = loadCardCatalog()
  const fixtures = ['sq-tom-law', 'sq-lee-law', 'casual-lee-law']

  for (const fix of fixtures) {
    console.log('═'.repeat(80))
    console.log(`FIXTURE: ${fix}`)
    console.log('═'.repeat(80))

    const photo1 = fs.readFileSync(`./scripts/eval/fixtures/${fix}/photo1.jpg`).toString('base64')
    const photo2 = fs.readFileSync(`./scripts/eval/fixtures/${fix}/photo2.jpg`).toString('base64')
    const gt: { rows: TruthRow[] } = JSON.parse(
      fs.readFileSync(`./scripts/eval/fixtures/${fix}/ground-truth.json`, 'utf8'),
    )

    const r = await extractPoolFromImagesWholeTable(
      [
        { data: photo1, mediaType: 'image/jpeg' },
        { data: photo2, mediaType: 'image/jpeg' },
      ],
      { setHint: 'LAW' },
    )
    const extracted = r.result.rows as ExtractedRow[]
    const poolSum = extracted.reduce((s, x) => s + x.poolQty, 0)
    const deckSum = extracted.reduce((s, x) => s + x.deckQty, 0)
    console.log(`\nExtraction: pool=${poolSum}/96 deck=${deckSum} (target 30-35)`)

    const { realIssues, sectionTruth } = diffExtractionVsTruth(fix, extracted, gt.rows, catalog)
    console.log(`\n=== ${realIssues.length} REAL ISSUES ===`)
    for (const ri of realIssues) {
      const sub = ri.subtitle ? ` "${ri.subtitle}"` : ''
      console.log(
        `  ${ri.kind.padEnd(11)} ${(ri.section || '?').padEnd(11)} ${ri.card}${sub}  truth ${ri.truthPool}/${ri.truthDeck}, got ${ri.extractedPool}/${ri.extractedDeck}`,
      )
    }

    const simulated = simulateCurrentAnomalyList(extracted, realIssues)
    const trueP = simulated.filter((i) => i.matchesRealIssue).length
    const falseP = simulated.length - trueP
    const realCaught = new Set(simulated.filter((i) => i.matchesRealIssue).map((i) => i.card)).size
    const totalReal = new Set(realIssues.map((i) => i.card)).size
    console.log(
      `\n=== ${simulated.length} ISSUES MY CURRENT CODE WOULD SURFACE ===`,
    )
    console.log(
      `   true positives:  ${trueP} (caught ${realCaught}/${totalReal} real issues)`,
    )
    console.log(`   false positives: ${falseP}`)
    for (const s of simulated.slice(0, 12)) {
      const tag = s.matchesRealIssue ? `✓ REAL (${s.realIssueKind})` : '✗ NOISE'
      console.log(`   ${tag.padEnd(20)} ${s.label}`)
    }
    if (simulated.length > 12) console.log(`   ... and ${simulated.length - 12} more`)

    // Section-pool gap analysis (heuristic A)
    console.log(`\n=== SECTION-GAP CHECK (heuristic A) ===`)
    const extPoolBySection = new Map<string, number>()
    const extDeckBySection = new Map<string, number>()
    for (const e of extracted) {
      const card = catalog.get(`${e.name}|${e.subtitle || ''}`)
      if (!card) continue
      const sec = sectionForCard(card)
      if (!sec) continue
      extPoolBySection.set(sec, (extPoolBySection.get(sec) || 0) + e.poolQty)
      extDeckBySection.set(sec, (extDeckBySection.get(sec) || 0) + e.deckQty)
    }
    for (const [sec, st] of sectionTruth) {
      const ep = extPoolBySection.get(sec) || 0
      const ed = extDeckBySection.get(sec) || 0
      const poolDelta = ep - st.pool
      const deckDelta = ed - st.deck
      if (poolDelta !== 0 || deckDelta !== 0) {
        const realInSec = realIssues.filter((ri) => ri.section === sec).length
        console.log(
          `   ${sec.padEnd(11)} pool ${ep} vs truth ${st.pool} (${poolDelta >= 0 ? '+' : ''}${poolDelta}); deck ${ed} vs truth ${st.deck} (${deckDelta >= 0 ? '+' : ''}${deckDelta}); ${realInSec} real issues in this section`,
        )
      }
    }
  }
}

run().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
