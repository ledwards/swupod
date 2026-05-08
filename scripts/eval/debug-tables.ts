/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'

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

async function main() {
  const { extractPoolFromImages } = await import('../../lib/anthropic')
  const photo1 = readFileSync('/Users/lee/Repos/ledwards/swupod/scripts/eval/fixtures/sq-tom-law/photo1.jpg').toString('base64')
  const photo2 = readFileSync('/Users/lee/Repos/ledwards/swupod/scripts/eval/fixtures/sq-tom-law/photo2.jpg').toString('base64')

  const result = await extractPoolFromImages(
    [
      { data: photo1, mediaType: 'image/jpeg' },
      { data: photo2, mediaType: 'image/jpeg' },
    ],
    { setHint: 'LAW' },
  )

  // Group all rows by aspect group
  const byAspect = new Map<string, any[]>()
  for (const row of result.result.rows) {
    const key = (row as any).aspectGroup || 'unknown'
    if (!byAspect.has(key)) byAspect.set(key, [])
    byAspect.get(key)!.push(row)
  }
  console.log(`Total rows returned: ${result.result.rows.length}`)
  console.log(`\nBy aspect group:`)
  for (const [k, rows] of [...byAspect.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const marked = rows.filter((r) => r.poolQty > 0)
    console.log(`  ${k.padEnd(40)} total=${rows.length.toString().padStart(3)} marked=${marked.length.toString().padStart(3)}`)
  }

  console.log(`\nIterations (per-table):`)
  for (const it of result.iterations) {
    console.log(`  i${it.iteration}: ${it.failures.join(' | ')} pool=${it.poolSum} deck=${it.deckSum} out=${it.outputTokens}`)
  }

  console.log(`\nSections returned by phase 1:`)
  for (const s of result.result.sections) {
    console.log(`  ${s.name} p${s.photoIndex} bbox=[${s.x0.toFixed(2)},${s.y0.toFixed(2)}] [${s.x1.toFixed(2)},${s.y1.toFixed(2)}]`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
