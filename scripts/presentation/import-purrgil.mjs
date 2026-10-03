// Refresh the portable presentation snapshot; no sibling checkout is needed to build PTP.
// Usage: node scripts/presentation/import-purrgil.mjs /path/to/purrgil
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import sharp from 'sharp'

const source = process.argv[2]
if (!source) throw new Error('Pass the Purrgil checkout to import.')
const root = resolve(source, 'public/table-environments')
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'))
await mkdir('public/table-environments', {recursive: true})
await mkdir('src/presentation/purrgil', {recursive: true})
const themes = []
for (const entry of manifest.themes) {
  const theme = JSON.parse(await readFile(resolve(root, entry.config), 'utf8'))
  const original = await readFile(resolve(root, entry.image))
  const hash = value => createHash('sha256').update(value).digest('hex')
  if (hash(original) !== theme.background.sha256) throw new Error(`Artwork checksum mismatch: ${entry.id}`)
  const image = `${entry.id}.webp`
  const optimized = await sharp(original).webp({quality: 82}).toBuffer()
  await writeFile(resolve('public/table-environments', image), optimized)
  let layout = theme.background.layout
  if (layout) {
    const sceneryName = `${entry.id}-surroundings.webp`
    const scenery = await sharp(resolve(source, 'public', layout.scenery.image.slice(1))).webp({quality: 82}).toBuffer()
    await writeFile(resolve('public/table-environments', sceneryName), scenery)
    layout = {...layout, scenery: {...layout.scenery, image: `/table-environments/${sceneryName}`}}
  }
  themes.push({...theme, sourceSha256: theme.background.sha256, background: {
    ...theme.background, ...(layout ? {layout} : {}), image: `/table-environments/${image}`, sha256: hash(optimized),
  }})
}
const contract = await readFile(resolve(source, 'src/preferences/theme-contract.ts'), 'utf8')
// PTP enables noUncheckedIndexedAccess; the imported catalog is nonempty.
await writeFile('src/presentation/purrgil/theme-contract.ts', contract.replace('?? themes[0];', '?? themes[0]!;'))
await writeFile('src/presentation/purrgil/themes.json', JSON.stringify(themes, null, 2) + '\n')
console.log(`Imported ${themes.length} Purrgil tables with original framing and palettes.`)
