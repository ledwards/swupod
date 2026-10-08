/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Goal-oriented loop with section-cropped Pass C.
 *
 * Phase A: run extractPoolFromImages (which has its own 4-iter refine loop).
 * Phase C (if not converged): for each section bbox the model returned, crop
 * the source photo to that bbox, call Claude with just that crop and a
 * focused prompt, then merge any newly-found rows into the main result.
 */
import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'

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
const MAX_ITER = Number(process.env.MAX_ITER || '4')
const SET_HINT = process.env.SET_HINT || 'LAW'
const POOL_TARGET = 96
const DECK_MIN = 30
const DECK_MAX = 35

interface ExtractedRow {
  name: string
  type: string
  subtitle: string | null
  poolQty: number
  deckQty: number
  aspectGroup?: string | null
  poolQtyConfidence?: string
  deckQtyConfidence?: string
}

interface SectionBounds {
  name: string
  photoIndex: number
  x0: number
  y0: number
  x1: number
  y1: number
}

const CROP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          subtitle: { type: ['string', 'null'] },
          type: { type: 'string', enum: ['Leader', 'Base', 'Unit', 'Event', 'Upgrade'] },
          poolQty: { type: 'integer' },
          deckQty: { type: 'integer' },
          poolQtyConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          deckQtyConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['name', 'subtitle', 'type', 'poolQty', 'deckQty', 'poolQtyConfidence', 'deckQtyConfidence'],
      },
    },
  },
  required: ['rows'],
}

async function cropToBuffer(
  imagePath: string,
  bounds: { x0: number; y0: number; x1: number; y1: number },
): Promise<Buffer> {
  const meta = await sharp(imagePath).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  // Add a small padding (2% of dimension) so we don't clip rows at the edge.
  const padX = w * 0.02
  const padY = h * 0.02
  const left = Math.max(0, Math.floor(bounds.x0 * w - padX))
  const top = Math.max(0, Math.floor(bounds.y0 * h - padY))
  const right = Math.min(w, Math.ceil(bounds.x1 * w + padX))
  const bottom = Math.min(h, Math.ceil(bounds.y1 * h + padY))
  const width = right - left
  const height = bottom - top
  return await sharp(imagePath)
    .extract({ left, top, width, height })
    .jpeg({ quality: 92 })
    .toBuffer()
}

async function extractRowsFromCrop(
  cropBuffer: Buffer,
  sectionName: string,
  setHint: string,
): Promise<ExtractedRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 5,
    timeout: 10 * 60 * 1000,
  })

  const systemPrompt = `You're parsing a CROPPED view of the ${sectionName} section of a Star Wars: Unlimited sealed-deck registration sheet from set ${setHint}.

CRITICAL: Most rows in this section are EMPTY. The player has only marked the few cards they actually own. Returning a blank row as poolQty=1 is a HALLUCINATION that breaks the import. ONLY return rows where you can clearly SEE a tally mark in the TOTAL column.

For each row you return:
- poolQty: 0 if no mark, 1 for one tally, 2 for "||" or "2", up to 6
- deckQty: same scale on the PLAYED column, must be ≤ poolQty
- Empty cell, dot, dash, "—" = 0
- "name" = card name only, no comma, no subtitle suffix
- "subtitle" = printed subtitle below name or null
- type = Leader/Base/Unit/Event/Upgrade

Per-column confidence is critical:
- "poolQtyConfidence": "high" only when you're CERTAIN of the value (clear sharp tally, or clearly empty cell). Use "medium" if it's ambiguous between blank and a faint mark, or between 1 and 2 tallies. Use "low" for genuinely uncertain reads.
- Be honest: a "blank that might be a faint mark" is poolQty=0 with poolQtyConfidence="medium" or "low". DO NOT inflate to poolQty=1 just because you're not sure.

Only return rows where you're returning poolQty>=1. Do NOT include blank rows.

Return strict JSON: { "rows": [...] }. No prose.`

  const userText = `List every row in this cropped ${sectionName} section where you SEE a tally mark in the TOTAL column. Skip blank rows. Be conservative — when uncertain, mark confidence as "medium" or "low" rather than inflating poolQty.`

  const response = await client.messages
    .stream({
      model: 'claude-opus-4-7',
      max_tokens: 8000,
      system: systemPrompt,
      output_config: {
        format: { type: 'json_schema', schema: CROP_SCHEMA },
      } as any,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: cropBuffer.toString('base64') },
            },
            { type: 'text', text: userText },
          ],
        },
      ],
    } as any)
    .finalMessage()

  const textBlock = response.content.find((b: any) => b.type === 'text') as any
  if (!textBlock) throw new Error('no text in crop response')
  const parsed = JSON.parse(textBlock.text)
  return (parsed.rows || []).filter((r: any) => Number(r.poolQty) > 0)
}

