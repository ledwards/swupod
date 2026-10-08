// @ts-nocheck
/**
 * Per-table extraction.
 *
 * Each call sends:
 *   - one CROP of one table from the sheet
 *   - a CLOSED vocabulary: just the cards that belong in this table
 *     (numbered, with name + type + aspects)
 *
 * Claude's job: for each card in the list, look at the corresponding row
 * in the crop and report poolQty / deckQty. No name OCR — Claude maps
 * the visual rows to the printed numbers we already gave it. Empty rows
 * are reported as poolQty=0, deckQty=0.
 *
 * This sharply reduces hallucinations: Claude can't return a card name
 * not in the table's vocabulary, so the only failure modes are tally-mark
 * misreads (which the resolve UI handles).
 */

import type Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import type { TableName } from './tableGrouping'
import { autoOrientToPortrait } from './preprocessImage'
import { addResponseUsage, type ExtractUsage } from './extractUsage'

// Keep in sync with lib/anthropic.ts — IMPORT_EXTRACT_MODEL overrides ALL
// extraction phases (a hardcoded copy here once silently pinned Phase 2 to
// opus while Phase 1 A/B'd other models).
const MODEL = process.env.IMPORT_EXTRACT_MODEL || 'claude-opus-4-7'
const MAX_TOKENS = 6000 // ~50 cards × 100 bytes JSON ≈ 5KB output

export interface TableExtractionRow {
  cardNumber: number
  poolQty: number
  deckQty: number
  poolQtyConfidence: 'high' | 'medium' | 'low'
  deckQtyConfidence: 'high' | 'medium' | 'low'
}

const TABLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cardNumber: { type: 'integer' },
          poolQty: { type: 'integer' },
          deckQty: { type: 'integer' },
          poolQtyConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          deckQtyConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['cardNumber', 'poolQty', 'deckQty', 'poolQtyConfidence', 'deckQtyConfidence'],
      },
    },
  },
  required: ['rows'],
}

export async function cropForTable(
  imageBuffer: Buffer,
  bounds: { x0: number; y0: number; x1: number; y1: number },
): Promise<Buffer> {
  // Apply auto-orientation (EXIF + landscape→portrait fallback) first.
  // Phase 1's bbox coords are relative to the oriented image.
  const rotated = await autoOrientToPortrait(imageBuffer)
  const meta = await sharp(rotated).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w === 0 || h === 0) throw new Error('cropForTable: image has zero dimension')
  const padX = w * 0.04
  const padY = h * 0.04
  const left = Math.max(0, Math.floor(bounds.x0 * w - padX))
  const top = Math.max(0, Math.floor(bounds.y0 * h - padY))
  const right = Math.min(w, Math.ceil(bounds.x1 * w + padX))
  const bottom = Math.min(h, Math.ceil(bounds.y1 * h + padY))
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) {
    throw new Error(
      `cropForTable: invalid bounds ${JSON.stringify({ left, top, width, height, w, h, bounds })}`,
    )
  }
  return await sharp(rotated).extract({ left, top, width, height }).jpeg({ quality: 95 }).toBuffer()
}

/**
 * Crop an ORIGINAL (un-preprocessed) photo to a table's bbox at native
 * resolution, then apply the contrast pipeline to JUST that crop.
 *
 * Why this matters: the full-photo preprocessing path resizes to a 2576px
 * ceiling first, which downsamples large iPhone photos (4032×3024)
 * before the crop happens — column-pixel density drops by ~40%. Cropping
 * first preserves native resolution where it counts (inside the table).
 *
 * Per-crop normalise also gets a tighter dynamic range than whole-photo
 * normalise, so faint pencil marks within a section get stronger boost.
 */
