/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PROTOTYPE: agentic registration-sheet extraction.
 *
 * Instead of the fixed Phase 1 → Phase 2 pipeline (deterministic crops, one
 * shot per table, invariant-repair prompts), this gives the model the whole
 * sheet plus two tools and lets IT drive:
 *
 *   crop_region  — request any region of either photo; served at native
 *                  resolution, tiled to ≤1568px so the API never downscales
 *   submit_rows  — schema-enforced final answer, terminates the loop
 *
 * Design principles learned from the 2026-07-03 fixture adjudication:
 *   - Sheets come in species: full sealed (96 pool / 6L / 6B), draft
 *     (48 = 3×16 / 3L / 3B), deck-only (~30-35 marks, PLAYED column empty).
 *     The model identifies the species from the marks; totals are checked
 *     against the species it claims, never forced.
 *   - NO fabrication pressure. A shortfall is reported in `unresolved`,
 *     not papered over with invented rows.
 *   - Rows are transcribed as printed card NUMBERS (bases by name — the
 *     BASE table has no numbers) and joined server-side against cards.json,
 *     so name/subtitle/type are canonical by construction.
 *
 * Eval-harness only for now: not wired into any route. Run via
 * scripts/eval/run-agentic.ts.
 */
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join } from 'path'

const DEFAULT_MODEL = process.env.IMPORT_EXTRACT_MODEL || 'claude-fable-5'
const MAX_TURNS = 24
const MAX_TOKENS_PER_CALL = 16000
// Runaway guard: abort if cumulative output (incl. thinking) exceeds this.
const OUTPUT_TOKEN_BUDGET = 150_000

export interface AgenticImage {
  data: string // base64
  mediaType: 'image/jpeg' | 'image/png'
}

