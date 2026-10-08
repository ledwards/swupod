/**
 * Like test-omr-integration.ts but FIRST passes the photo through the
 * same canvas-resize logic the client uses (2576px max, JPEG q=0.9).
 * Should reproduce the lower accuracy the user saw on a localhost upload.
 */
import * as fs from 'fs'
import * as dotenv from 'dotenv'
import sharp from 'sharp'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

async function clientStyleResize(filePath: string): Promise<string> {
  // Match imagePrep.ts: max 2576px on the longest side, JPEG q=0.9.
  const original = fs.readFileSync(filePath)
  const buf = await sharp(original)
    .rotate() // apply EXIF orientation (browser canvas does this)
    .resize({ width: 2576, height: 2576, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()
  return buf.toString('base64')
}

async function run() {
  const fixture = process.argv[2] || 'sq-tom-law'
  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')

  const photo1 = await clientStyleResize(`./scripts/eval/fixtures/${fixture}/photo1.jpg`)
  const photo2 = await clientStyleResize(`./scripts/eval/fixtures/${fixture}/photo2.jpg`)

  console.log(`Using client-style preprocessed photos (max 2576px, JPEG q=0.9)`)
  const t0 = Date.now()
  const r = await extractPoolFromImagesWholeTable(
    [{ data: photo1, mediaType: 'image/jpeg' }, { data: photo2, mediaType: 'image/jpeg' }],
    { setHint: 'LAW' },
  )
  const elapsed = Date.now() - t0
  console.log(`Wall: ${elapsed}ms`)
  console.log(`Pool sum: ${r.result.rows.reduce((s: number, x: any) => s + x.poolQty, 0)}`)
  console.log(`Deck sum: ${r.result.rows.reduce((s: number, x: any) => s + x.deckQty, 0)}`)

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
  console.log(`Pool acc: ${(100 * correctP / total).toFixed(1)}% Deck acc: ${(100 * correctD / total).toFixed(1)}% combined: ${(100 * (correctP + correctD) / (2 * total)).toFixed(1)}%`)
}
run().catch((e) => { console.error('FAILED:', e); process.exit(1) })