export async function cropOriginalAndPreprocess(
  originalBuffer: Buffer,
  bounds: { x0: number; y0: number; x1: number; y1: number },
): Promise<Buffer> {
  // Apply auto-orientation BEFORE measuring or cropping. Phase 1 sees
  // the oriented image (via preprocessImageForExtraction which calls
  // autoOrientToPortrait); the bbox coords are relative to that, so the
  // crop must operate on the same orientation.
  const rotated = await autoOrientToPortrait(originalBuffer)
  const meta = await sharp(rotated).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w === 0 || h === 0) throw new Error('cropOriginalAndPreprocess: image has zero dimension')
  const padX = w * 0.04
  const padY = h * 0.04
  const left = Math.max(0, Math.floor(bounds.x0 * w - padX))
  const top = Math.max(0, Math.floor(bounds.y0 * h - padY))
  const right = Math.min(w, Math.ceil(bounds.x1 * w + padX))
  const bottom = Math.min(h, Math.ceil(bounds.y1 * h + padY))
  const width = right - left
  const height = bottom - top
  if (width <= 0 || height <= 0) {
    throw new Error(
      `cropOriginalAndPreprocess: invalid bounds ${JSON.stringify({ left, top, width, height, w, h, bounds })}`,
    )
  }
  // Cap at 2576 only AFTER cropping — most crops are well under this anyway.
  // No normalise()/linear() — see preprocessImage.ts for why (uneven crop
  // brightness causes normalise to stretch faint marks toward white).
  return await sharp(rotated)
    .extract({ left, top, width, height })
    .resize({ width: 2576, height: 2576, fit: 'inside', withoutEnlargement: true })
    .sharpen({ sigma: 1.0 })
    .jpeg({ quality: 95 })
    .toBuffer()
}