export interface AgenticUsage {
  apiCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface AgenticRow {
  name: string
  subtitle: string | null
  type: string
  poolQty: number
  deckQty: number
}

export interface AgenticResult {
  sheetSpecies: string
  rows: AgenticRow[]
  unresolved: string | null
  totals: { pool: number; deck: number; leaders: number; bases: number }
  usage: AgenticUsage
  turns: number
  elapsedMs: number
  model: string
}

interface CardRec {
  number: number
  name: string
  subtitle: string | null
  type: string
}

function loadSetCards(setCode: string): CardRec[] {
  const raw = JSON.parse(
    readFileSync(join(process.env.REPO_ROOT || process.cwd(), 'src/data/cards.json'), 'utf8'),
  )
  const arr: any[] = Array.isArray(raw) ? raw : raw.cards || Object.values(raw)
  return arr
    .filter((c) => (c.set || '').toString().toUpperCase() === setCode.toUpperCase())
    .map((c) => ({
      number: Number(c.number),
      name: c.name as string,
      subtitle: (c.subtitle as string) || null,
      type: c.type as string,
    }))
    .filter((c) => Number.isFinite(c.number))
    .sort((a, b) => a.number - b.number)
}

function systemPrompt(setCode: string, cards: CardRec[]): any[] {
  const cardList = cards
    .map((c) => `${c.number}|${c.name}${c.subtitle ? ` — ${c.subtitle}` : ''}|${c.type}`)
    .join('\n')
  const text = `You are reading a Star Wars: Unlimited limited-event registration sheet (set ${setCode}) photographed with a phone. Your job: report EXACTLY the handwritten marks on the sheet — nothing more, nothing less.

SHEET LAYOUT
- Tables: LEADER, BASE, then one per aspect (Vigilance/Command/Aggression/Cunning/Heroism/Villainy/Multicolor/No Aspect), split across the two photos.
- Row columns: PLAYED | TOTAL | NO. # | card name. TOTAL = copies in the player's pool (poolQty). PLAYED = copies in their deck (deckQty).
- The BASE table has NO number column — identify bases by printed name.
- Marks are handwritten tallies or digits: one stroke = 1, "||" or "2" = 2, etc. Most rows are EMPTY — only report rows where you can SEE a mark.

SHEET SPECIES — identify which one this is from the marks themselves:
- "sealed": full pool registration. Pool sums to 96 with 6 leaders and 6 bases (rows may repeat via qty >1).
- "draft": drafted pool. Pool sums to 48 (3 packs × 16) with 3 leaders and 3 bases.
- "deck_only": player registered only their deck. ~30-35 total marks (30+ deck cards + active leader + active base), often with the PLAYED column entirely empty.
- "unknown": marks don't fit any pattern. Say so — do not force a fit.

HONESTY RULES (these override everything)
- NEVER invent a row, a leader, a base, or a qty to make totals match a species. If your count comes up short, re-examine the likely tables once, and if still short, report the shortfall in "unresolved".
- An empty cell is qty 0. A row with no visible mark does not exist in your output.
- If a mark is ambiguous (1 vs 2, smudge vs stroke), pick the most likely reading and mention the row in "unresolved".

METHOD
1. From the overview images, locate every table and note which photo it is on.
2. Work table by table with crop_region. Request crops at fractions of the photo; keep each crop's native pixel size ≤1568 on the long side (roughly ≤0.36 of photo width, ≤0.5 of photo height for a 2160×2880 photo) — larger regions get downscaled and faint pencil marks vanish. Tile tall tables (Multicolor) into two overlapping crops.
3. Read the qty columns row by row. Transcribe the printed card NUMBER for each marked row (bases: the printed name).
4. Before submitting: sum your poolQty and deckQty, check leaders/bases counts against the species you identified, and re-crop any table whose numbers look off. Then call submit_rows ONCE with everything.

CARD LIST for ${setCode} (number|name — subtitle|type). Use it to sanity-check numbers you transcribe; if a number you read doesn't match the name printed next to it on the sheet, re-read the row:
${cardList}`
  return [
    {
      type: 'text',
      text,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ]
}

const TOOLS: any[] = [
  {
    name: 'crop_region',
    description:
      'Crop a rectangular region of one photo and return it at native resolution (auto-tiled to ≤1568px). Coordinates are fractions 0-1 of photo width/height.',
    input_schema: {
      type: 'object',
      properties: {
        photoIndex: { type: 'integer', description: '0-based photo index' },
        x0: { type: 'number' },
        y0: { type: 'number' },
        x1: { type: 'number' },
        y1: { type: 'number' },
      },
      required: ['photoIndex', 'x0', 'y0', 'x1', 'y1'],
    },
  },
  {
    name: 'submit_rows',
    description:
      'Submit the final extraction. Call exactly once, after self-checking totals. Rows: one entry per marked row. Regular cards: give "number" (printed card number). Bases: give "baseName" instead.',
    input_schema: {
      type: 'object',
      properties: {
        sheetSpecies: { type: 'string', enum: ['sealed', 'draft', 'deck_only', 'unknown'] },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              number: { type: ['integer', 'null'] },
              baseName: { type: ['string', 'null'] },
              poolQty: { type: 'integer', minimum: 0, maximum: 6 },
              deckQty: { type: 'integer', minimum: 0, maximum: 6 },
            },
            required: ['poolQty', 'deckQty'],
          },
        },
        unresolved: {
          type: ['string', 'null'],
          description: 'Ambiguous rows, shortfalls vs the species physics, or other honesty notes. null if clean.',
        },
      },
      required: ['sheetSpecies', 'rows'],
    },
  },
]

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err: any) {
      attempt++
      const status = err?.status
      const msg = String(err?.message || '')
      const transient =
        status === 429 || status === 500 || status === 529 || /overloaded|rate.?limit|terminated|socket|ECONNRESET|timeout/i.test(msg)
      if (!transient || attempt >= 4) throw err
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
}

/** Strip previous rolling cache markers so we never exceed the 4-breakpoint cap. */
function stripMessageCacheMarkers(messages: any[]) {
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue
    for (const block of m.content) {
      if (block && typeof block === 'object' && block.cache_control) delete block.cache_control
      // Markers can sit on blocks nested inside a tool_result's content array.
      if (block && Array.isArray(block.content)) {
        for (const inner of block.content) {
          if (inner && typeof inner === 'object' && inner.cache_control) delete inner.cache_control
        }
      }
    }
  }
}

