import * as fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

async function run() {
  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')
  const photo1 = fs.readFileSync('./scripts/eval/fixtures/sq-tom-law/photo1.jpg').toString('base64')
  const photo2 = fs.readFileSync('./scripts/eval/fixtures/sq-tom-law/photo2.jpg').toString('base64')
  const t0 = Date.now()
  const r = await extractPoolFromImagesWholeTable(
    [{ data: photo1, mediaType: 'image/jpeg' }, { data: photo2, mediaType: 'image/jpeg' }],
    { setHint: 'LAW' },
  )
  const elapsed = Date.now() - t0
  console.log(`Wall: ${elapsed}ms`)
  console.log(`Rows: ${r.result.rows.length}`)
  console.log(`Pool sum: ${r.result.rows.reduce((s: number, x: any) => s + x.poolQty, 0)}`)
  console.log(`Deck sum: ${r.result.rows.reduce((s: number, x: any) => s + x.deckQty, 0)}`)
  console.log(`Iterations: ${r.iterations.length}`)
  console.log(`Header set:`, r.result.header?.setName)

  // Score against ground truth
  const gtPath = './scripts/eval/fixtures/sq-tom-law/ground-truth.json'
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'))
  const truth = new Map<string, [number, number]>()
  for (const t of gt.rows) {
    truth.set(`${t.name}|${t.subtitle || ''}`, [t.poolQty, t.deckQty])
  }
  let correctP = 0, correctD = 0, total = 0
  for (const row of r.result.rows) {
    const k = `${(row as any).name}|${(row as any).subtitle || ''}`
    const t = truth.get(k) || [0, 0]
    if ((row as any).poolQty === t[0]) correctP++
    if ((row as any).deckQty === t[1]) correctD++
    total++
  }
  console.log(`Pool acc: ${(100 * correctP / total).toFixed(1)}% Deck acc: ${(100 * correctD / total).toFixed(1)}% combined: ${(100 * (correctP + correctD) / (2 * total)).toFixed(1)}%`)
}
run().catch((e) => { console.error('FAILED:', e); process.exit(1) })
