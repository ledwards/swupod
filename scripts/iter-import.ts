/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, writeFileSync } from 'fs'

// Load .env.local before importing anything that reads process.env.
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
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // ignore — env may already be set
  }
}
loadEnvFile('/Users/lee/Repos/ledwards/swupod/.env.local')

const PHOTO1 = process.env.PHOTO1 || '/tmp/sheet1.jpg'
const PHOTO2 = process.env.PHOTO2 || '/tmp/sheet2.jpg'
const MAX_ITER = Number(process.env.MAX_ITER || '4')
const SET_HINT = process.env.SET_HINT || 'LAW'

async function main() {
  // Dynamic import AFTER env is loaded so getClient picks up the key.
  const { extractPoolFromImages } = await import('../lib/anthropic')

  const photo1 = readFileSync(PHOTO1).toString('base64')
  const photo2 = readFileSync(PHOTO2).toString('base64')
  console.log(`loaded photo1 (${photo1.length} chars b64) and photo2 (${photo2.length} chars b64)`)

  const start = Date.now()
  const result = await extractPoolFromImages(
    [
      { data: photo1, mediaType: 'image/jpeg' },
      { data: photo2, mediaType: 'image/jpeg' },
    ],
    { setHint: SET_HINT, maxIterations: MAX_ITER },
  )
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log('\n=== ITERATIONS ===')
  for (const it of result.iterations) {
    const failuresStr = it.failures.length > 0 ? ` failures=${JSON.stringify(it.failures)}` : ''
    console.log(
      `iter ${it.iteration}: pool=${it.poolSum}/96 deck=${it.deckSum} L=${it.leaderCount}/6 B=${it.baseCount}/6 subset=${it.subsetViolations} passing=${it.passing} cache(r/w)=${it.cacheReadTokens}/${it.cacheCreationTokens} out=${it.outputTokens}${failuresStr}`,
    )
  }

  console.log(`\n=== FINAL ===`)
  console.log(`converged=${result.converged} bestIteration=${result.bestIteration} elapsed=${elapsed}s`)
  const finalPool = result.result.rows.filter((r: any) => r.poolQty > 0)
  console.log(`final marked rows: ${finalPool.length}`)
  console.log(`final pool sum: ${finalPool.reduce((s: number, r: any) => s + r.poolQty, 0)}`)
  console.log(`final deck sum: ${finalPool.reduce((s: number, r: any) => s + r.deckQty, 0)}`)
  console.log(`sections in final: ${result.result.sections?.length || 0}`)

  // Per-section breakdown of best iteration
  const bySec: Record<string, { pool: number; deck: number }> = {}
  for (const row of finalPool) {
    const k =
      row.type === 'Leader'
        ? 'Leaders'
        : row.type === 'Base'
          ? 'Bases'
          : (row as any).aspectGroup || 'Unspecified'
    bySec[k] = bySec[k] || { pool: 0, deck: 0 }
    bySec[k].pool += row.poolQty
    bySec[k].deck += row.deckQty
  }
  console.log(`\nbest iter by section:`)
  for (const [k, v] of Object.entries(bySec).sort((a, b) => b[1].pool - a[1].pool)) {
    console.log(`  ${k.padEnd(15)} pool=${v.pool} deck=${v.deck}`)
  }

  // Persist last result so we can compare across runs
  writeFileSync(
    '/tmp/iter-import-last.json',
    JSON.stringify(result, null, 2),
  )
  console.log(`\nfull result written to /tmp/iter-import-last.json`)

  if (!result.converged) {
    console.log('\n!!! DID NOT CONVERGE !!!')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