export async function extractPoolAgentic(
  images: AgenticImage[],
  opts: { setCode: string; model?: string },
): Promise<AgenticResult> {
  if (images.length < 1 || images.length > 2) throw new Error('agentic extract expects 1-2 images')
  const model = opts.model || DEFAULT_MODEL
  const cards = loadSetCards(opts.setCode)
  if (cards.length === 0) throw new Error(`no cards found for set ${opts.setCode}`)
  const byNum = new Map(cards.map((c) => [c.number, c]))
  const client = new Anthropic({ timeout: 600_000 })

  const buffers = images.map((img) => Buffer.from(img.data, 'base64'))
  const metas = await Promise.all(buffers.map((b) => sharp(b).metadata()))

  // Overview images: fit within 1568 so the first turn is cheap and stable.
  const overviews = await Promise.all(
    buffers.map((b) =>
      sharp(b).resize(1568, 1568, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer(),
    ),
  )

  const usage: AgenticUsage = {
    apiCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  }
  const start = Date.now()

  const messages: any[] = [
    {
      role: 'user',
      content: [
        ...overviews.flatMap((buf, i) => [
          { type: 'text', text: `Photo ${i} overview (native ${metas[i]!.width}×${metas[i]!.height}):` },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') },
          },
        ]),
        {
          type: 'text',
          text: 'Extract this registration sheet. Work table by table with crop_region, then submit_rows once.',
        },
      ],
    },
  ]

  let final: { sheetSpecies: string; rows: AgenticRow[]; unresolved: string | null } | null = null
  let turns = 0

  for (let turn = 0; turn < MAX_TURNS && !final; turn++) {
    turns = turn + 1
    const resp: any = await withRetry(() =>
      client.messages.create({
        model,
        max_tokens: MAX_TOKENS_PER_CALL,
        system: systemPrompt(opts.setCode, cards),
        tools: TOOLS,
        messages,
      }),
    )
    usage.apiCalls++
    usage.inputTokens += resp.usage?.input_tokens || 0
    usage.outputTokens += resp.usage?.output_tokens || 0
    usage.cacheReadTokens += resp.usage?.cache_read_input_tokens || 0
    usage.cacheCreationTokens += resp.usage?.cache_creation_input_tokens || 0
    if (usage.outputTokens > OUTPUT_TOKEN_BUDGET) {
      throw new Error(`agentic extract exceeded output budget (${usage.outputTokens} tokens, ${turns} turns)`)
    }

    messages.push({ role: 'assistant', content: resp.content })

    const toolUses = (resp.content || []).filter((b: any) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      if (resp.stop_reason === 'max_tokens') {
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: 'You hit the output limit. Continue; call submit_rows when done.' }],
        })
        continue
      }
      // Ended its turn without submitting — nudge once per occurrence.
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: 'Call submit_rows with your final extraction (or crop_region if you still need to look).' }],
      })
      continue
    }

    const results: any[] = []
    for (const tu of toolUses) {
      if (tu.name === 'crop_region') {
        const { photoIndex, x0, y0, x1, y1 } = tu.input || {}
        const i = Number(photoIndex)
        if (!(i >= 0 && i < buffers.length)) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: `photoIndex must be 0-${buffers.length - 1}` })
          continue
        }
        const W = metas[i]!.width!, H = metas[i]!.height!
        const fx0 = Math.max(0, Math.min(1, Number(x0))), fy0 = Math.max(0, Math.min(1, Number(y0)))
        const fx1 = Math.max(0, Math.min(1, Number(x1))), fy1 = Math.max(0, Math.min(1, Number(y1)))
        const left = Math.round(fx0 * W), top = Math.round(fy0 * H)
        const width = Math.max(20, Math.round((fx1 - fx0) * W)), height = Math.max(20, Math.round((fy1 - fy0) * H))
        if (width < 40 || height < 40) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: 'region too small — give a box covering the table' })
          continue
        }
        try {
          let pipe = sharp(buffers[i]).extract({
            left: Math.min(left, W - width),
            top: Math.min(top, H - height),
            width: Math.min(width, W),
            height: Math.min(height, H),
          })
          const scaled = width > 1568 || height > 1568
          if (scaled) pipe = pipe.resize(1568, 1568, { fit: 'inside' })
          const out = await pipe.jpeg({ quality: 90 }).toBuffer()
          const outMeta = await sharp(out).metadata()
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: [
              {
                type: 'text',
                text: `photo ${i} crop (${fx0.toFixed(2)},${fy0.toFixed(2)})→(${fx1.toFixed(2)},${fy1.toFixed(2)}) rendered ${outMeta.width}×${outMeta.height}${scaled ? ' (DOWNSCALED — request a smaller region for native detail)' : ' (native)'}`,
              },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: out.toString('base64') } },
            ],
          })
        } catch (err: any) {
          results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: `crop failed: ${err.message}` })
        }
      } else if (tu.name === 'submit_rows') {
        const input = tu.input || {}
        const errors: string[] = []
        const rows: AgenticRow[] = []
        const seen = new Set<string>()
        for (const r of input.rows || []) {
          const pool = Number(r.poolQty), deck = Number(r.deckQty)
          if (!(pool > 0) && !(deck > 0)) continue
          let card: CardRec | undefined
          if (r.number != null) {
            card = byNum.get(Number(r.number))
            if (!card) errors.push(`unknown card number ${r.number}`)
          } else if (r.baseName) {
            const want = String(r.baseName).toLowerCase().replace(/[^a-z0-9]/g, '')
            card = cards.find((c) => c.type === 'Base' && c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === want)
              || cards.find((c) => c.type === 'Base' && c.name.toLowerCase().includes(String(r.baseName).toLowerCase()))
            if (!card) errors.push(`unknown base "${r.baseName}"`)
          } else {
            errors.push('row missing both number and baseName')
          }
          if (!card) continue
          const key = `${card.type}|${card.name}`
          if (seen.has(key)) {
            errors.push(`duplicate row for ${card.name} — merge quantities into one row`)
            continue
          }
          seen.add(key)
          rows.push({ name: card.name, subtitle: card.subtitle, type: card.type, poolQty: pool, deckQty: deck })
        }
        if (errors.length > 0) {
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            is_error: true,
            content: `Fix these and resubmit:\n- ${errors.join('\n- ')}`,
          })
        } else {
          final = {
            sheetSpecies: String(input.sheetSpecies || 'unknown'),
            rows,
            unresolved: input.unresolved ? String(input.unresolved) : null,
          }
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: 'accepted' })
        }
      } else {
        results.push({ type: 'tool_result', tool_use_id: tu.id, is_error: true, content: `unknown tool ${tu.name}` })
      }
    }

    // Rolling cache marker on the newest user turn (images accumulate fast).
    stripMessageCacheMarkers(messages)
    const last = results[results.length - 1]
    if (last && Array.isArray(last.content)) last.content[last.content.length - 1].cache_control = { type: 'ephemeral' }
    else if (last) last.cache_control = { type: 'ephemeral' }
    messages.push({ role: 'user', content: results })
  }

  if (!final) throw new Error(`agentic extract did not submit within ${MAX_TURNS} turns`)

  const totals = {
    pool: final.rows.reduce((s, r) => s + r.poolQty, 0),
    deck: final.rows.reduce((s, r) => s + r.deckQty, 0),
    leaders: final.rows.filter((r) => r.type === 'Leader').reduce((s, r) => s + r.poolQty, 0),
    bases: final.rows.filter((r) => r.type === 'Base').reduce((s, r) => s + r.poolQty, 0),
  }
  return { ...final, totals, usage, turns, elapsedMs: Date.now() - start, model }
}
