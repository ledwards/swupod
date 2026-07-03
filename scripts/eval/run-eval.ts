/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Import-pool extraction eval.
 *
 * For each fixture in scripts/eval/fixtures/<name>/:
 *   - Read photo1.jpg + photo2.jpg
 *   - Run extractPoolFromImages
 *   - Compare result to ground-truth.json
 *   - Score: invariants pass? recall? precision? qty error?
 *
 * Aggregates across fixtures and prints a single report. Optionally saves
 * the raw run to scripts/eval/results/<timestamp>.json so you can diff
 * runs across prompt changes.
 *
 * Usage:
 *   npx tsx scripts/eval/run-eval.ts                 # all fixtures
 *   FIXTURE=sq-tom-law npx tsx scripts/eval/run-eval.ts   # one fixture
 *   MAX_ITER=4 npx tsx scripts/eval/run-eval.ts      # tune the loop cap
 *   SAVE=1 npx tsx scripts/eval/run-eval.ts          # persist to results/
 *
 * A fixture with no photos OR an empty rows[] in ground-truth.json is
 * skipped — that's how the placeholder fixtures (sq-lee-law,
 * local-lee-law) stay out of the way until you fill them in.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

function loadEnvFile(path: string) {
  try {
    const content = readFileSync(path, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {}
}
loadEnvFile('/Users/lee/Repos/ledwards/swupod/.env.local')

// Default to the current checkout so the eval runs correctly from a git
// worktree; override with REPO_ROOT=... if needed.
const REPO_ROOT = process.env.REPO_ROOT || process.cwd()
const FIXTURES_DIR = join(REPO_ROOT, 'scripts/eval/fixtures')
const RESULTS_DIR = join(REPO_ROOT, 'scripts/eval/results')

import { fmtCost, fmtTokens, sumUsage } from './pricing'
// Mirrors the pipeline's model resolution (lib/anthropic.ts + section/omr
// extraction) so cost lines price against the model that actually ran.
const EXTRACT_MODEL = process.env.IMPORT_EXTRACT_MODEL || 'claude-opus-4-7'

interface GroundTruthRow {
  name: string
  subtitle?: string | null
  type: string
  poolQty: number
  deckQty: number
}

interface GroundTruth {
  fixtureName: string
  setCode: string
  expectedTotals: { pool: number; deck: number; leaders: number; bases: number }
  rows: GroundTruthRow[]
  _note?: string
}

interface FixtureScore {
  name: string
  status: 'ok' | 'error' | 'skipped'
  reason?: string
  invariantsPass?: boolean
  invariants?: { poolSum: number; deckSum: number; leaders: number; bases: number }
  truthRows?: number
  modelRows?: number
  truePositives?: number
  falsePositives?: number
  falseNegatives?: number
  recall?: number
  precision?: number
  qtyErrorMean?: number
  qtyErrorMax?: number
  iterations?: number
  converged?: boolean
  bestIteration?: number
  elapsedSec?: number
  usage?: import('./pricing').UsageLike
  perIterCounts?: Array<{ iter: number; pool: number; deck: number; leaders: number; bases: number }>
  iterationFailures?: string[]
  sectionsCount?: number
  tableBreakdown?: Array<{
    table: string
    poolSum: number
    deckSum: number
    rowsMarked: number
    rowsInDeck: number
    rowsTotal: number
  }>
  fpExamples?: Array<{ name: string; subtitle: string | null; poolQty: number; deckQty: number }>
  fnExamples?: Array<{ name: string; subtitle: string | null; poolQty: number; deckQty: number }>
}

function rowKey(r: { name: string; type: string }): string {
  return `${r.type}|${r.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

function fmtPct(n: number | undefined): string {
  if (n == null) return 'n/a'
  return (n * 100).toFixed(1) + '%'
}

async function evalFixture(name: string): Promise<FixtureScore> {
  const dir = join(FIXTURES_DIR, name)
  const photo1 = join(dir, 'photo1.jpg')
  const photo2 = join(dir, 'photo2.jpg')
  const truthPath = join(dir, 'ground-truth.json')

  if (!existsSync(truthPath)) {
    return { name, status: 'skipped', reason: 'no ground-truth.json' }
  }
  let truth: GroundTruth
  try {
    truth = JSON.parse(readFileSync(truthPath, 'utf8'))
  } catch (err) {
    return { name, status: 'error', reason: `ground-truth.json parse: ${(err as Error).message}` }
  }
  if (!truth.rows || truth.rows.length === 0) {
    return { name, status: 'skipped', reason: 'ground-truth.json has empty rows[]' }
  }
  // A _note marks a model-generated STARTER truth awaiting human verification.
  // Scoring against unverified truth poisons the aggregate, so skip it.
  if (truth._note) {
    return { name, status: 'skipped', reason: 'ground truth is an unverified starter (_note present)' }
  }
  if (!existsSync(photo1) || !existsSync(photo2)) {
    return { name, status: 'skipped', reason: 'missing photo1.jpg or photo2.jpg' }
  }

  // EXTRACT_ARCH selects the architecture under test. Default is the one
  // PROD serves (whole-table, ~$0.60/sheet at opus rates); 'legacy' is the
  // multi-sample sidecar-failure fallback ($18/sheet, cache never hits).
  const { extractPoolFromImages, extractPoolFromImagesWholeTable } = await import('../../lib/anthropic')
  const extract =
    (process.env.EXTRACT_ARCH || 'wholetable').toLowerCase() === 'legacy'
      ? extractPoolFromImages
      : extractPoolFromImagesWholeTable
  const p1 = readFileSync(photo1).toString('base64')
  const p2 = readFileSync(photo2).toString('base64')

  const start = Date.now()
  let result: any
  try {
    result = await extract(
      [
        { data: p1, mediaType: 'image/jpeg' },
        { data: p2, mediaType: 'image/jpeg' },
      ],
      { setHint: truth.setCode, maxIterations: Number(process.env.MAX_ITER || 8) },
    )
  } catch (err) {
    return {
      name,
      status: 'error',
      reason: (err as Error).message,
      elapsedSec: (Date.now() - start) / 1000,
    }
  }
  const elapsedSec = (Date.now() - start) / 1000

  const modelMarked = result.result.rows.filter((r: any) => Number(r.poolQty) > 0)
  // Build invariant snapshot from the AGGREGATE rows. The new Phase 1+2
  // architecture stores per-table data in iterations[]; the aggregate is
  // in result.rows.
  const aggPoolSum = modelMarked.reduce((s: number, r: any) => s + Number(r.poolQty), 0)
  const aggDeckSum = modelMarked.reduce((s: number, r: any) => s + Number(r.deckQty), 0)
  const aggLeaders = modelMarked
    .filter((r: any) => r.type === 'Leader')
    .reduce((s: number, r: any) => s + Number(r.poolQty), 0)
  const aggBases = modelMarked
    .filter((r: any) => r.type === 'Base')
    .reduce((s: number, r: any) => s + Number(r.poolQty), 0)
  const bestIter = {
    passing: result.converged,
    poolSum: aggPoolSum,
    deckSum: aggDeckSum,
    leaderCount: aggLeaders,
    baseCount: aggBases,
  }

  // Score: match by name+type key, ignore subtitle for matching (subtitles
  // diverge between extractor and human).
  const truthMap = new Map<string, GroundTruthRow>()
  for (const r of truth.rows) truthMap.set(rowKey(r), r)
  const modelMap = new Map<string, any>()
  for (const r of modelMarked) modelMap.set(rowKey(r), r)

  let tp = 0
  let fp = 0
  let fn = 0
  let qtyErrSum = 0
  let qtyErrCount = 0
  let qtyErrMax = 0
  const fpExamples: FixtureScore['fpExamples'] = []
  const fnExamples: FixtureScore['fnExamples'] = []

  for (const [key, modelRow] of modelMap) {
    const truthRow = truthMap.get(key)
    if (truthRow) {
      tp++
      const poolErr = Math.abs(Number(modelRow.poolQty) - truthRow.poolQty)
      const deckErr = Math.abs(Number(modelRow.deckQty) - truthRow.deckQty)
      qtyErrSum += poolErr + deckErr
      qtyErrCount += 2
      qtyErrMax = Math.max(qtyErrMax, poolErr, deckErr)
    } else {
      fp++
      if (fpExamples!.length < 10) {
        fpExamples!.push({
          name: modelRow.name,
          subtitle: modelRow.subtitle ?? null,
          poolQty: modelRow.poolQty,
          deckQty: modelRow.deckQty,
        })
      }
    }
  }
  for (const [key, truthRow] of truthMap) {
    if (!modelMap.has(key)) {
      fn++
      if (fnExamples!.length < 10) {
        fnExamples!.push({
          name: truthRow.name,
          subtitle: truthRow.subtitle ?? null,
          poolQty: truthRow.poolQty,
          deckQty: truthRow.deckQty,
        })
      }
    }
  }

  const recall = truth.rows.length > 0 ? tp / truth.rows.length : 0
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0

  return {
    name,
    status: 'ok',
    invariantsPass: bestIter.passing,
    invariants: {
      poolSum: bestIter.poolSum,
      deckSum: bestIter.deckSum,
      leaders: bestIter.leaderCount,
      bases: bestIter.baseCount,
    },
    truthRows: truth.rows.length,
    modelRows: modelMarked.length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    recall,
    precision,
    qtyErrorMean: qtyErrCount > 0 ? qtyErrSum / qtyErrCount : 0,
    qtyErrorMax: qtyErrMax,
    iterations: result.iterations.length,
    converged: result.converged,
    bestIteration: result.bestIteration,
    elapsedSec,
    usage: result.usage,
    perIterCounts: result.iterations.map((it: any) => ({
      iter: it.iteration,
      pool: it.poolSum,
      deck: it.deckSum,
      leaders: it.leaderCount,
      bases: it.baseCount,
    })),
    iterationFailures: result.iterations.flatMap((it: any) => it.failures || []),
    sectionsCount: result.result.sections?.length,
    tableBreakdown: result.iterations
      .filter((it: any) => it.tableName)
      .map((it: any) => ({
        table: it.tableName,
        poolSum: it.poolSum,
        deckSum: it.deckSum,
        rowsMarked: it.tableMarkedRows ?? 0,
        rowsInDeck: it.tableDeckRows ?? 0,
        rowsTotal: it.tableTotalCards ?? 0,
      })),
    fpExamples,
    fnExamples,
  }
}

function reportFixture(s: FixtureScore) {
  console.log(`\n--- ${s.name} ---`)
  if (s.status === 'skipped') {
    console.log(`SKIPPED: ${s.reason}`)
    return
  }
  if (s.status === 'error') {
    console.log(`ERROR: ${s.reason}`)
    return
  }
  console.log(
    `invariants: ${s.invariantsPass ? 'PASS' : 'FAIL'} (pool=${s.invariants!.poolSum}/96 deck=${s.invariants!.deckSum} L=${s.invariants!.leaders}/6 B=${s.invariants!.bases}/6)`,
  )
  console.log(
    `recall=${fmtPct(s.recall)} precision=${fmtPct(s.precision)}  TP=${s.truePositives} FP=${s.falsePositives} FN=${s.falseNegatives}`,
  )
  console.log(`qty error: mean=${s.qtyErrorMean!.toFixed(2)} max=${s.qtyErrorMax}`)
  console.log(
    `iterations: ${s.iterations} (best=${s.bestIteration}, converged=${s.converged}, elapsed=${s.elapsedSec!.toFixed(1)}s)`,
  )
  if (s.usage) {
    console.log(`tokens: ${fmtTokens(s.usage)}  cost: ${fmtCost(EXTRACT_MODEL, s.usage)}`)
  }
  if (s.tableBreakdown && s.tableBreakdown.length > 0) {
    console.log(`table breakdown:`)
    console.log(`  ${'table'.padEnd(13)} ${'pool sum'.padStart(8)}  ${'deck sum'.padStart(8)}  rows-marked  rows-in-deck`)
    let totPool = 0
    let totDeck = 0
    for (const t of s.tableBreakdown) {
      totPool += t.poolSum
      totDeck += t.deckSum
      console.log(
        `  ${t.table.padEnd(13)} ${String(t.poolSum).padStart(8)}  ${String(t.deckSum).padStart(8)}  ${(t.rowsMarked + '/' + t.rowsTotal).padStart(11)}  ${(t.rowsInDeck + '/' + t.rowsTotal).padStart(12)}`,
      )
    }
    console.log(`  ${'TOTALS'.padEnd(13)} ${String(totPool).padStart(8)}  ${String(totDeck).padStart(8)}  (target pool=96, deck=30-35)`)
  }
  if (s.sectionsCount != null) {
    console.log(`sections returned by phase 1: ${s.sectionsCount}`)
  }
  if ((s.falsePositives ?? 0) > 0) {
    console.log(`FP examples (model said yes, truth says no):`)
    for (const e of s.fpExamples!) {
      console.log(`  + ${e.name}${e.subtitle ? ' / ' + e.subtitle : ''} (pool=${e.poolQty} deck=${e.deckQty})`)
    }
  }
  if ((s.falseNegatives ?? 0) > 0) {
    console.log(`FN examples (truth says yes, model missed):`)
    for (const e of s.fnExamples!) {
      console.log(`  - ${e.name}${e.subtitle ? ' / ' + e.subtitle : ''} (pool=${e.poolQty} deck=${e.deckQty})`)
    }
  }
}

function reportAggregate(scored: FixtureScore[]) {
  const ok = scored.filter((s) => s.status === 'ok')
  if (ok.length === 0) {
    console.log('\n=== AGGREGATE: no fixtures ran ===')
    return
  }
  const passed = ok.filter((s) => s.invariantsPass).length
  const meanRecall = ok.reduce((sum, s) => sum + (s.recall || 0), 0) / ok.length
  const meanPrecision = ok.reduce((sum, s) => sum + (s.precision || 0), 0) / ok.length
  const meanIters = ok.reduce((sum, s) => sum + (s.iterations || 0), 0) / ok.length
  const meanQtyErr = ok.reduce((sum, s) => sum + (s.qtyErrorMean || 0), 0) / ok.length
  const totalElapsed = ok.reduce((sum, s) => sum + (s.elapsedSec || 0), 0)

  console.log(`\n=== AGGREGATE (${ok.length} fixtures ran) ===`)
  console.log(`invariants pass: ${passed}/${ok.length}`)
  console.log(`mean recall:    ${fmtPct(meanRecall)}`)
  console.log(`mean precision: ${fmtPct(meanPrecision)}`)
  console.log(`mean qty error: ${meanQtyErr.toFixed(2)}`)
  console.log(`mean iterations: ${meanIters.toFixed(1)}`)
  console.log(`total elapsed: ${totalElapsed.toFixed(0)}s`)
  const totalUsage = sumUsage(ok.map((s) => s.usage))
  if (totalUsage.apiCalls > 0) {
    console.log(`total tokens: ${fmtTokens(totalUsage)}`)
    console.log(`TOTAL COST: ${fmtCost(EXTRACT_MODEL, totalUsage)}`)
  }
}

async function main() {
  if (!existsSync(FIXTURES_DIR)) {
    console.error(`No fixtures directory at ${FIXTURES_DIR}`)
    process.exit(1)
  }
  const allFixtures = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
  const filter = process.env.FIXTURE
  const fixturesToRun = filter ? allFixtures.filter((n) => n === filter) : allFixtures

  if (fixturesToRun.length === 0) {
    console.error(filter ? `No fixture named "${filter}"` : 'No fixtures found')
    process.exit(1)
  }

  console.log(
    `Running ${fixturesToRun.length} fixture${fixturesToRun.length === 1 ? '' : 's'}: ${fixturesToRun.join(', ')}`,
  )
  console.log(`Max iterations: ${process.env.MAX_ITER || 8}`)

  const scored: FixtureScore[] = []
  for (const name of fixturesToRun) {
    console.log(`\n=== ${name} ===`)
    const s = await evalFixture(name)
    scored.push(s)
    reportFixture(s)
  }
  reportAggregate(scored)

  if (process.env.SAVE === '1') {
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
    const path = join(RESULTS_DIR, `${stamp}.json`)
    writeFileSync(path, JSON.stringify({ runAt: new Date().toISOString(), fixtures: scored }, null, 2))
    console.log(`\nsaved to ${path}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
