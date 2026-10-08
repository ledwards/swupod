/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A/B test the HEIC conversion paths against sq-lee-law ground truth.
 *
 * Inputs (HEIC pair):
 *   /Users/lee/Downloads/IMG_3187.HEIC
 *   /Users/lee/Downloads/IMG_3188.HEIC
 *
 * Three runs:
 *   A. JPG baseline    — fixtures/sq-lee-law/photo1.jpg + photo2.jpg
 *      (uses cached scripts/eval/extractions/sq-lee-law.json — no API call)
 *   B. HEIC OLD path   — heic-convert at quality 0.85 (the regression)
 *   C. HEIC NEW path   — sharp.rotate().jpeg({quality:100}) first,
 *                        heic-convert@1 fallback
 *
 * Diff each against ground-truth.json. Count per-cell errors (truth vs extracted
 * for both poolQty and deckQty across every row). Report.
 */
import * as fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

// Args: <fixture> <heic1> <heic2>  (defaults: sq-lee-law / IMG_3187 / IMG_3188)
const FIXTURE = process.argv[2] || 'sq-lee-law'
const HEIC1 = process.argv[3] || '/Users/lee/Downloads/IMG_3187.HEIC'
const HEIC2 = process.argv[4] || '/Users/lee/Downloads/IMG_3188.HEIC'

interface ExtractedRow {
  name: string
  subtitle: string | null
  poolQty: number
  deckQty: number
}

function rowKey(r: { name: string; subtitle: string | null }) {
  return `${r.name}|${r.subtitle || ''}`
}

function diffAgainstTruth(
  rows: ExtractedRow[],
  truthRows: ExtractedRow[],
): { poolErrors: number; deckErrors: number; missed: number; phantom: number; sumPool: number; sumDeck: number } {
  const truthByKey = new Map<string, ExtractedRow>()
  truthRows.forEach((r) => truthByKey.set(rowKey(r), r))
  const extByKey = new Map<string, ExtractedRow>()
  rows.forEach((r) => extByKey.set(rowKey(r), r))

  let poolErrors = 0
  let deckErrors = 0
  let missed = 0
  let phantom = 0

  // Cells where truth has a row
  for (const t of truthRows) {
    const e = extByKey.get(rowKey(t))
    const ePool = e?.poolQty || 0
    const eDeck = e?.deckQty || 0
    if (ePool !== t.poolQty) poolErrors++
    if (eDeck !== t.deckQty) deckErrors++
    if (t.poolQty > 0 && ePool === 0) missed++
  }
  // Phantoms: extracted has poolQty>0 where truth doesn't have the row OR has poolQty=0
  for (const e of rows) {
    const t = truthByKey.get(rowKey(e))
    if ((!t || t.poolQty === 0) && e.poolQty > 0) phantom++
  }

  const sumPool = rows.reduce((s, r) => s + r.poolQty, 0)
  const sumDeck = rows.reduce((s, r) => s + r.deckQty, 0)
  return { poolErrors, deckErrors, missed, phantom, sumPool, sumDeck }
}

async function convertHeicOldPath(buffer: Buffer): Promise<Buffer> {
  const convert = (await import('heic-convert')).default
  const arrayBuffer = await convert({ buffer, format: 'JPEG', quality: 0.85 })
  return Buffer.from(arrayBuffer)
}

async function convertHeicNewPath(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default
    return await sharp(buffer).rotate().jpeg({ quality: 100 }).toBuffer()
  } catch {
    const convert = (await import('heic-convert')).default
    const arrayBuffer = await convert({ buffer, format: 'JPEG', quality: 1 })
    return Buffer.from(arrayBuffer)
  }
}

async function runExtraction(jpegs: Buffer[], label: string) {
  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')
  console.log(`\n[${label}] running extraction (${jpegs.length} images, total ${jpegs.reduce((s, b) => s + b.length, 0)} bytes)...`)
  const t0 = Date.now()
  const r = await extractPoolFromImagesWholeTable(
    jpegs.map((b) => ({ data: b.toString('base64'), mediaType: 'image/jpeg' })),
    { setHint: 'LAW' },
  )
  const elapsed = Date.now() - t0
  console.log(`[${label}] done in ${elapsed}ms — ${r.result.rows.length} rows`)
  return r.result.rows as ExtractedRow[]
}

