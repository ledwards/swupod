/**
 * Verify pass-through quality: read fixture, send original bytes
 * (no re-encode) through the production code path. Should match the
 * disk-load test's accuracy.
 */
import * as fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

async function run() {
  const fixture = process.argv[2] || 'sq-tom-law'
  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')

  // Pass-through (no re-encode) — what the new client sends
  const photo1 = fs.readFileSync(`./scripts/eval/fixtures/${fixture}/photo1.jpg`).toString('base64')
  const photo2 = fs.readFileSync(`./scripts/eval/fixtures/${fixture}/photo2.jpg`).toString('base64')
  console.log(`photo1: ${(photo1.length * 3 / 4 / 1024 / 1024).toFixed(1)}MB photo2: ${(photo2.length * 3 / 4 / 1024 / 1024).toFixed(1)}MB`)

  const t0 = Date.now()
  const r = await extractPoolFromImagesWholeTable(
    [{ data: photo1, mediaType: 'image/jpeg' }, { data: photo2, mediaType: 'image/jpeg' }],
    { setHint: 'LAW' },
  )
  const elapsed = Date.now() - t0

  console.log(`\nWall: ${elapsed}ms`)
  const poolSum = r.result.rows.reduce((s: number, x: any) => s + x.poolQty, 0)
  const deckSum = r.result.rows.reduce((s: number, x: any) => s + x.deckQty, 0)
  console.log(`Pool sum: ${poolSum}/96  Deck sum: ${deckSum} (target 30-35)`)

  const gtPath = `./scripts/eval/fixtures/${fixture}/ground-truth.json`
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'))
  const truth = new Map<string, [number, number]>()
  for (const t of gt.rows) truth.set(`${t.name}|${t.subtitle || ''}`, [t.poolQty, t.deckQty])

  let correctP = 0, correctD = 0, total = 0
  for (const row of r.result.rows) {
    const k = `${(row as any).name}|${(row as any).subtitle || ''}`
    const t = truth.get(k) || [0, 0]
    if ((row as any).poolQty === t[0]) correctP++
    if ((row as any).deckQty === t[1]) correctD++
    total++
  }
  console.log(`Pool acc: ${(100 * correctP / total).toFixed(1)}%  Deck acc: ${(100 * correctD / total).toFixed(1)}%  Combined: ${(100 * (correctP + correctD) / (2 * total)).toFixed(1)}%`)
}
run().catch((e) => { console.error('FAILED:', e); process.exit(1) })
