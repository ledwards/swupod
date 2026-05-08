/**
 * Run the production extraction code on a fixture, diff against
 * ground truth, print misses (truth>0, ext<truth) and phantoms
 * (ext>0, truth<ext) grouped by section.
 *
 * Usage: npx tsx scripts/diff-fixture.ts <fixture-name>
 */
import * as fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

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

async function run() {
  const fixture = process.argv[2]
  if (!fixture) {
    console.error('Usage: diff-fixture.ts <fixture>')
    process.exit(1)
  }
  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')

  const photo1 = fs.readFileSync(`./scripts/eval/fixtures/${fixture}/photo1.jpg`).toString('base64')
  const photo2 = fs.readFileSync(`./scripts/eval/fixtures/${fixture}/photo2.jpg`).toString('base64')

  const t0 = Date.now()
  const r = await extractPoolFromImagesWholeTable(
    [{ data: photo1, mediaType: 'image/jpeg' }, { data: photo2, mediaType: 'image/jpeg' }],
    { setHint: 'LAW' },
  )
  const elapsed = Date.now() - t0

  // Truth
  const truthPath = `./scripts/eval/fixtures/${fixture}/ground-truth.json`
  const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'))
  const truthByKey = new Map<string, any>()
  for (const t of truth.rows) {
    truthByKey.set(`${t.name}|${t.subtitle || ''}`, t)
  }

  // Catalog for sectioning
  const catalog = JSON.parse(fs.readFileSync('./src/data/cards.json', 'utf8'))
  const lawByKey = new Map<string, any>()
  for (const c of catalog.cards) {
    if (c.set === 'LAW' && c.variantType === 'Normal') {
      lawByKey.set(`${c.name}|${c.subtitle || ''}`, c)
    }
  }

  const ext = r.result.rows

  // Persist the extraction so iteration can replay it without paying Opus again.
  fs.mkdirSync('./scripts/eval/extractions', { recursive: true })
  fs.writeFileSync(
    `./scripts/eval/extractions/${fixture}.json`,
    JSON.stringify({ rows: ext, sectionGaps: r.result.sectionGaps, header: r.result.header }, null, 2),
  )

  const extPoolSum = ext.reduce((s: number, x: any) => s + x.poolQty, 0)
  const extDeckSum = ext.reduce((s: number, x: any) => s + x.deckQty, 0)
  const truthPoolSum = truth.rows.reduce((s: number, x: any) => s + x.poolQty, 0)
  const truthDeckSum = truth.rows.reduce((s: number, x: any) => s + x.deckQty, 0)

  console.log(`\n========== ${fixture} ==========`)
  console.log(`Wall: ${elapsed}ms`)
  console.log(`Pool: extracted=${extPoolSum}/${truthPoolSum}  Deck: extracted=${extDeckSum}/${truthDeckSum}`)

  // Per-name diff (using full key name|subtitle)
  const extByKey = new Map<string, any>()
  for (const e of ext) {
    extByKey.set(`${(e as any).name}|${(e as any).subtitle || ''}`, e)
  }

  type Diff = { kind: 'miss' | 'phantom'; key: string; section: string; name: string; subtitle: string | null; truthPool: number; extPool: number; truthDeck: number; extDeck: number }
  const diffs: Diff[] = []

  // Walk truth → find misses
  for (const t of truth.rows) {
    const key = `${t.name}|${t.subtitle || ''}`
    const e = extByKey.get(key) as any
    const card = lawByKey.get(key)
    const sec = sectionOf(card)
    const ePool = e?.poolQty ?? 0
    const eDeck = e?.deckQty ?? 0
    if (t.poolQty > ePool) {
      diffs.push({ kind: 'miss', key, section: sec, name: t.name, subtitle: t.subtitle, truthPool: t.poolQty, extPool: ePool, truthDeck: t.deckQty, extDeck: eDeck })
    }
    if (e && ePool > t.poolQty) {
      diffs.push({ kind: 'phantom', key, section: sec, name: t.name, subtitle: t.subtitle, truthPool: t.poolQty, extPool: ePool, truthDeck: t.deckQty, extDeck: eDeck })
    }
  }
  // Walk ext → find phantoms not in truth at all
  for (const e of ext) {
    const eAny = e as any
    const key = `${eAny.name}|${eAny.subtitle || ''}`
    if (!truthByKey.has(key) && (eAny.poolQty > 0 || eAny.deckQty > 0)) {
      const card = lawByKey.get(key)
      const sec = sectionOf(card)
      diffs.push({ kind: 'phantom', key, section: sec, name: eAny.name, subtitle: eAny.subtitle, truthPool: 0, extPool: eAny.poolQty, truthDeck: 0, extDeck: eAny.deckQty })
    }
  }

  // Section deltas
  const truthBySec = new Map<string, { pool: number; deck: number }>()
  for (const t of truth.rows) {
    const key = `${t.name}|${t.subtitle || ''}`
    const card = lawByKey.get(key)
    if (!card) continue
    const sec = sectionOf(card)
    if (!truthBySec.has(sec)) truthBySec.set(sec, { pool: 0, deck: 0 })
    const s = truthBySec.get(sec)!
    s.pool += t.poolQty
    s.deck += t.deckQty
  }
  const extBySec = new Map<string, { pool: number; deck: number }>()
  for (const e of ext) {
    const eAny = e as any
    const key = `${eAny.name}|${eAny.subtitle || ''}`
    const card = lawByKey.get(key)
    if (!card) continue
    const sec = sectionOf(card)
    if (!extBySec.has(sec)) extBySec.set(sec, { pool: 0, deck: 0 })
    const s = extBySec.get(sec)!
    s.pool += eAny.poolQty
    s.deck += eAny.deckQty
  }

  console.log(`\n=== SECTION DELTAS (extraction - truth) ===`)
  const allSecs = ['Leaders', 'Bases', 'Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy', 'Multicolor', 'NoAspect']
  for (const sec of allSecs) {
    const t = truthBySec.get(sec) || { pool: 0, deck: 0 }
    const e = extBySec.get(sec) || { pool: 0, deck: 0 }
    const dp = e.pool - t.pool
    const dd = e.deck - t.deck
    if (dp !== 0 || dd !== 0) {
      const dpS = dp > 0 ? `+${dp}` : `${dp}`
      const ddS = dd > 0 ? `+${dd}` : `${dd}`
      console.log(`  ${sec.padEnd(11)} pool ${e.pool}/${t.pool} (${dpS})  deck ${e.deck}/${t.deck} (${ddS})`)
    }
  }

  console.log(`\n=== POOL MISSES (truth_pool > extracted_pool) ===`)
  for (const d of diffs.filter((x) => x.kind === 'miss')) {
    if (d.truthPool > d.extPool) {
      const sub = d.subtitle ? ` — ${d.subtitle}` : ''
      console.log(`  [${d.section.padEnd(11)}] ${d.name}${sub}  truth=${d.truthPool} ext=${d.extPool}`)
    }
  }

  console.log(`\n=== POOL PHANTOMS (extracted_pool > truth_pool) ===`)
  for (const d of diffs.filter((x) => x.kind === 'phantom')) {
    if (d.extPool > d.truthPool) {
      const sub = d.subtitle ? ` — ${d.subtitle}` : ''
      console.log(`  [${d.section.padEnd(11)}] ${d.name}${sub}  truth=${d.truthPool} ext=${d.extPool}`)
    }
  }

  console.log(`\n=== DECK MISCOUNTS ===`)
  // Deck cells where truth != extracted
  for (const t of truth.rows) {
    const key = `${t.name}|${t.subtitle || ''}`
    const e = extByKey.get(key) as any
    const eDeck = e?.deckQty ?? 0
    if (t.deckQty !== eDeck) {
      const card = lawByKey.get(key)
      const sec = sectionOf(card)
      const sub = t.subtitle ? ` — ${t.subtitle}` : ''
      const dir = eDeck > t.deckQty ? '+' : '-'
      console.log(`  [${sec.padEnd(11)}] ${dir} ${t.name}${sub}  truth=${t.deckQty} ext=${eDeck}`)
    }
  }
}

run().catch((e) => { console.error('FAILED:', e); process.exit(1) })
