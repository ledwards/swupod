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

const MODEL = 'claude-opus-4-7'
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
  const meta = await sharp(imageBuffer).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w === 0 || h === 0) throw new Error('cropForTable: image has zero dimension')
  const padX = w * 0.02
  const padY = h * 0.02
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
  return await sharp(imageBuffer).extract({ left, top, width, height }).jpeg({ quality: 95 }).toBuffer()
}

function cardNumberOf(cardId: string): number {
  const m = (cardId || '').match(/[-_](\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

function buildTableSystemPrompt(
  tableName: TableName,
  setCode: string,
  tableCards: any[],
): string {
  const cardListLines = tableCards
    .map((c) => {
      const num = cardNumberOf(c.cardId) || '???'
      const sub = c.subtitle ? `, ${c.subtitle}` : ''
      const aspectStr = c.aspects && c.aspects.length > 0 ? ` [${c.aspects.join('+')}]` : ''
      return `- ${num} ${c.name}${sub} (${c.type})${aspectStr}`
    })
    .join('\n')

  return `You're parsing a CROPPED view of one table from a Star Wars: Unlimited sealed-deck registration sheet.

Set: ${setCode}
Table: ${tableName}

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

Return ALL ${tableCards.length} cards (most will have poolQty=0). Strict JSON, no prose.`
}

export async function extractTableFromCrop(
  client: Anthropic,
  cropBuffer: Buffer,
  tableName: TableName,
  tableCards: any[],
  setCode: string,
): Promise<{ rows: TableExtractionRow[]; outputTokens: number }> {
  if (tableCards.length === 0) {
    return { rows: [], outputTokens: 0 }
  }

  const systemPrompt = buildTableSystemPrompt(tableName, setCode, tableCards)
  const userText = `Look at the crop and return one entry per card listed in the system prompt — exactly ${tableCards.length} entries. Most will be poolQty=0.`

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
