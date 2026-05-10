/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pipeline eval harness.
 *
 * Runs a configurable preprocessing pipeline across all 5 fixtures
 * (3 JPG + 2 HEIC) and diffs each extraction against ground truth. Emits a
 * per-fixture and aggregate error count so we can compare different
 * pipelines apples-to-apples.
 *
 * Usage:
 *   npx tsx scripts/eval-pipelines.ts                # runs the configured set
 *   npx tsx scripts/eval-pipelines.ts <pipelineName> # just one
 */
import * as fs from 'fs'
import * as dotenv from 'dotenv'
import sharp from 'sharp'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

interface FixtureSpec {
  name: string
  files: string[] // relative paths to image files inside scripts/eval/fixtures/<name>
  isHeic?: boolean
}

const FIXTURES: FixtureSpec[] = [
  { name: 'sq-tom-law', files: ['photo1.jpg', 'photo2.jpg'] },
  { name: 'sq-lee-law', files: ['photo1.jpg', 'photo2.jpg'] },
  { name: 'casual-lee-law', files: ['photo1.jpg', 'photo2.jpg'] },
  { name: 'sfpq-lee-law', files: ['photo1.jpg', 'photo2.jpg'] },
  // HEIC pairs Lee dropped at /Users/lee/Downloads. The pool/truth is the
  // same as casual-lee-law / sq-lee-law respectively — different formats
  // exercise the HEIC conversion path.
  { name: 'sq-lee-law-heic', files: ['/Users/lee/Downloads/IMG_3187.HEIC', '/Users/lee/Downloads/IMG_3188.HEIC'], isHeic: true },
  { name: 'local-lee-law', files: ['/Users/lee/Downloads/IMG_3209.HEIC', '/Users/lee/Downloads/IMG_3210.HEIC'], isHeic: true },
  { name: 'sfpq-lee-law-heic', files: ['/Users/lee/Downloads/IMG_3239.HEIC', '/Users/lee/Downloads/IMG_3240.HEIC'], isHeic: true },
]

// Map fixture → which fixture's ground-truth.json to use. HEIC fixtures
// share truth with their JPG counterparts (same pool, same handwriting).
const TRUTH_FOR: Record<string, string> = {
  'sq-tom-law': 'sq-tom-law',
  'sq-lee-law': 'sq-lee-law',
  'casual-lee-law': 'casual-lee-law',
  'sfpq-lee-law': 'sfpq-lee-law',
  'sq-lee-law-heic': 'sq-lee-law',
  'local-lee-law': 'local-lee-law', // already a copy of casual-lee-law's
  'sfpq-lee-law-heic': 'sfpq-lee-law',
}

// === Pipelines ===
//
// A Pipeline is a function (rawBuffer, isHeic) → finalJpegBuffer ready to
// hand to Claude. The harness hands these final buffers to
// extractPoolFromImagesWholeTable with skipPreprocess=true so the function's
// internal preprocessImageForExtraction doesn't run a second pass.

type Pipeline = {
  name: string
  description: string
  apply: (buf: Buffer, isHeic: boolean) => Promise<Buffer>
}

const MAX_DIM = 2576

async function decodeHeicViaConvert(buf: Buffer, quality = 0.85): Promise<Buffer> {
  const convert = (await import('heic-convert')).default
  const ab = await convert({ buffer: buf, format: 'JPEG', quality })
  return Buffer.from(ab)
}

async function autoOrientToPortrait(buf: Buffer): Promise<Buffer> {
  const exifRotated = await sharp(buf).rotate().toBuffer()
  const meta = await sharp(exifRotated).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w === 0 || h === 0) return exifRotated
  if (w > h) return await sharp(exifRotated).rotate(90).toBuffer()
  return exifRotated
}

/** "production-actual" — closest match to what runs on Railway.
 *  In production extractPoolFromImagesWholeTable's runOmrSidecar consumes
 *  ORIGINAL buffers (raw upload bytes, post HEIC→JPG only). preprocess
 *  only applies to the Phase 1 / header call, not to the per-table calls
 *  that drive the actual cell reads. So a faithful baseline does just the
 *  HEIC decode (or nothing for JPG) — no orient, resize, or sharpen here.
 */
