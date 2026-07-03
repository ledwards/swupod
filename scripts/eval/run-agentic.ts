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

// $/MTok. Fable 5 pricing is not published in this repo's knowledge — when the
// model has no entry we print the token math with a bounded estimate instead.
const RATES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number } | null> = {
  'claude-opus-4-7': { in: 15, out: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 },
  'claude-fable-5': null,
}

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

  const u = result.usage
  console.log(`\ntokens: calls=${u.apiCalls} in=${u.inputTokens.toLocaleString()} out=${u.outputTokens.toLocaleString()} cacheRead=${u.cacheReadTokens.toLocaleString()} cacheWrite=${u.cacheCreationTokens.toLocaleString()}`)
  const rate = RATES[result.model]
  const cost = (r: NonNullable<(typeof RATES)[string]>) =>
    (u.inputTokens / 1e6) * r.in +
    (u.outputTokens / 1e6) * r.out +
    (u.cacheReadTokens / 1e6) * r.cacheRead +
    (u.cacheCreationTokens / 1e6) * r.cacheWrite5m
  if (rate) {
    console.log(`cost @ ${result.model} rates: $${cost(rate).toFixed(3)}`)
  } else {
    const lo = cost({ in: 3, out: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 })
    const hi = cost({ in: 15, out: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 })
    console.log(`cost: no published rate for ${result.model} — $${lo.toFixed(3)} at Sonnet-class rates, $${hi.toFixed(3)} at Opus-class rates`)
  }

  const outPath = process.env.OUT || join(REPO_ROOT, 'scripts/eval/extractions', `agentic-${FIXTURE}.json`)
  mkdirSync(join(REPO_ROOT, 'scripts/eval/extractions'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(result, null, 2))
  console.log(`\nwrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
