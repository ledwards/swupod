/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Per-operation model eval for the Import Pool pipeline.
 *
 * run-eval.ts scores the whole pipeline on one model. This scores each
 * extraction OPERATION on its own, on the same fixtures, so each operation
 * can be routed to the cheapest model that holds its accuracy
 * (src/services/importPool/importModels.ts):
 *
 *   omr    — classifyTableWithClaude on each OMR-sidecar table crop (prod path)
 *   table  — extractTableFromCrop, one sample, on the same table's bounds
 *            cropped from the original photo (legacy-fallback prompt)
 *   phase1 — runPhase1 on the preprocessed photos: header + table bounds
 *
 * Everything but the model is held fixed: the sidecar runs once per fixture
 * (cached under results/sidecar-cache/), and every model reads the same
 * crops.
 *
 * Metrics
 *   omr / table: per-cell combined accuracy, (poolCorrect + deckCorrect) /
 *     (2 × cards), over every card in every detected table — the metric of
 *     plans/IMPORT_POOL_OMR_REPORT.md.
 *   phase1: mean IoU of each Phase-1 table box against the sidecar's
 *     fiducial-warped box (a missing table scores 0), plus whether the
 *     header leader / base match the fixture's deck leader / base.
 *
 * Usage
 *   OPS=omr MODELS=claude-opus-5-5,claude-sonnet-5-5 npx tsx scripts/eval/run-ops.ts
 *   FIXTURE=sq-tom-law RUNS=2 ... # one fixture, repeat each model
 *   PHOTOS_DIR=... # where photo1/photo2 live (default: this checkout, then the main checkout)
 *
 * Writes a JSON summary to scripts/eval/results/ops-<timestamp>.json.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { costUsd, fmtTokens } from './pricing'

const REPO_ROOT = process.env.REPO_ROOT || process.cwd()
const FIXTURES_DIR = join(REPO_ROOT, 'scripts/eval/fixtures')
const RESULTS_DIR = join(REPO_ROOT, 'scripts/eval/results')
const SIDECAR_CACHE = join(RESULTS_DIR, 'sidecar-cache')
const MAIN_CHECKOUT_FIXTURES = '/Users/lee/Repos/ledwards/swupod/scripts/eval/fixtures'

// Only the API key is taken from env files; nothing else in them is needed.
for (const envPath of ['.env.local', '.env'].flatMap((f) => [join(REPO_ROOT, f), join('/Users/lee/Repos/ledwards/swupod', f)])) {
  if (process.env.ANTHROPIC_API_KEY) break
  try {
    const m = readFileSync(envPath, 'utf8').match(/^ANTHROPIC_API_KEY=(.*)$/m)
    if (m) process.env.ANTHROPIC_API_KEY = m[1].trim().replace(/^["']|["']$/g, '')
  } catch {}
}

const OPS = (process.env.OPS || 'omr').split(',').map((s) => s.trim()) as Array<'omr' | 'table' | 'phase1'>
const MODELS = (process.env.MODELS || 'claude-opus-5-5').split(',').map((s) => s.trim())
const RUNS = Number(process.env.RUNS || 1)

type Usage = { apiCalls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; cacheCreation1hTokens?: number }

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function photoPath(fixture: string, file: string): string | null {
  for (const dir of [process.env.PHOTOS_DIR, FIXTURES_DIR, MAIN_CHECKOUT_FIXTURES]) {
    if (!dir) continue
    const p = join(dir, fixture, file)
    if (existsSync(p)) return p
  }
  return null
}

function iou(a: any, b: any): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  const inter = ix * iy
  const area = (r: any) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0)
  const union = area(a) + area(b) - inter
  return union > 0 ? inter / union : 0
}