const baselinePipeline: Pipeline = {
  name: 'baseline',
  description: 'Production-actual: HEIC→JPG via heic-convert@0.85, JPG passthrough. No orient/resize/sharpen.',
  apply: async (buf, isHeic) => {
    return isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
  },
}

/** "preprocessed" — apply the production preprocessImageForExtraction
 *  pipeline to BOTH phase 1 AND the OMR sidecar input. Tests whether
 *  feeding the sidecar pre-sharpened bytes helps the per-table reads.
 *  This is what my prior "baseline" was inadvertently testing. */
const preprocessedPipeline: Pipeline = {
  name: 'preprocessed',
  description: 'baseline + orient + resize 2576 + sharpen σ1.0 + jpeg q95 (also fed to sidecar)',
  apply: async (buf, isHeic) => {
    const decoded = isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    const oriented = await autoOrientToPortrait(decoded)
    return await sharp(oriented)
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .sharpen({ sigma: 1.0 })
      .jpeg({ quality: 95 })
      .toBuffer()
  },
}

// === Diff helpers ===

interface ExtractedRow {
  name: string
  subtitle: string | null
  poolQty: number
  deckQty: number
}
function rowKey(r: { name: string; subtitle: string | null }) {
  return `${r.name}|${r.subtitle || ''}`
}
function diffAgainstTruth(rows: ExtractedRow[], truthRows: ExtractedRow[]) {
  const truthByKey = new Map<string, ExtractedRow>()
  truthRows.forEach((r) => truthByKey.set(rowKey(r), r))
  const extByKey = new Map<string, ExtractedRow>()
  rows.forEach((r) => extByKey.set(rowKey(r), r))
  let poolErrors = 0
  let deckErrors = 0
  let missed = 0
  let phantom = 0
  for (const t of truthRows) {
    const e = extByKey.get(rowKey(t))
    const ep = e?.poolQty || 0
    const ed = e?.deckQty || 0
    if (ep !== t.poolQty) poolErrors++
    if (ed !== t.deckQty) deckErrors++
    if (t.poolQty > 0 && ep === 0) missed++
  }
  for (const e of rows) {
    const t = truthByKey.get(rowKey(e))
    if ((!t || t.poolQty === 0) && e.poolQty > 0) phantom++
  }
  const sumPool = rows.reduce((s, r) => s + r.poolQty, 0)
  const sumDeck = rows.reduce((s, r) => s + r.deckQty, 0)
  return { poolErrors, deckErrors, missed, phantom, sumPool, sumDeck }
}

interface RunResult {
  fixture: string
  truthPool: number
  truthDeck: number
  result: ReturnType<typeof diffAgainstTruth>
  totalErrors: number
  elapsedMs: number
}

async function runPipelineOnFixture(pipeline: Pipeline, fixture: FixtureSpec): Promise<RunResult> {
  const sourceBuffers = fixture.files.map((p) => {
    const full = p.startsWith('/') ? p : `./scripts/eval/fixtures/${fixture.name}/${p}`
    return fs.readFileSync(full)
  })

  // Phase 1 input: always a small preprocessed JPEG (resize 2576, σ1.0,
  // q95) — this just feeds the header+bounds detector, which has a
  // payload limit. Crashes with raw 4284x5712 camera JPGs.
  const phase1Buffers: Buffer[] = []
  for (const buf of sourceBuffers) {
    const decoded = fixture.isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    const oriented = await autoOrientToPortrait(decoded)
    phase1Buffers.push(
      await sharp(oriented)
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
        .sharpen({ sigma: 1.0 })
        .jpeg({ quality: 95 })
        .toBuffer(),
    )
  }

  // Sidecar input: this is where the per-table reads happen and what the
  // pipeline experiments actually vary.
  const sidecarBuffers: Buffer[] = []
  for (const buf of sourceBuffers) {
    sidecarBuffers.push(await pipeline.apply(buf, !!fixture.isHeic))
  }

  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')
  const t0 = Date.now()
  const r = await extractPoolFromImagesWholeTable(
    phase1Buffers.map((b) => ({ data: b.toString('base64'), mediaType: 'image/jpeg' })),
    { setHint: 'LAW', skipPreprocess: true, sidecarBuffers },
  )
  const elapsedMs = Date.now() - t0

  const truthPath = `./scripts/eval/fixtures/${TRUTH_FOR[fixture.name]}/ground-truth.json`
  const truth = JSON.parse(fs.readFileSync(truthPath, 'utf8'))
  const truthRows: ExtractedRow[] = truth.rows
  const result = diffAgainstTruth(r.result.rows as ExtractedRow[], truthRows)
  const totalErrors = result.poolErrors + result.deckErrors
  return {
    fixture: fixture.name,
    truthPool: truthRows.reduce((s: number, r: ExtractedRow) => s + r.poolQty, 0),
    truthDeck: truthRows.reduce((s: number, r: ExtractedRow) => s + r.deckQty, 0),
    result,
    totalErrors,
    elapsedMs,
  }
}

