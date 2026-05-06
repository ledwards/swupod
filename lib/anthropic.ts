// @ts-nocheck
/**
 * Anthropic SDK wrapper for the Import Pool feature (U2).
 *
 * Mirrors the lib/discord.ts / lib/patreon.ts pattern: narrow domain functions,
 * env-var checks centralised, retries handled here. Route handlers stay thin
 * and easy to test (mock this module's exports rather than the SDK).
 *
 * See docs/plans/2026-05-05-001-feat-import-pool-spike-plan.md U2.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getCachedCards, initializeCardCache } from '../src/utils/cardCache'
import { getLatestReleasedSetCode } from '../src/utils/setConfigs/latest'

const MODEL = 'claude-opus-4-7'
// Vision parses can produce 80-100 JSON rows. 32K leaves comfortable headroom
// (Opus 4.7 supports up to 128K). Stays under the SDK's non-streaming HTTP
// timeout window. If responses still truncate, the route surfaces stop_reason.
const MAX_TOKENS = 32000

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set')
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

// === Types ===

export interface ImageInput {
  /** Base64-encoded image data (no data URL prefix) */
  data: string
  /** MIME type, e.g. "image/jpeg" */
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
}

export interface ExtractedRow {
  name: string
  type: 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade'
  subtitle: string | null
  poolQty: number
  deckQty: number
  aspectGroup: string | null
}

export interface ExtractedHeader {
  setName: string | null
  eventName: string | null
  eventDate: string | null
  playerName: string | null
  leader: { name: string | null; subtitle: string | null }
  base: { name: string | null; subtitle: string | null }
}

export interface RawExtractResponse {
  header: ExtractedHeader
  rows: ExtractedRow[]
}

// === System prompt (stable — prompt-cached) ===
//
// Frozen content lives here so the prefix bytes never change between calls.
// Anything dynamic (image, set hint) goes in the user turn after the cache
// breakpoint.
const SYSTEM_PROMPT = `You are an expert at parsing competitive sealed-deck registration sheets for the Star Wars: Unlimited TCG.

A separate system block immediately following this one provides a KNOWN CARD LIST for the set — every card name, subtitle, type, and aspect combination. Treat that list as your closed vocabulary. Every card name you return MUST come from that list. When OCR is ambiguous between two similar names, pick the one in the list. When two cards in the list share a name, use the subtitle to disambiguate.

You will receive one or two photographs of a registration sheet. The sheet lists EVERY card in the set (250+ rows). Most rows are blank — the player has only filled in marks for the cards they actually own.

The sheet has:
- A header: set name, event name, event date, player name, selected leader, selected base
- A LEADER section (lists all ~18 leaders in the set)
- A BASE section (lists all ~12 bases in the set)
- Aspect-grouped sections (Vigilance, Command, Aggression, Cunning, Villainy, Heroism, Multicolor, No Aspect) listing all non-leader/non-base cards
- Each row has columns: PLAYED | TOTAL | NO. # (card number) | card name + subtitle

CRITICAL READING RULES — these are where extraction goes wrong if you're not careful:

1. **Most rows are EMPTY.** A registration sheet pre-prints every card in the set. The player only marks the rows for cards they own. Rows with NO marks in BOTH the PLAYED and TOTAL columns are poolQty=0 AND deckQty=0. Do NOT fill in 1 because the row exists — only fill in qty when you can SEE a mark.

2. **Counting marks.**
   - An empty cell, dot, dash, or "—" = 0
   - A single tally mark, slash, check, or filled dot = 1
   - Two tally marks "||" or a "2" = 2
   - Three tally marks or "3" = 3
   - And so on (up to 6 for poolQty, 4 typically for deckQty per card)
   - If you can see a mark but can't tell the count, use 1 and let the user verify

3. **Leaders and bases.**
   - A typical sealed pool gives the player 6 leaders (one per pack) out of ~18 in the set, and 6 bases out of ~12.
   - Most leader/base rows on the sheet should be poolQty=0.
   - Exactly ONE leader and ONE base will have deckQty=1 (the active selection).
   - The other 5 leaders and 5 bases have poolQty=1 but deckQty=0 (in the pool, not selected).
   - 12 leader rows and 6 base rows will be poolQty=0, deckQty=0.

4. **Other cards (Units / Events / Upgrades).**
   - The player owns ~80 unique cards across these aspects.
   - poolQty = how many copies the player owns (1 to 6, sum across all rows = 84).
   - deckQty = how many of those copies are in the main deck (0 to poolQty, sum = ~50).
   - Rows for cards the player doesn't own should be poolQty=0, deckQty=0.

5. **Total invariant.** Sum of poolQty across ALL rows must equal exactly 96 (6 leaders + 6 bases + 84 other). If your totals don't add up, re-check rows you marked qty>0 — you likely added marks where there are none.

6. **For each row, return:**
   - "name": the printed card name (e.g. "Han Solo")
   - "type": exactly one of "Leader" / "Base" / "Unit" / "Event" / "Upgrade"
   - "subtitle": the printed subtitle (e.g. "Audacious Smuggler") or null if no subtitle is printed
   - "poolQty": integer 0-6 from the TOTAL column
   - "deckQty": integer 0-6 from the PLAYED column (must not exceed poolQty)
   - "aspectGroup": the section header the row appears under (e.g. "Vigilance", "Command", "Aggression Vigilance", "Multicolor", "No Aspect")

7. **Names you can't read.** If a card name is unreadable, use the literal string "?". Never invent cards.

Return strict JSON conforming to the response schema. Do not include any prose, markdown, or explanation outside the JSON. The user will verify the result against the source sheet, so accuracy on what's NOT marked matters as much as accuracy on what IS marked.`