function rowKey(r: { name: string; type: string }): string {
  // Dedup on name+type only — subtitle often diverges between phase A and
  // crops (one or the other reads it differently or omits it entirely),
  // and including subtitle in the key lets duplicate rows leak through.
  return `${r.type}|${r.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

async function main() {
  const { extractPoolFromImages } = await import('../lib/anthropic')
  const photo1 = readFileSync(PHOTO1).toString('base64')
  const photo2 = readFileSync(PHOTO2).toString('base64')
  console.log(`loaded photo1 (${photo1.length} chars b64) and photo2 (${photo2.length} chars b64)`)

  const start = Date.now()

  // Phase A — main loop
  const phaseA = await extractPoolFromImages(
    [
      { data: photo1, mediaType: 'image/jpeg' },
      { data: photo2, mediaType: 'image/jpeg' },
    ],
    { setHint: SET_HINT, maxIterations: MAX_ITER },
  )

  console.log('\n=== PHASE A iterations ===')
  for (const it of phaseA.iterations) {
    console.log(
      `iter ${it.iteration}: pool=${it.poolSum}/96 deck=${it.deckSum} L=${it.leaderCount}/6 B=${it.baseCount}/6 subset=${it.subsetViolations} passing=${it.passing}`,
    )
  }
  console.log(`phase A: converged=${phaseA.converged} bestIter=${phaseA.bestIteration} elapsed=${((Date.now() - start) / 1000).toFixed(1)}s`)

  if (phaseA.converged) {
    console.log('\nConverged in phase A — no crops needed')
    process.exit(0)
  }

  // Phase C — crop each section, extract from crops in parallel
  const sections: SectionBounds[] = phaseA.result.sections || []
  console.log(`\n=== PHASE C: cropping ${sections.length} sections ===`)
  if (sections.length === 0) {
    console.log('No sections returned from phase A — cannot crop')
    process.exit(1)
  }

  const photoPaths = [PHOTO1, PHOTO2]
  const cropResults: Array<{ section: string; rows: ExtractedRow[] }> = []

  // Process in batches of 3 to avoid overwhelming the API
  const BATCH = 3
  for (let i = 0; i < sections.length; i += BATCH) {
    const batch = sections.slice(i, i + BATCH)
    const batchStart = Date.now()
    const batchResults = await Promise.all(
      batch.map(async (s) => {
        const imgPath = photoPaths[s.photoIndex]
        try {
          const cropBuf = await cropToBuffer(imgPath, s)
          const rows = await extractRowsFromCrop(cropBuf, s.name, SET_HINT)
          return { section: `${s.name}-p${s.photoIndex}`, rows }
        } catch (err) {
          console.log(`  crop ${s.name}-p${s.photoIndex} FAILED: ${(err as Error).message}`)
          return { section: `${s.name}-p${s.photoIndex}`, rows: [] }
        }
      }),
    )
    for (const r of batchResults) {
      cropResults.push(r)
      console.log(`  ${r.section}: ${r.rows.length} marked rows (${((Date.now() - batchStart) / 1000).toFixed(1)}s batch)`)
    }
  }

  // Merge: phase A is the source of truth (it had full-sheet context). Crops
  // only ADD rows phase A missed, and only at high confidence (medium/low
  // crop reads are too prone to hallucination on small sub-images).
  const phaseAMarked = phaseA.result.rows.filter((r: any) => Number(r.poolQty) > 0)
  const merged = new Map<string, ExtractedRow>()
  for (const r of phaseAMarked) {
    merged.set(rowKey(r as any), { ...(r as ExtractedRow) })
  }
  let addedRows = 0
  let rejectedLowConf = 0
  for (const cr of cropResults) {
    for (const r of cr.rows) {
      const k = rowKey(r)
      if (merged.has(k)) continue // phase A wins for known cards
      // Only accept high-confidence pool reads from crops as new additions.
      if (r.poolQtyConfidence !== 'high') {
        rejectedLowConf++
        continue
      }
      merged.set(k, r)
      addedRows++
    }
  }
  console.log(`  merge: kept all ${phaseAMarked.length} phase-A rows, added ${addedRows} new from crops (high-conf only), rejected ${rejectedLowConf} low/medium-conf crop rows`)

  // Cap: a sealed pool has EXACTLY 6 leaders and 6 bases. If merge produced
  // more (e.g., crops added a 7th leader), drop the lowest-confidence ones
  // until at most 6 remain.
  const mergedArr = [...merged.values()]
  const leaders = mergedArr.filter((r) => r.type === 'Leader')
  const bases = mergedArr.filter((r) => r.type === 'Base')
  const others = mergedArr.filter((r) => r.type !== 'Leader' && r.type !== 'Base')
  const sortByConf = (a: ExtractedRow, b: ExtractedRow) => {
    const score = (c: string | undefined) => (c === 'high' ? 2 : c === 'medium' ? 1 : 0)
    return score(b.poolQtyConfidence) - score(a.poolQtyConfidence)
  }
  const cappedLeaders = leaders.sort(sortByConf).slice(0, 6)
  const cappedBases = bases.sort(sortByConf).slice(0, 6)
  const finalArr = [...cappedLeaders, ...cappedBases, ...others]
  if (leaders.length > 6) console.log(`  capped leaders: ${leaders.length} → 6`)
  if (bases.length > 6) console.log(`  capped bases: ${bases.length} → 6`)

  const mergedPoolSum = finalArr.reduce((s, r) => s + r.poolQty, 0)
  const mergedDeckSum = finalArr.reduce((s, r) => s + r.deckQty, 0)
  const mergedLeaders = finalArr.filter((r) => r.type === 'Leader').reduce((s, r) => s + r.poolQty, 0)
  const mergedBases = finalArr.filter((r) => r.type === 'Base').reduce((s, r) => s + r.poolQty, 0)

  console.log(`\n=== MERGED RESULT ===`)
  console.log(`merged marked rows: ${finalArr.length} (added ${addedRows} from crops)`)
  console.log(`merged poolSum=${mergedPoolSum}/${POOL_TARGET}`)
  console.log(`merged deckSum=${mergedDeckSum} (range ${DECK_MIN}-${DECK_MAX})`)
  console.log(`merged leaders=${mergedLeaders}/6 bases=${mergedBases}/6`)

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\ntotal elapsed: ${elapsed}s`)

  writeFileSync(
    '/tmp/iter-import-with-crops.json',
    JSON.stringify({ phaseA, cropResults, merged: finalArr }, null, 2),
  )

  const passing =
    mergedPoolSum === POOL_TARGET &&
    mergedDeckSum >= DECK_MIN &&
    mergedDeckSum <= DECK_MAX &&
    mergedLeaders === 6 &&
    mergedBases === 6
  if (passing) {
    console.log('\nCONVERGED via crops!')
    process.exit(0)
  } else {
    console.log('\n!!! STILL NOT CONVERGED — but improved by ' + addedRows + ' rows from crops')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(2)
})