function cardNumberOf(cardId: string): number {
  const m = (cardId || '').match(/[-_](\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

export interface TableExtractionHint {
  /** When set, the prompt tells the model the SUM of poolQty across all
   *  rows in this table MUST equal this value. Used for Leaders/Bases
   *  which are always exactly 6 in a sealed pool. */
  expectedPoolSum?: number
  /** Same for deckQty. Leaders/Bases always have exactly 1 in deck. */
  expectedDeckSum?: number
  /** When set, includes a recap of the previous attempt and the gap.
   *  Used by the refine pass on Leaders/Bases when the first call missed
   *  the count. */
  previousAttempt?: { rows: any[]; gap: string }
  /** When true, an extra prompt section warns that a prior extraction
   *  came back all-blank and asks for a careful re-examination. Used by
   *  the second-chance pass on sub-groups that voted 0 marked rows. */
  lookHarder?: boolean
}

function buildTableSystemPrompt(
  tableName: TableName,
  setCode: string,
  tableCards: any[],
  hint?: TableExtractionHint,
): string {
  const cardListLines = tableCards
    .map((c) => {
      const num = cardNumberOf(c.cardId) || '???'
      const sub = c.subtitle ? `, ${c.subtitle}` : ''
      const aspectStr = c.aspects && c.aspects.length > 0 ? ` [${c.aspects.join('+')}]` : ''
      return `- ${num} ${c.name}${sub} (${c.type})${aspectStr}`
    })
    .join('\n')

  // Stronger nudges for tables where the model has historically failed:
  //   - Bases: model sometimes reads pool=2 on a base; truth is almost always 1
  //   - Heroism / Villainy / NoAspect: small (≤8 cards) tables where model
  //     has bailed and returned 0 marked rows even when there were marks
  let tableSpecific = ''
  if (tableName === 'Bases') {
    tableSpecific +=
      '\nTABLE-SPECIFIC: Bases.\n' +
      '  - Each base is almost always poolQty=1 if marked. A base at poolQty=2 is RARE — default to 1 unless you can clearly see TWO distinct tally marks.\n' +
      '  - A sealed pool has 6 COMMON bases (one per pack) PLUS 0 or more RARE bases (rare slot in some packs). Total marked bases can be 6, 7, 8, or more — DO NOT artificially constrain to exactly 6. Mark every base where you see a tally; the total is whatever it is.\n'
  }
  if (tableCards.length <= 8) {
    tableSpecific +=
      '\nTABLE-SPECIFIC: this is a SMALL table (only ' +
      tableCards.length +
      ' cards). Do NOT bail with all blanks just because the table is short. Scan EVERY row carefully — many small sub-sections still contain 1-3 marked rows. Returning all-zeros for a small table when marks exist is the most common failure mode here.\n'
  }

  let constraintSection = ''
  if (hint?.expectedPoolSum != null || hint?.expectedDeckSum != null) {
    constraintSection += '\nSTRUCTURAL CONSTRAINT — these counts are FIXED for this table by the rules of sealed:\n'
    if (hint.expectedPoolSum != null) {
      constraintSection += `- The SUM of poolQty across all ${tableCards.length} rows in this table MUST equal exactly ${hint.expectedPoolSum}.\n`
      constraintSection += `  Most rows are blank (poolQty=0). The remaining ${hint.expectedPoolSum} have poolQty>0; usually each is poolQty=1, but a row can be poolQty=2 if the player drew the same ${tableName === 'Leaders' ? 'leader' : tableName === 'Bases' ? 'base' : 'card'} from two different packs.\n`
    }
    if (hint.expectedDeckSum != null) {
      constraintSection += `- The SUM of deckQty across all rows MUST equal exactly ${hint.expectedDeckSum}.\n`
      if (hint.expectedDeckSum === 1) {
        constraintSection += `  Exactly 1 row has deckQty=1 (the player's active selection); all others have deckQty=0.\n`
      }
    }
    constraintSection += `\nBefore returning, verify the sum constraint(s). If your sum is wrong, re-examine the cells you marked — pick the rows with the clearest marks. NEVER return a sum that doesn't match the constraint.\n`
  }

  let refineRecap = ''
  if (hint?.previousAttempt) {
    const marked = hint.previousAttempt.rows.filter((r: any) => r.poolQty > 0)
    refineRecap += `\nPREVIOUS ATTEMPT (this is your second pass on this table):\n`
    refineRecap += `You previously marked these ${marked.length} cards as poolQty>0:\n`
    for (const r of marked) {
      refineRecap += `- card ${r.cardNumber}: pool=${r.poolQty} deck=${r.deckQty} (conf ${r.poolQtyConfidence}/${r.deckQtyConfidence})\n`
    }
    refineRecap += `\nGap: ${hint.previousAttempt.gap}\n`
    refineRecap += `Look at the crop again with fresh eyes and produce a corrected response. The constraint above MUST be satisfied.\n`
  }

  return `You're parsing a CROPPED view of one table from a Star Wars: Unlimited sealed-deck registration sheet.

Set: ${setCode}
Table: ${tableName}

==================================================
STEP 0 — column anchoring. DO THIS FIRST, BEFORE ANY EXTRACTION.
==================================================

The crop has a header row at the top with FOUR labels left-to-right:
  "PLAYED"  |  "TOTAL"  |  "NO. #"  |  (card name)

The first two columns are very narrow (each ~5% of the crop width). Their order is FIXED on every sealed sheet:
  - PLAYED is ALWAYS the leftmost narrow column. Marks here = deckQty.
  - TOTAL is ALWAYS immediately to the right of PLAYED. Marks here = poolQty.
  - NO. # is the column with printed card numbers (174, 175, 176…).
  - card name is the rightmost wide column.

For every row in the crop, do this:
  1. Find the printed card number in the NO. # column.
  2. Look immediately to the LEFT of that number — that cell is the TOTAL cell. Is there a tally / digit? That's your poolQty for this row.
  3. Look one cell FURTHER LEFT — that cell is the PLAYED cell. Is there a tally / digit? That's your deckQty.

So scanning right-to-left from the card number: number → TOTAL → PLAYED.
DO NOT scan left-to-right and assume the first mark you see is PLAYED. The columns are too narrow to align that way reliably — anchor on the printed CARD NUMBER on the right, then walk leftward.

ROW-ANCHOR VERIFICATION (CRITICAL — prevents off-by-one errors):
When you see a mark in the TOTAL or PLAYED column, BEFORE you assign it to a card number, verify the mark is on THE SAME ROW as a printed number. Trace a horizontal line from the mark to the NO. # column on the right and confirm the printed number sitting on that exact horizontal row. The cardNumber you return MUST be the number on the SAME PHYSICAL ROW as the mark — not the row above, not the row below.

Off-by-one errors are a known failure mode here: the mark for "Boba Fett" (row 7) gets assigned to "Director Krennic" (row 8) because the rows are tightly packed and the model's eye drifts down by one. Counter this by: (a) if you see a mark, identify the row; (b) trace right to the printed number; (c) only THEN return that cardNumber. Do this for every mark.

Common error to avoid: returning every mark as deckQty. If you see a mark in only ONE of the two narrow columns, it is far more often the TOTAL column (poolQty) — players mark TOTAL for every card they own, but only mark PLAYED for the subset they put in their deck. So if a row has exactly one visible mark, your default should be poolQty=1 deckQty=0 unless you can clearly see the mark is in the leftmost column (PLAYED).

==================================================

The table contains exactly these ${tableCards.length} cards (ordered by their printed card number, which matches the "NO. #" column on the sheet):

${cardListLines}

Your job: for EACH of the ${tableCards.length} cards above, look at the corresponding row in the crop and return:

- cardNumber: the printed number (must come from the list above — do not invent)
- poolQty: integer 0-6, the count in the TOTAL column (how many copies the player owns)
- deckQty: integer 0-6, the count in the PLAYED column (how many in their main deck), must be ≤ poolQty
- poolQtyConfidence: "high" / "medium" / "low" — your read of the TOTAL cell
- deckQtyConfidence: "high" / "medium" / "low" — your read of the PLAYED cell

Counting marks in a cell:
- empty / dot / dash / "—" → 0
- single tally / check / slash → 1
- "||" or a "2" digit → 2 (sometimes a "1" tally is corrected to "2" — trust the FINAL state)
- "|||" or "3" → 3, etc.

CRITICAL — most rows are blank. Players only mark cards they own. Do NOT invent marks because the row exists. Empty rows are poolQty=0 deckQty=0.

CRITICAL — confidence is about handwriting legibility, not about the card name. The card name is fixed (you have the list above). Confidence is for the user to know which cells to verify by eye:
- "high": clearly empty cell, OR a clear sharp tally, OR a clear "2" / "3" digit
- "medium": you can see something but it's ambiguous (1 tally vs 2? smudge? possible mark?)
- "low": genuinely hard to read — faded, partially occluded, glare, blur

When uncertain between "blank" and "faint mark", prefer poolQty=0 with confidence="medium". Over-marking is worse than under-marking — the user's resolve UI will catch low-conf cells.

Return ALL ${tableCards.length} cards (most will have poolQty=0). Strict JSON, no prose.${tableSpecific}${constraintSection}${refineRecap}${
    hint?.lookHarder
      ? '\n\nLOOK-HARDER PASS: a previous attempt returned 0 marked rows for this sub-group, but small marks (especially in narrow PLAYED/TOTAL columns) are easy to miss on a first scan. Re-examine EVERY row carefully, especially looking for faint pencil tallies. Most non-empty sub-groups have at least 1 marked card. If after careful re-examination you still see no marks, return all-zeros — but please look one more time before doing so.\n'
      : ''
  }`
}

export async function extractTableFromCrop(
  client: Anthropic,
  cropBuffer: Buffer,
  tableName: TableName,
  tableCards: any[],
  setCode: string,
  hint?: TableExtractionHint,
  usage?: ExtractUsage,
): Promise<{ rows: TableExtractionRow[]; outputTokens: number }> {
  if (tableCards.length === 0) {
    return { rows: [], outputTokens: 0 }
  }

  const systemPrompt = buildTableSystemPrompt(tableName, setCode, tableCards, hint)
  const userText = `Look at the crop and return one entry per card listed in the system prompt — exactly ${tableCards.length} entries. Most will be poolQty=0.${
    hint?.expectedPoolSum != null
      ? ` Sum of poolQty MUST equal ${hint.expectedPoolSum}.`
      : ''
  }${
    hint?.expectedDeckSum != null
      ? ` Sum of deckQty MUST equal ${hint.expectedDeckSum}.`
      : ''
  }`

  // Manual retry on transient socket termination — same handling the main
  // loop uses.
  let response: any
  let attempt = 0
  while (true) {
    try {
      response = await client.messages
        .stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          output_config: {
            format: { type: 'json_schema', schema: TABLE_SCHEMA },
          } as any,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: cropBuffer.toString('base64'),
                  },
                },
                { type: 'text', text: userText },
              ],
            },
          ],
        } as any)
        .finalMessage()
      break
    } catch (err) {
      attempt++
      const msg = (err as Error)?.message || ''
      const isTransient =
        msg.includes('terminated') ||
        msg.includes('socket') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('timeout')
      if (!isTransient || attempt >= 3) throw err
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }

  addResponseUsage(usage, response.usage)
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      `extractTableFromCrop(${tableName}): max_tokens hit (${MAX_TOKENS}, output=${response.usage.output_tokens})`,
    )
  }
  if (response.stop_reason === 'refusal') {
    throw new Error(`extractTableFromCrop(${tableName}): refusal`)
  }

  const textBlock = response.content.find((b: any) => b.type === 'text') as any
  if (!textBlock) {
    throw new Error(`extractTableFromCrop(${tableName}): no text block`)
  }

  let parsed: any
  try {
    parsed = JSON.parse(textBlock.text)
  } catch (err) {
    throw new Error(
      `extractTableFromCrop(${tableName}): invalid JSON: ${(err as Error).message}`,
    )
  }
  return { rows: parsed.rows || [], outputTokens: response.usage.output_tokens }
}