async function run() {
  // Truth
  const truth = JSON.parse(fs.readFileSync(`./scripts/eval/fixtures/${FIXTURE}/ground-truth.json`, 'utf8'))
  const truthRows: ExtractedRow[] = truth.rows
  console.log(`Ground truth: ${truthRows.length} rows`)

  // A. JPG baseline (cached) — only if there is one
  let a: ReturnType<typeof diffAgainstTruth> | null = null
  const cachedPath = `./scripts/eval/extractions/${FIXTURE}.json`
  if (fs.existsSync(cachedPath)) {
    const cached = JSON.parse(fs.readFileSync(cachedPath, 'utf8'))
    a = diffAgainstTruth(cached.rows, truthRows)
    console.log(`\n=== A: JPG baseline (cached) ===`)
    console.log(JSON.stringify(a, null, 2))
  } else {
    console.log(`\n=== A: JPG baseline — no cached extraction at ${cachedPath}, skipping ===`)
  }

  // Read HEICs
  const heic1 = fs.readFileSync(HEIC1)
  const heic2 = fs.readFileSync(HEIC2)
  console.log(`\nHEIC sizes: ${heic1.length} + ${heic2.length} bytes`)

  // B. OLD path
  console.log(`\nConverting via OLD path (heic-convert@0.85)...`)
  const oldJpegs = await Promise.all([convertHeicOldPath(heic1), convertHeicOldPath(heic2)])
  console.log(`OLD JPG sizes: ${oldJpegs.map((b) => b.length).join(' + ')}`)
  const oldRows = await runExtraction(oldJpegs, 'OLD heic@0.85')
  const b = diffAgainstTruth(oldRows, truthRows)
  console.log(`\n=== B: HEIC via OLD path (heic-convert@0.85) ===`)
  console.log(JSON.stringify(b, null, 2))

  // C. NEW path
  console.log(`\nConverting via NEW path (sharp.rotate.jpeg@100, fallback heic-convert@1)...`)
  const newJpegs = await Promise.all([convertHeicNewPath(heic1), convertHeicNewPath(heic2)])
  console.log(`NEW JPG sizes: ${newJpegs.map((b) => b.length).join(' + ')}`)
  const newRows = await runExtraction(newJpegs, 'NEW sharp@100')
  const c = diffAgainstTruth(newRows, truthRows)
  console.log(`\n=== C: HEIC via NEW path (sharp@100) ===`)
  console.log(JSON.stringify(c, null, 2))

  // Summary
  console.log(`\n=========== SUMMARY (${FIXTURE}) ===========`)
  console.log(`             pool sum  deck sum  pool errors  deck errors  missed  phantoms`)
  const rows: Array<readonly [string, ReturnType<typeof diffAgainstTruth>]> = []
  if (a) rows.push(['A. JPG baseline      ', a] as const)
  rows.push(['B. HEIC old (0.85)   ', b] as const)
  rows.push(['C. HEIC new (sharp@100)', c] as const)
  for (const [label, d] of rows) {
    console.log(
      `${label} ${String(d.sumPool).padStart(8)}  ${String(d.sumDeck).padStart(8)}  ${String(d.poolErrors).padStart(11)}  ${String(d.deckErrors).padStart(11)}  ${String(d.missed).padStart(6)}  ${String(d.phantom).padStart(8)}`,
    )
  }
  console.log(`Truth pool sum: ${truthRows.reduce((s, r) => s + r.poolQty, 0)}, Truth deck sum: ${truthRows.reduce((s, r) => s + r.deckQty, 0)}`)

  // Save extractions for later inspection
  const outDir = `./scripts/eval/heic-ab/${FIXTURE}`
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(`${outDir}/old.json`, JSON.stringify({ rows: oldRows }, null, 2))
  fs.writeFileSync(`${outDir}/new.json`, JSON.stringify({ rows: newRows }, null, 2))
  console.log(`\nSaved B and C extraction outputs under ${outDir}/`)
}

run().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
