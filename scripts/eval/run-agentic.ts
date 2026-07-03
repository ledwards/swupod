/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Run the agentic extractor (lib/agenticExtract.ts) on one fixture and report
 * rows, totals, token usage, and cost.
 *
 * Usage:
 *   FIXTURE=palmsprings-taylor-b-law npx tsx scripts/eval/run-agentic.ts
 *   IMPORT_EXTRACT_MODEL=claude-opus-4-7 FIXTURE=sq-tom-law npx tsx scripts/eval/run-agentic.ts
 *   OUT=/tmp/agentic.json ... (defaults to scripts/eval/extractions/agentic-<fixture>.json)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
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
loadEnvFile(join(process.cwd(), '.env.local'))
loadEnvFile('/Users/lee/Repos/ledwards/swupod/.env.local')

const REPO_ROOT = process.env.REPO_ROOT || process.cwd()
const FIXTURE = process.env.FIXTURE
if (!FIXTURE) {
  console.error('Set FIXTURE=<name>')
  process.exit(1)
}

import { fmtCost, fmtTokens } from './pricing'

async function main() {
  const { extractPoolAgentic } = await import('../../lib/agenticExtract')
  const dir = join(REPO_ROOT, 'scripts/eval/fixtures', FIXTURE!)
  const truth = JSON.parse(readFileSync(join(dir, 'ground-truth.json'), 'utf8'))
  const photo1 = readFileSync(join(dir, 'photo1.jpg')).toString('base64')
  const photo2 = readFileSync(join(dir, 'photo2.jpg')).toString('base64')

  console.log(`agentic extract: ${FIXTURE} (set ${truth.setCode})`)
  const result = await extractPoolAgentic(
    [
      { data: photo1, mediaType: 'image/jpeg' },
      { data: photo2, mediaType: 'image/jpeg' },
    ],
    { setCode: truth.setCode },
  )

  console.log(`\nmodel=${result.model} turns=${result.turns} elapsed=${(result.elapsedMs / 1000).toFixed(1)}s`)
  console.log(`species=${result.sheetSpecies} rows=${result.rows.length}`)
  console.log(`totals: pool=${result.totals.pool} deck=${result.totals.deck} leaders=${result.totals.leaders} bases=${result.totals.bases}`)
  if (result.unresolved) console.log(`unresolved: ${result.unresolved}`)

  console.log(`\ntokens: ${fmtTokens(result.usage)}`)
  console.log(`cost: ${fmtCost(result.model, result.usage)}`)

  const outPath = process.env.OUT || join(REPO_ROOT, 'scripts/eval/extractions', `agentic-${FIXTURE}.json`)
  mkdirSync(join(REPO_ROOT, 'scripts/eval/extractions'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`\nwrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
