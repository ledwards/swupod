import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { autoOrientToPortrait } from '../../src/services/importPool/preprocessImage'

async function main() {
  const photo = readFileSync('/Users/lee/Repos/ledwards/swupod/scripts/eval/fixtures/casual-lee-law/photo1.jpg')
  const oriented = await autoOrientToPortrait(photo)
  const meta = await sharp(oriented).metadata()
  const w = meta.width!, h = meta.height!
  const bbox = { x0: 0.11, y0: 0.55, x1: 0.41, y1: 0.71 }
  const padX = w * 0.04, padY = h * 0.04
  const left = Math.max(0, Math.floor(bbox.x0 * w - padX))
  const top = Math.max(0, Math.floor(bbox.y0 * h - padY))
  const right = Math.min(w, Math.ceil(bbox.x1 * w + padX))
  const bottom = Math.min(h, Math.ceil(bbox.y1 * h + padY))
  console.log(`crop region: ${left},${top} -> ${right},${bottom} (${right-left}x${bottom-top}) on ${w}x${h}`)

  // Raw crop, no contrast
  await sharp(oriented).extract({ left, top, width: right-left, height: bottom-top }).jpeg({ quality: 95 }).toFile('/tmp/casual-bases-raw.jpg')
  console.log('saved /tmp/casual-bases-raw.jpg (raw)')

  // Wider crop: extend left edge to 0
  const wideLeft = 0
  const wideTop = Math.max(0, Math.floor(0.50 * h))
  const wideRight = Math.min(w, Math.ceil(0.50 * w))
  const wideBot = Math.min(h, Math.ceil(0.75 * h))
  await sharp(oriented).extract({ left: wideLeft, top: wideTop, width: wideRight - wideLeft, height: wideBot - wideTop }).jpeg({ quality: 95 }).toFile('/tmp/casual-bases-wide.jpg')
  console.log('saved /tmp/casual-bases-wide.jpg (wider, no padding lost)')
}
main().catch(e => { console.error(e); process.exit(1) })
