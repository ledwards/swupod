/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Run extractPoolFromImages N times in parallel, each at maxIterations=1.
 * Compare what each finds. The "consistent finds" (appear in all runs) are
 * the high-confidence cards. The "varying finds" tell us where Claude's
 * uncertainty is.
 *
 * Goal: see whether running multiple samples and unioning by majority vote
 * gets us closer to 96 than a single 4-iter loop.
 */
import { readFileSync, writeFileSync } from 'fs'

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

const PHOTO1 = process.env.PHOTO1 || '/tmp/sheet1.jpg'
const PHOTO2 = process.env.PHOTO2 || '/tmp/sheet2.jpg'
const SAMPLES = Number(process.env.SAMPLES || '3')

function rowKey(r: { name: string; type: string }): string {
  return `${r.type}|${r.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

async function main() {
  const { extractPoolFromImages } = await import('../lib/anthropic')
  const photo1 = readFileSync(PHOTO1).toString('base64')
  const photo2 = readFileSync(PHOTO2).toString('base64')
  console.log(`loaded photos. Running ${SAMPLES} samples in parallel.`)

  const start = Date.now()
  const samples = await Promise.all(
    Array.from({ length: SAMPLES }).map(async (_, i) => {
      const r = await extractPoolFromImages(
        [
          { data: photo1, mediaType: 'image/jpeg' },
          { data: photo2, mediaType: 'image/jpeg' },
        ],
        { setHint: 'LAW', maxIterations: 1 },
      )
      const it = r.iterations[0]
      console.log(`  sample ${i + 1}: pool=${it.poolSum}/96 deck=${it.deckSum} L=${it.leaderCount}/6 B=${it.baseCount}/6`)
      return r
    }),
  )
  console.log(`elapsed=${((Date.now() - start) / 1000).toFixed(1)}s`)

  // Tally how many runs found each card
  const found: Map<string, { row: any; runs: number[] }> = new Map()
  for (let i = 0; i < samples.length; i++) {
    const marked = samples[i].result.rows.filter((r: any) => r.poolQty > 0)
    for (const r of marked) {
      const k = rowKey(r as any)
      if (!found.has(k)) {
        found.set(k, { row: r, runs: [] })
      }
      found.get(k)!.runs.push(i)
    }
  }

  const allEntries = [...found.values()]
  const inAll = allEntries.filter((e) => e.runs.length === SAMPLES)
  const inMajority = allEntries.filter((e) => e.runs.length >= Math.ceil(SAMPLES / 2))
  const inOnly1 = allEntries.filter((e) => e.runs.length === 1)

  console.log(`\n=== AGREEMENT ===`)
  console.log(`unique cards across all samples: ${allEntries.length}`)
  console.log(`found in ALL ${SAMPLES} samples: ${inAll.length}`)
  console.log(`found in MAJORITY (>=${Math.ceil(SAMPLES / 2)}): ${inMajority.length}`)
  console.log(`found in EXACTLY 1 sample: ${inOnly1.length}`)

  const majorityPoolSum = inMajority.reduce((s, e) => s + e.row.poolQty, 0)
  const majorityDeckSum = inMajority.reduce((s, e) => s + e.row.deckQty, 0)
  const majorityLeaders = inMajority
    .filter((e) => e.row.type === 'Leader')
    .reduce((s, e) => s + e.row.poolQty, 0)
  const majorityBases = inMajority
    .filter((e) => e.row.type === 'Base')
    .reduce((s, e) => s + e.row.poolQty, 0)

  console.log(`\nmajority-vote pool sum: ${majorityPoolSum}`)
  console.log(`majority-vote deck sum: ${majorityDeckSum}`)
  console.log(`majority-vote leaders: ${majorityLeaders}/6 bases: ${majorityBases}/6`)

  console.log(`\n=== EXAMPLE 1-only finds (likely hallucinations) ===`)
  for (const e of inOnly1.slice(0, 15)) {
    console.log(
      `  [run ${e.runs[0] + 1}] ${e.row.type} "${e.row.name}" pool=${e.row.poolQty} confs=[${e.row.poolQtyConfidence}/${e.row.deckQtyConfidence}]`,
    )
  }

  writeFileSync(
    '/tmp/iter-multi-sample.json',
    JSON.stringify({ samples: samples.map((s) => s.result), found: [...found.entries()] }, null, 2),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
