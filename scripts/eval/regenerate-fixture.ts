/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Regenerate ground-truth.json for a fixture by running the current
 * extractPoolFromImages on its photos and dumping marked rows.
 *
 * Output is a STARTER ground truth — a candidate to hand-correct against
 * the photos. Sets _note explicitly so the eval skips it until the
 * human verifies and removes the note.
 *
 * Usage: FIXTURE=sq-tom-law npx tsx scripts/eval/regenerate-fixture.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fmtCost, fmtTokens } from './pricing'

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
// Prefer this checkout's .env.local (works in a git worktree); fall back to
// the primary repo where the key normally lives. First load wins per key.
loadEnvFile(join(process.cwd(), '.env.local'))
loadEnvFile('/Users/lee/Repos/ledwards/swupod/.env.local')

// REPO_ROOT defaults to the current checkout so this runs correctly from a
// worktree (reads photos from / writes ground-truth into THIS tree, not the
// primary repo). Override with REPO_ROOT=… if needed.
const REPO_ROOT = process.env.REPO_ROOT || process.cwd()
const FIXTURE = process.env.FIXTURE
if (!FIXTURE) {
  console.error('Set FIXTURE=<name>')
  process.exit(1)
}

async function main() {
  const dir = join(REPO_ROOT, 'scripts/eval/fixtures', FIXTURE!)
  const truthPath = join(dir, 'ground-truth.json')
  const truth = JSON.parse(readFileSync(truthPath, 'utf8'))
  const setCode = truth.setCode

  const photo1 = readFileSync(join(dir, 'photo1.jpg')).toString('base64')
  const photo2 = readFileSync(join(dir, 'photo2.jpg')).toString('base64')

  const { extractPoolFromImages } = await import('../../lib/anthropic')
  console.log(`extracting on ${FIXTURE}…`)
  const start = Date.now()
  const result = await extractPoolFromImages(
    [
      { data: photo1, mediaType: 'image/jpeg' },
      { data: photo2, mediaType: 'image/jpeg' },
    ],
    { setHint: setCode },
  )
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  // Per-table breakdown for review
  console.log(`elapsed=${elapsed}s sections=${result.result.sections?.length || 0}`)
  if (result.usage) {
    const model = process.env.IMPORT_EXTRACT_MODEL || 'claude-opus-4-7'
    console.log(`tokens: ${fmtTokens(result.usage)}  cost: ${fmtCost(model, result.usage)}`)
  }
  for (const it of result.iterations) {
    if (it.failures && it.failures.length > 0) console.log('  ' + it.failures.join(' | '))
  }

  const marked = result.result.rows.filter((r: any) => Number(r.poolQty) > 0)
  const poolSum = marked.reduce((s: number, r: any) => s + Number(r.poolQty), 0)
  const deckSum = marked.reduce((s: number, r: any) => s + Number(r.deckQty), 0)
  console.log(`marked=${marked.length} poolSum=${poolSum} deckSum=${deckSum}`)

  const out = {
    fixtureName: FIXTURE,
    setCode,
    expectedTotals: truth.expectedTotals || { pool: 96, deck: 32, leaders: 6, bases: 6 },
    _note: `STARTER from model run (${new Date().toISOString()}). poolSum=${poolSum} deckSum=${deckSum}. VERIFY against photos: walk each table, drop hallucinated rows, add missed rows, fix qty mistakes. Remove _note when done.`,
    rows: marked.map((r: any) => ({
      name: r.name,
      subtitle: r.subtitle,
      type: r.type,
      poolQty: r.poolQty,
      deckQty: r.deckQty,
    })),
  }
  writeFileSync(truthPath, JSON.stringify(out, null, 2))
  console.log(`wrote ${truthPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
