import { readFileSync, writeFileSync } from 'fs'
function loadEnv(p: string) { try {
  for (const line of readFileSync(p,'utf8').split('\n')) { const t=line.trim(); if(!t||t.startsWith('#'))continue; const eq=t.indexOf('='); if(eq===-1)continue; const k=t.slice(0,eq).trim(); let v=t.slice(eq+1).trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1); if(!process.env[k])process.env[k]=v }} catch {} }
loadEnv('/Users/lee/Repos/ledwards/swupod/.env.local')
async function main() {
  const fixture = process.env.FIXTURE || 'casual-lee-law'
  const { extractPoolFromImages } = await import('../../lib/anthropic')
  const { cropOriginalAndPreprocess } = await import('../../src/services/importPool/sectionExtraction')

  const photo1Buf = readFileSync(`/Users/lee/Repos/ledwards/swupod/scripts/eval/fixtures/${fixture}/photo1.jpg`)
  const photo2Buf = readFileSync(`/Users/lee/Repos/ledwards/swupod/scripts/eval/fixtures/${fixture}/photo2.jpg`)
  const r = await extractPoolFromImages([
    {data: photo1Buf.toString('base64'), mediaType: 'image/jpeg'},
    {data: photo2Buf.toString('base64'), mediaType: 'image/jpeg'},
  ], { setHint: 'LAW' })
  console.log('Phase 1 sections:')
  for (const s of r.result.sections) console.log('  ' + s.name.padEnd(12) + ' p' + s.photoIndex + ' [' + s.x0.toFixed(2) + ',' + s.y0.toFixed(2) + ']->[' + s.x1.toFixed(2) + ',' + s.y1.toFixed(2) + ']')

  const basesBox = r.result.sections.find((s: any) => s.name === 'Bases')
  if (basesBox) {
    const buf = basesBox.photoIndex === 0 ? photo1Buf : photo2Buf
    const cropBuf = await cropOriginalAndPreprocess(buf, basesBox)
    writeFileSync(`/tmp/${fixture}-bases-crop.jpg`, cropBuf)
    console.log(`saved /tmp/${fixture}-bases-crop.jpg`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
