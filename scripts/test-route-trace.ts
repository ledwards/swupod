/**
 * Trace through the route handler's actual logic (without HTTP) to
 * verify section bounds make it through the sanitizer.
 */
import * as fs from 'fs'
import * as dotenv from 'dotenv'

dotenv.config({ path: './.env' })
dotenv.config({ path: './.env.local', override: true })

async function run() {
  const { extractPoolFromImagesWholeTable } = await import('../lib/anthropic')

  const photo1 = fs.readFileSync(`./scripts/eval/fixtures/sq-tom-law/photo1.jpg`).toString('base64')
  const photo2 = fs.readFileSync(`./scripts/eval/fixtures/sq-tom-law/photo2.jpg`).toString('base64')

  const r = await extractPoolFromImagesWholeTable(
    [{ data: photo1, mediaType: 'image/jpeg' }, { data: photo2, mediaType: 'image/jpeg' }],
    { setHint: 'LAW' },
  )

  console.log(`Pre-sanitizer raw.sections.length: ${r.result.sections?.length ?? 0}`)
  if (r.result.sections?.length > 0) {
    console.log(`First 3:`)
    for (const s of r.result.sections.slice(0, 3)) {
      console.log(`  ${(s as any).name} photo=${(s as any).photoIndex} bounds=(${(s as any).x0.toFixed(3)},${(s as any).y0.toFixed(3)})→(${(s as any).x1.toFixed(3)},${(s as any).y1.toFixed(3)})`)
    }
  }
}
run().catch((e) => { console.error('FAILED:', e); process.exit(1) })