async function runPipeline(pipeline: Pipeline): Promise<RunResult[]> {
  console.log(`\n▶ Pipeline: ${pipeline.name}`)
  console.log(`  ${pipeline.description}`)
  const results: RunResult[] = []
  for (const f of FIXTURES) {
    process.stdout.write(`  ${f.name.padEnd(20)} … `)
    try {
      const r = await runPipelineOnFixture(pipeline, f)
      results.push(r)
      const totalCells = r.truthPool + r.truthDeck
      const errPct = ((r.totalErrors / Math.max(1, 91 * 2)) * 100).toFixed(1)
      console.log(
        `pool=${r.result.sumPool}/${r.truthPool} deck=${r.result.sumDeck}/${r.truthDeck} pErr=${r.result.poolErrors} dErr=${r.result.deckErrors} miss=${r.result.missed} phant=${r.result.phantom} (${r.elapsedMs}ms)`,
      )
      void errPct
      void totalCells
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`)
    }
  }
  const total = results.reduce((s, r) => s + r.totalErrors, 0)
  const totalMissed = results.reduce((s, r) => s + r.result.missed, 0)
  const totalPhant = results.reduce((s, r) => s + r.result.phantom, 0)
  console.log(`  TOTAL errors: ${total}  (missed=${totalMissed} phantoms=${totalPhant})`)
  return results
}

// Save per-pipeline aggregate so we can compare runs over time
function appendLog(pipeline: Pipeline, results: RunResult[]) {
  const total = results.reduce((s, r) => s + r.totalErrors, 0)
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    pipeline: pipeline.name,
    desc: pipeline.description,
    total,
    perFixture: results.map((r) => ({
      f: r.fixture,
      pE: r.result.poolErrors,
      dE: r.result.deckErrors,
      m: r.result.missed,
      p: r.result.phantom,
      sumP: r.result.sumPool,
      sumD: r.result.sumDeck,
      ms: r.elapsedMs,
    })),
  })
  fs.mkdirSync('./scripts/eval/pipeline-runs', { recursive: true })
  fs.appendFileSync('./scripts/eval/pipeline-runs/log.jsonl', line + '\n')
}

/** Stronger sharpen on the sidecar input. Tests whether adding sharpening
 *  to the camera-original bytes (which the sidecar warps + crops as-is)
 *  reduces missed reads. */
const sharperPipeline: Pipeline = {
  name: 'sharper',
  description: 'baseline + sharpen σ=1.0 (no resize) on sidecar input',
  apply: async (buf, isHeic) => {
    const decoded = isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    return await sharp(decoded).rotate().sharpen({ sigma: 1.0 }).jpeg({ quality: 95 }).toBuffer()
  },
}

/** Higher heic-convert quality. The 0.85 default may be losing tally-mark
 *  detail. Try 1.0 (max) for HEIC fixtures only — JPG fixtures are
 *  identical to baseline. */
const heicQ1Pipeline: Pipeline = {
  name: 'heic-q1',
  description: 'HEIC: heic-convert@1.0 (was 0.85). JPG: passthrough.',
  apply: async (buf, isHeic) => {
    return isHeic ? await decodeHeicViaConvert(buf, 1.0) : buf
  },
}

/** Just orient (no resize / sharpen). The sidecar's load_oriented may not
 *  catch all EXIF cases; pre-orienting via sharp could help. */
const orientPipeline: Pipeline = {
  name: 'orient',
  description: 'baseline + sharp.rotate() (apply EXIF) before sidecar',
  apply: async (buf, isHeic) => {
    const decoded = isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    return await sharp(decoded).rotate().jpeg({ quality: 95 }).toBuffer()
  },
}

/** Light contrast boost without normalise — gentle 1.1× gain, -10 offset.
 *  Goal: nudge the noise floor down so faint marks separate from paper. */
const contrastPipeline: Pipeline = {
  name: 'contrast',
  description: 'baseline + linear(1.1,-10) on sidecar input',
  apply: async (buf, isHeic) => {
    const decoded = isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    return await sharp(decoded).rotate().linear(1.1, -10).jpeg({ quality: 95 }).toBuffer()
  },
}

/** Gamma reduces midtone brightness — nudges pencil tally marks (which sit
 *  in midtones because they're faint grey on white) toward darker, while
 *  keeping bright paper white. Goal: better signal-to-noise on pencil. */
const gammaPipeline: Pipeline = {
  name: 'gamma',
  description: 'baseline + gamma(1.4) on sidecar input — push pencil marks darker',
  apply: async (buf, isHeic) => {
    const decoded = isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    return await sharp(decoded).rotate().gamma(1.4).jpeg({ quality: 95 }).toBuffer()
  },
}

/** Median blur (denoise) before nothing — strip JPEG artifacts and paper
 *  noise without sharpening. Goal: cleaner cell backgrounds, fewer
 *  phantom reads. */
const denoisePipeline: Pipeline = {
  name: 'denoise',
  description: 'baseline + median(3) on sidecar input',
  apply: async (buf, isHeic) => {
    const decoded = isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    return await sharp(decoded).rotate().median(3).jpeg({ quality: 95 }).toBuffer()
  },
}

/** Older-harness "baseline" — preprocessed to BOTH phase 1 AND sidecar.
 *  Documented as worse than production; included so the eval log
 *  remembers why. */
const overpreprocessedPipeline: Pipeline = {
  name: 'overpreprocessed',
  description: 'BAD: orient + resize 2576 + sharpen σ1.0 + jpeg q95 to sidecar',
  apply: async (buf, isHeic) => {
    const decoded = isHeic ? await decodeHeicViaConvert(buf, 0.85) : buf
    const oriented = await autoOrientToPortrait(decoded)
    return await sharp(oriented)
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .sharpen({ sigma: 1.0 })
      .jpeg({ quality: 95 })
      .toBuffer()
  },
}

const largerPipeline = overpreprocessedPipeline // alias for backwards compat

async function main() {
  const only = process.argv[2]
  const allPipelines: Pipeline[] = [
    baselinePipeline,
    preprocessedPipeline,
    sharperPipeline,
    heicQ1Pipeline,
    orientPipeline,
    contrastPipeline,
    gammaPipeline,
    denoisePipeline,
    overpreprocessedPipeline,
    largerPipeline,
  ]
  const toRun = only ? allPipelines.filter((p) => p.name === only) : allPipelines
  if (toRun.length === 0) {
    console.error(`No pipeline matches "${only}". Available: ${allPipelines.map((p) => p.name).join(', ')}`)
    process.exit(1)
  }
  for (const p of toRun) {
    const results = await runPipeline(p)
    appendLog(p, results)
  }
}

// Auto-run main() ONLY when invoked as the entry script. Without this guard,
// any other script that just `import`s this file (for the exports below) ends
// up triggering all the API calls. Painful and expensive lesson.
const isEntryPoint =
  process.argv[1] && process.argv[1].endsWith('eval-pipelines.ts')
if (isEntryPoint) {
  main().catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
}

// Make the exports available so other variants of this file can import
export { Pipeline, FIXTURES, TRUTH_FOR, runPipelineOnFixture, runPipeline, appendLog, baselinePipeline, MAX_DIM, decodeHeicViaConvert, autoOrientToPortrait, diffAgainstTruth }