export interface MultiSampleVoteCount {
  /** card number → number of samples that returned poolQty>0 for this card */
  poolMarkedCount: Map<number, number>
  /** card number → number of samples that returned deckQty>0 for this card */
  deckMarkedCount: Map<number, number>
  totalSamples: number
}

/**
 * Run extractTableFromCrop N times in parallel and vote per card.
 *
 * Variance is real — the same crop + same prompt produces different
 * counts across runs. Voting smooths it out: for each card, we take
 * the most-common (poolQty, deckQty) across samples. Ties prefer 0
 * (conservative — under-counting is recoverable in the resolve UI;
 * over-counting requires the user to delete rows).
 *
 * Returned confidences reflect the agreement: "high" if all N samples
 * agreed; "medium" if the majority agreed; "low" if no majority.
 *
 * If N=1, this is exactly equivalent to extractTableFromCrop.
 */
export async function extractTableMultiSample(
  client: Anthropic,
  cropBuffer: Buffer,
  tableName: TableName,
  tableCards: any[],
  setCode: string,
  samples: number,
  hint?: TableExtractionHint,
  usage?: ExtractUsage,
): Promise<{
  rows: TableExtractionRow[]
  outputTokens: number
  samplesRun: number
  voteCount: MultiSampleVoteCount
}> {
  const n = Math.max(1, Math.min(11, samples))
  if (tableCards.length === 0) {
    return {
      rows: [],
      outputTokens: 0,
      samplesRun: 0,
      voteCount: { poolMarkedCount: new Map(), deckMarkedCount: new Map(), totalSamples: 0 },
    }
  }
  if (n === 1) {
    const r = await extractTableFromCrop(client, cropBuffer, tableName, tableCards, setCode, hint, usage)
    const poolMarkedCount = new Map<number, number>()
    const deckMarkedCount = new Map<number, number>()
    for (const row of r.rows) {
      if (row.poolQty > 0) poolMarkedCount.set(row.cardNumber, 1)
      if (row.deckQty > 0) deckMarkedCount.set(row.cardNumber, 1)
    }
    return {
      ...r,
      samplesRun: 1,
      voteCount: { poolMarkedCount, deckMarkedCount, totalSamples: 1 },
    }
  }

  const sampleResults = await Promise.all(
    Array.from({ length: n }).map(() =>
      extractTableFromCrop(client, cropBuffer, tableName, tableCards, setCode, hint, usage).catch(
        (err) => {
          console.warn(`[multi-sample] ${tableName}: sample failed: ${(err as Error).message}`)
          return null
        },
      ),
    ),
  )
  const goodResults = sampleResults.filter((r): r is { rows: TableExtractionRow[]; outputTokens: number } => !!r)
  if (goodResults.length === 0) {
    throw new Error(`extractTableMultiSample(${tableName}): all ${n} samples failed`)
  }

  // Vote per card: collect (pool, deck) tuples per cardNumber across samples,
  // pick the most common; tie → prefer (0, 0). For mixed pool/deck observations
  // on a card, vote independently then clamp deck ≤ pool.
  type VoteCounts = { pool: Map<number, number>; deck: Map<number, number> }
  const votes = new Map<number, VoteCounts>()
  for (const card of tableCards) {
    const num = (card.cardId.match(/[-_](\d+)$/) || [])[1]
    if (num != null) {
      votes.set(parseInt(num, 10), { pool: new Map(), deck: new Map() })
    }
  }
  for (const result of goodResults) {
    for (const row of result.rows) {
      const v = votes.get(row.cardNumber)
      if (!v) continue
      v.pool.set(row.poolQty, (v.pool.get(row.poolQty) || 0) + 1)
      v.deck.set(row.deckQty, (v.deck.get(row.deckQty) || 0) + 1)
    }
  }

  function pickMode(m: Map<number, number>, totalSamples: number): { value: number; agreement: number } {
    if (m.size === 0) return { value: 0, agreement: 0 }
    let bestValue = 0
    let bestCount = 0
    // Iterate in ascending value order so ties prefer the lower (more conservative) value.
    const sortedKeys = [...m.keys()].sort((a, b) => a - b)
    for (const v of sortedKeys) {
      const c = m.get(v)!
      if (c > bestCount) {
        bestValue = v
        bestCount = c
      }
    }
    return { value: bestValue, agreement: bestCount / totalSamples }
  }

  const totalSamples = goodResults.length
  const finalRows: TableExtractionRow[] = []
  const poolMarkedCount = new Map<number, number>()
  const deckMarkedCount = new Map<number, number>()

  for (const card of tableCards) {
    const num = parseInt((card.cardId.match(/[-_](\d+)$/) || [])[1] || '0', 10)
    const v = votes.get(num)!
    const poolPick = pickMode(v.pool, totalSamples)
    const deckPick = pickMode(v.deck, totalSamples)
    let pool = poolPick.value
    let deck = deckPick.value
    if (deck > pool) deck = pool // structural enforcement
    const conf = (a: number): 'high' | 'medium' | 'low' =>
      a >= 0.99 ? 'high' : a >= 0.5 ? 'medium' : 'low'
    finalRows.push({
      cardNumber: num,
      poolQty: pool,
      deckQty: deck,
      poolQtyConfidence: conf(poolPick.agreement),
      deckQtyConfidence: conf(deckPick.agreement),
    })
    // Track raw vote counts (any sample with >0 counts as 1 vote) for
    // top-N post-processing on Leaders/Bases by the orchestrator.
    let pVotes = 0
    for (const [val, cnt] of v.pool) if (val > 0) pVotes += cnt
    if (pVotes > 0) poolMarkedCount.set(num, pVotes)
    let dVotes = 0
    for (const [val, cnt] of v.deck) if (val > 0) dVotes += cnt
    if (dVotes > 0) deckMarkedCount.set(num, dVotes)
  }

  const totalOutput = goodResults.reduce((s, r) => s + r.outputTokens, 0)
  return {
    rows: finalRows,
    outputTokens: totalOutput,
    samplesRun: totalSamples,
    voteCount: { poolMarkedCount, deckMarkedCount, totalSamples },
  }
}