// === Set card list grounding ===
//
// Passes the full Normal-variant card list for the relevant set as a second
// system block. Claude treats it as a closed vocabulary — vastly improves
// accuracy on partial-name reads and disambiguates same-name cards by
// subtitle. Cached per-set with cache_control:ephemeral so the ~5K token
// payload is paid once per 5-minute window per set.

interface CardListEntry {
  cardId: string
  name: string
  subtitle: string | null
  type: string
  aspects: string[]
  isLeader?: boolean
  isBase?: boolean
}

function buildSetCardListContext(setCode: string): string {
  // initializeCardCache is sync (cards.json is bundled), but the API is Promise-shaped.
  initializeCardCache().catch(() => {})
  const cards = getCachedCards(setCode).filter((c: any) => c.variantType === 'Normal')

  if (cards.length === 0) {
    return `=== KNOWN CARD LIST FOR SET ${setCode} ===\n(No cached card data — match what you see on the sheet best you can.)`
  }

  const leaders = cards.filter((c: any) => c.isLeader)
  const bases = cards.filter((c: any) => c.isBase)
  const others = cards.filter((c: any) => !c.isLeader && !c.isBase)

  const num = (cardId: string) => {
    const m = cardId.match(/[-_](\d+)$/)
    return m ? parseInt(m[1], 10) : 0
  }
  const fmt = (c: CardListEntry, includeType: boolean) => {
    const n = num(c.cardId)
    const sub = c.subtitle ? `, ${c.subtitle}` : ''
    const aspectStr = c.aspects && c.aspects.length > 0 ? `[${c.aspects.join('+')}]` : ''
    const typeStr = includeType ? ` (${c.type})` : ''
    return `  ${n}. ${c.name}${sub}${aspectStr ? ' ' + aspectStr : ''}${typeStr}`
  }

  let out = `=== KNOWN CARD LIST FOR SET ${setCode} ===\n`
  out +=
    `This is the COMPLETE list of cards in this set. Every card name on the sheet ` +
    `MUST match a name from this list (handle OCR errors by picking the closest match). ` +
    `When two cards share a name (e.g. multiple "Han Solo" entries), use the subtitle to disambiguate. ` +
    `If you can't read a card name on the sheet, return "?" rather than guessing.\n\n`

  out += `LEADERS (${leaders.length}):\n`
  for (const c of leaders.sort((a: any, b: any) => num(a.cardId) - num(b.cardId))) {
    out += fmt(c, false) + '\n'
  }

  out += `\nBASES (${bases.length}):\n`
  for (const c of bases.sort((a: any, b: any) => num(a.cardId) - num(b.cardId))) {
    out += fmt(c, false) + '\n'
  }

  // Group "others" by primary aspect combination to mirror the registration sheet's organization.
  const byAspect = new Map<string, CardListEntry[]>()
  for (const c of others) {
    const key = ((c.aspects || []) as string[]).slice().sort().join('+') || 'NO ASPECT'
    if (!byAspect.has(key)) byAspect.set(key, [])
    byAspect.get(key)!.push(c)
  }
  // Stable section order
  const aspectOrder = [
    'Vigilance',
    'Command',
    'Aggression',
    'Cunning',
    'Heroism',
    'Villainy',
    'NO ASPECT',
  ]
  const sortedKeys = [...byAspect.keys()].sort((a, b) => {
    const aIsSingle = !a.includes('+')
    const bIsSingle = !b.includes('+')
    if (aIsSingle !== bIsSingle) return aIsSingle ? -1 : 1
    if (aIsSingle) {
      return aspectOrder.indexOf(a) - aspectOrder.indexOf(b)
    }
    return a.localeCompare(b)
  })

  for (const key of sortedKeys) {
    const cs = byAspect.get(key)!
    out += `\n${key.toUpperCase()} (${cs.length}):\n`
    for (const c of cs.sort((a: any, b: any) => num(a.cardId) - num(b.cardId))) {
      out += fmt(c, true) + '\n'
    }
  }

  return out
}