async function main() {
  const { getImportClient, runPhase1 } = await import('../../lib/anthropic')
  const { classifyTableWithClaude, runOmrSidecar } = await import('../../src/services/importPool/omrExtraction')
  const { extractTableFromCrop, cropOriginalAndPreprocess } = await import(
    '../../src/services/importPool/sectionExtraction'
  )
  const { preprocessImageForExtraction } = await import('../../src/services/importPool/preprocessImage')
  const { groupCardsByTable } = await import('../../src/services/importPool/tableGrouping')
  const { getCachedCards, initializeCardCache } = await import('../../src/utils/cardCache')
  const { addResponseUsage, newExtractUsage } = await import('../../src/services/importPool/extractUsage')
  await initializeCardCache().catch(() => {})
  const client = getImportClient()

  const fixtures = (process.env.FIXTURE ? [process.env.FIXTURE] : readdirSync(FIXTURES_DIR)).filter((f) =>
    existsSync(join(FIXTURES_DIR, f, 'ground-truth.json')),
  )
  mkdirSync(SIDECAR_CACHE, { recursive: true })

  // results[op][model] = per-run aggregates
  const results: Record<string, Record<string, any>> = {}

  for (const fixture of fixtures) {
    const truth = JSON.parse(readFileSync(join(FIXTURES_DIR, fixture, 'ground-truth.json'), 'utf8'))
    truth.setCode ??= truth.meta?.setCode
    if (!truth.rows?.length || truth._note) {
      console.log(`skip ${fixture}: unverified or empty truth`)
      continue
    }
    const p1 = photoPath(fixture, 'photo1.jpg')
    const p2 = photoPath(fixture, 'photo2.jpg')
    if (!p1 || !p2) {
      console.log(`skip ${fixture}: photos not found`)
      continue
    }
    const originals = [readFileSync(p1), readFileSync(p2)]

    const cachePath = join(SIDECAR_CACHE, `${fixture}.json`)
    let sidecar: any
    if (existsSync(cachePath)) sidecar = JSON.parse(readFileSync(cachePath, 'utf8'))
    else {
      sidecar = await runOmrSidecar(originals)
      writeFileSync(cachePath, JSON.stringify(sidecar))
    }

    const cards = (getCachedCards(truth.setCode) || []).filter((c: any) => c.variantType === 'Normal')
    const groups = groupCardsByTable(cards)
    // Truth by card number. Match on type+name+subtitle first (LAW has
    // leader/unit pairs that share a name), then type+name.
    const truthByNumber = new Map<number, { pool: number; deck: number }>()
    let unmatchedTruth = 0
    for (const row of truth.rows) {
      const hit =
        cards.find((c: any) => c.type === row.type && norm(c.name) === norm(row.name) && norm(c.subtitle) === norm(row.subtitle)) ||
        cards.find((c: any) => c.type === row.type && norm(c.name) === norm(row.name))
      if (!hit) {
        unmatchedTruth++
        continue
      }
      truthByNumber.set(Number(hit.number), { pool: Number(row.poolQty), deck: Number(row.deckQty) })
    }
    const deckLeader = truth.rows.find((r: any) => r.type === 'Leader' && r.deckQty > 0)
    const deckBase = truth.rows.find((r: any) => r.type === 'Base' && r.deckQty > 0)
    console.log(
      `\n=== ${fixture} (${truth.setCode}) — ${sidecar.tables.length} sidecar tables, ${truthByNumber.size} truth rows` +
        (unmatchedTruth ? `, ${unmatchedTruth} truth rows not in card cache` : ''),
    )

    let preprocessed: any[] | null = null

    for (const op of OPS) {
      for (const model of MODELS) {
        for (let run = 0; run < RUNS; run++) {
          const usage = newExtractUsage()
          const slot = ((results[op] ??= {})[model] ??= { runs: [] as any[] })
          const runAgg = (slot.runs[run] ??= { cells: 0, correct: 0, poolCorrect: 0, deckCorrect: 0, iouSum: 0, iouN: 0, headerHits: 0, headerN: 0, errors: 0, usage: newExtractUsage(), fixtures: {} as Record<string, number> })
          process.env.IMPORT_EXTRACT_MODEL = model
          const start = Date.now()
          let fixtureCells = 0
          let fixtureCorrect = 0

          if (op === 'phase1') {
            if (!preprocessed) {
              preprocessed = []
              for (const b of originals) preprocessed.push({ data: (await preprocessImageForExtraction(b)).toString('base64'), mediaType: 'image/jpeg' })
            }
            try {
              const r = await runPhase1(client, preprocessed, truth.setCode)
              addResponseUsage(usage, r.usage, r.servedBy)
              for (const t of sidecar.tables) {
                const box = (r.sections || []).find((s: any) => s.name === t.name && s.photoIndex === t.photo_index)
                runAgg.iouSum += box ? iou(box, t.bounds_original) : 0
                runAgg.iouN++
              }
              if (deckLeader) {
                runAgg.headerN++
                if (norm(r.header?.leader?.name) === norm(deckLeader.name)) runAgg.headerHits++
              }
              if (deckBase) {
                runAgg.headerN++
                if (norm(r.header?.base?.name) === norm(deckBase.name)) runAgg.headerHits++
              }
            } catch (err) {
              runAgg.errors++
              console.warn(`  [${op} ${model}] ${(err as Error).message}`)
            }
          } else {
            await Promise.all(
              sidecar.tables.map(async (t: any) => {
                const tableCards = (groups.get(t.name) || []) as any[]
                if (tableCards.length === 0) return
                let pred = new Map<number, { pool: number; deck: number }>()
                try {
                  if (op === 'omr') {
                    const rows = await classifyTableWithClaude(client, t.name, tableCards, t.image_b64, usage)
                    for (const r of rows) pred.set(r.cardNumber, { pool: r.poolQty, deck: r.deckQty })
                  } else {
                    const crop = await cropOriginalAndPreprocess(originals[t.photo_index], t.bounds_original)
                    const r = await extractTableFromCrop(client, crop, t.name, tableCards, truth.setCode, undefined, usage)
                    for (const row of r.rows) pred.set(row.cardNumber, { pool: row.poolQty, deck: row.deckQty })
                  }
                } catch (err) {
                  runAgg.errors++
                  pred = new Map()
                  console.warn(`  [${op} ${model}] ${t.name}: ${(err as Error).message}`)
                }
                for (const c of tableCards) {
                  const n = Number(c.number)
                  const want = truthByNumber.get(n) || { pool: 0, deck: 0 }
                  const got = pred.get(n) || { pool: 0, deck: 0 }
                  const pc = Number(got.pool === want.pool)
                  const dc = Number(got.deck === want.deck)
                  runAgg.cells += 2
                  runAgg.poolCorrect += pc
                  runAgg.deckCorrect += dc
                  runAgg.correct += pc + dc
                  fixtureCells += 2
                  fixtureCorrect += pc + dc
                }
              }),
            )
          }

          for (const k of ['apiCalls', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'cacheCreation1hTokens'] as const) runAgg.usage[k] = (runAgg.usage[k] || 0) + (usage[k] || 0)
          const cost = costUsd(model, usage) ?? NaN
          const acc = op === 'phase1' ? '' : ` acc=${((fixtureCorrect / Math.max(1, fixtureCells)) * 100).toFixed(1)}%`
          if (op !== 'phase1') runAgg.fixtures[fixture] = fixtureCorrect / Math.max(1, fixtureCells)
          console.log(`  ${op.padEnd(6)} ${model.padEnd(18)} run${run + 1}${acc} ${fmtTokens(usage)} $${cost.toFixed(3)} ${((Date.now() - start) / 1000).toFixed(0)}s`)
        }
      }
    }
  }

  console.log('\n================ SUMMARY ================')
  const summary: any = {}
  for (const [op, byModel] of Object.entries(results)) {
    for (const [model, slot] of Object.entries(byModel)) {
      const runs = slot.runs.map((r: any) => {
        const nFix = Object.keys(r.fixtures).length || fixtures.length
        const cost = costUsd(model, r.usage as Usage) ?? NaN
        return {
          accuracy: r.cells ? r.correct / r.cells : null,
          poolAccuracy: r.cells ? r.poolCorrect / (r.cells / 2) : null,
          deckAccuracy: r.cells ? r.deckCorrect / (r.cells / 2) : null,
          meanIoU: r.iouN ? r.iouSum / r.iouN : null,
          headerAccuracy: r.headerN ? r.headerHits / r.headerN : null,
          errors: r.errors,
          costTotal: cost,
          costPerImport: cost / nFix,
          usage: r.usage,
          perFixture: r.fixtures,
        }
      })
      ;(summary[op] ??= {})[model] = runs
      for (const [i, r] of runs.entries()) {
        const head =
          op === 'phase1'
            ? `IoU=${r.meanIoU?.toFixed(3)} header=${((r.headerAccuracy ?? 0) * 100).toFixed(0)}%`
            : `acc=${((r.accuracy ?? 0) * 100).toFixed(2)}% (pool ${((r.poolAccuracy ?? 0) * 100).toFixed(1)} / deck ${((r.deckAccuracy ?? 0) * 100).toFixed(1)})`
        console.log(`${op.padEnd(6)} ${model.padEnd(18)} run${i + 1} ${head} errors=${r.errors} $/import=${r.costPerImport.toFixed(4)} total=$${r.costTotal.toFixed(3)}`)
      }
    }
  }
  mkdirSync(RESULTS_DIR, { recursive: true })
  const out = join(RESULTS_DIR, `ops-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(out, JSON.stringify({ ops: OPS, models: MODELS, runs: RUNS, fixtures, summary }, null, 2))
  console.log(`\nsaved ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