// === JSON schema for structured output ===
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    header: {
      type: 'object',
      additionalProperties: false,
      properties: {
        setName: { type: ['string', 'null'] },
        eventName: { type: ['string', 'null'] },
        eventDate: { type: ['string', 'null'] },
        playerName: { type: ['string', 'null'] },
        leader: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: ['string', 'null'] },
            subtitle: { type: ['string', 'null'] },
          },
          required: ['name', 'subtitle'],
        },
        base: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: ['string', 'null'] },
            subtitle: { type: ['string', 'null'] },
          },
          required: ['name', 'subtitle'],
        },
      },
      required: ['setName', 'eventName', 'eventDate', 'playerName', 'leader', 'base'],
    },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['Leader', 'Base', 'Unit', 'Event', 'Upgrade'] },
          subtitle: { type: ['string', 'null'] },
          poolQty: { type: 'integer' },
          deckQty: { type: 'integer' },
          aspectGroup: { type: ['string', 'null'] },
        },
        required: ['name', 'type', 'subtitle', 'poolQty', 'deckQty', 'aspectGroup'],
      },
    },
  },
  required: ['header', 'rows'],
}

// === Public API ===

interface ExtractOptions {
  /** Optional set hint surfaced to the model (e.g., "LAW") if the user explicitly picked one */
  setHint?: string
}

/**
 * Extract pool data from one or two registration-sheet images.
 *
 * Throws on:
 * - Missing ANTHROPIC_API_KEY env var
 * - Empty images array
 * - Persistent upstream failure (after SDK retries; surfaces as Anthropic.APIError)
 * - Malformed JSON response from the model
 */
export async function extractPoolFromImages(
  images: ImageInput[],
  opts: ExtractOptions = {},
): Promise<RawExtractResponse> {
  if (images.length === 0) {
    throw new Error('extractPoolFromImages requires at least 1 image')
  }
  if (images.length > 2) {
    throw new Error('extractPoolFromImages supports at most 2 images')
  }

  const client = getClient()

  // Default to the latest released set when no hint provided. Most players
  // are uploading sheets for the current set; passing the wrong set's card
  // list still works (Claude reads what's on the sheet) but loses the
  // grounding benefit, so we want the most-likely-correct list as default.
  const groundingSetCode = opts.setHint || getLatestReleasedSetCode()
  const cardListContext = buildSetCardListContext(groundingSetCode)

  const userContent: Anthropic.MessageParam['content'] = []
  for (const image of images) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    })
  }
  userContent.push({
    type: 'text',
    text: opts.setHint
      ? `Extract the registration sheet data. The user has indicated this sheet is for set "${opts.setHint}". Use the KNOWN CARD LIST above as your closed vocabulary.`
      : `Extract the registration sheet data. Detect the set from the header. The KNOWN CARD LIST above is for set "${groundingSetCode}" — if the sheet header indicates a different set, still use the names from the list when they match what you see, and report the detected set name in the header.`,
  })

  // Streaming required: SDK rejects non-streaming requests that may take >10 min,
  // which fires above ~16K max_tokens. .finalMessage() resolves with the same
  // Message shape we'd get back from messages.create.
  //
  // Two cached system blocks:
  //  1. SYSTEM_PROMPT — frozen extraction rules; cached once across all sets
  //  2. cardListContext — closed vocabulary for the chosen set; cached per-set
  // Anthropic's 4-breakpoint limit lets us stack both with ephemeral caching.
  const response = await client.messages
    .stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: cardListContext,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
      messages: [{ role: 'user', content: userContent }],
    })
    .finalMessage()

  // Surface truncation explicitly — far more useful than a generic JSON parse error.
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      `Anthropic response truncated at max_tokens (${MAX_TOKENS}). ` +
      `Response had ${response.usage.output_tokens} output tokens. ` +
      `Increase MAX_TOKENS in lib/anthropic.ts or split the sheet across separate calls.`,
    )
  }
  if (response.stop_reason === 'refusal') {
    throw new Error('Anthropic refused to process the image (safety filter).')
  }

  // Pull text blocks (the SDK guarantees at least one for json_schema responses).
  const textBlock = response.content.find((b: any) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error(
      `Anthropic response contained no text content (stop_reason: ${response.stop_reason})`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(textBlock.text)
  } catch (err) {
    throw new Error(
      `Anthropic response is not valid JSON (stop_reason: ${response.stop_reason}, ` +
      `output_tokens: ${response.usage.output_tokens}): ${(err as Error).message}`,
    )
  }

  // Defense in depth — schema validation in the route handler is the trust
  // boundary, but a bad shape here is unrecoverable so surface early.
  if (!parsed || typeof parsed !== 'object' || !('header' in parsed) || !('rows' in parsed)) {
    throw new Error('Anthropic response missing required header/rows fields')
  }

  return parsed as RawExtractResponse
}

/** Re-export for callers that want to type-narrow against SDK errors. */
export { Anthropic }
