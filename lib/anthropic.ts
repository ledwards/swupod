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
  extractConfidence: 'high' | 'medium' | 'low'
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

A separate system block immediately following this one provides KNOWN CARD LISTS for every Star Wars: Unlimited set. Each set's section is delimited by a "----- SET: XXX (Set Name) -----" header. Read the set name from the registration sheet header (e.g. "A Lawless Time" → set LAW), then use ONLY the cards from that set's section as your closed vocabulary. Every card name you return MUST come from the matching set's list. When OCR is ambiguous between two similar names, pick the one in the list. When two cards in the same set share a name, use the subtitle to disambiguate.

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

5. **Total invariant.** Sum of poolQty across ALL rows must equal exactly 96 (6 leaders + 6 bases + 84 other). Before responding, mentally tally your output and verify it sums to 96. If too few, re-scan dense sections you may have skipped — the AGGRESSION, CUNNING, MULTICOLOR, HEROISM, VILLAINY, and NO ASPECT sections often appear on the second photo and are easy to under-count. If too many, you've added phantom marks — empty cells are poolQty=0, do NOT mark 1 for empty rows.

5a. **Equal attention to every photo.** If two photos are provided, the second photo has just as many marked rows as the first. Common failure mode: thoroughly extracting the LEADER/BASE/VIGILANCE/COMMAND sections on photo 1 but rushing through the AGGRESSION/CUNNING/MULTICOLOR/HEROISM/VILLAINY/NO ASPECT sections on photo 2. Process every section on every photo with equal care.

6. **For each row, return:**
   - "name": the printed card name ONLY (e.g. "Han Solo"). NEVER combine with subtitle. NEVER include a comma. If the printed text is "Han Solo, I Got a Really Good Feeling", that's name="Han Solo" and subtitle="I Got a Really Good Feeling" — TWO separate fields. Returning name="Han Solo, I Got a Really Good Feeling" with subtitle=null is wrong. The card list above shows each card on its own line as "Name, Subtitle" — when you find one, split it back into the two JSON fields.
   - "type": exactly one of "Leader" / "Base" / "Unit" / "Event" / "Upgrade"
   - "subtitle": the printed subtitle ONLY (e.g. "Audacious Smuggler"), or null if there is no subtitle printed below the name. Never put the name in this field.
   - "poolQty": integer 0-6 from the TOTAL column
   - "deckQty": integer 0-6 from the PLAYED column (must not exceed poolQty)
   - "aspectGroup": the section header the row appears under (e.g. "Vigilance", "Command", "Aggression Vigilance", "Multicolor", "No Aspect")

7. **Names you can't read.** If a card name is unreadable, use the literal string "?". Never invent cards.

8. **Per-row confidence.** For every row, attach an "extractConfidence" field with one of three values: "high", "medium", or "low":
   - "high" — the mark (or absence of mark) is unambiguous; you are certain about both poolQty and deckQty.
   - "medium" — you can see something but the count is unclear (one tally vs two? a smudge that might be a mark?), or part of the row is occluded.
   - "low" — the row is partially or wholly illegible due to handwriting, lighting, glare, or angle. The user should verify against the source image.
   Use "high" liberally for blank rows (poolQty=0, deckQty=0) — empty cells are easy to be confident about. Use "medium"/"low" honestly when you're guessing. The user uses this signal to know which rows to manually verify.

Return strict JSON conforming to the response schema. Do not include any prose, markdown, or explanation outside the JSON. The user will verify the result against the source sheet, so accuracy on what's NOT marked matters as much as accuracy on what IS marked.`

// === Set card list grounding ===
//
// Passes the Normal-variant card list for EVERY released set as a second
// system block. Claude reads the set name from the sheet header and matches
// against the matching section of this list. Cached for 1 hour (the longest
// TTL Anthropic offers server-side) — card data is static, so this caches
// across all extractions globally.

interface CardListEntry {
  cardId: string
  name: string
  subtitle: string | null
  type: string
  aspects: string[]
  isLeader?: boolean
  isBase?: boolean
}

const ALL_SET_CODES = ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW']

const ASPECT_ORDER = [
  'Vigilance',
  'Command',
  'Aggression',
  'Cunning',
  'Heroism',
  'Villainy',
  'NO ASPECT',
]

function cardNumber(cardId: string): number {
  const m = cardId.match(/[-_](\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

function formatCard(c: CardListEntry, includeType: boolean): string {
  const n = cardNumber(c.cardId)
  const sub = c.subtitle ? `, ${c.subtitle}` : ''
  const aspectStr = c.aspects && c.aspects.length > 0 ? `[${c.aspects.join('+')}]` : ''
  const typeStr = includeType ? ` (${c.type})` : ''
  return `  ${n}. ${c.name}${sub}${aspectStr ? ' ' + aspectStr : ''}${typeStr}`
}

function formatSingleSet(setCode: string, setName: string | null): string {
  const cards = getCachedCards(setCode).filter((c: any) => c.variantType === 'Normal')
  if (cards.length === 0) return ''

  const leaders = cards.filter((c: any) => c.isLeader)
  const bases = cards.filter((c: any) => c.isBase)
  const others = cards.filter((c: any) => !c.isLeader && !c.isBase)

  let out = `\n----- SET: ${setCode}${setName ? ` (${setName})` : ''} -----\n`

  out += `LEADERS (${leaders.length}):\n`
  for (const c of leaders.sort((a: any, b: any) => cardNumber(a.cardId) - cardNumber(b.cardId))) {
    out += formatCard(c, false) + '\n'
  }

  out += `\nBASES (${bases.length}):\n`
  for (const c of bases.sort((a: any, b: any) => cardNumber(a.cardId) - cardNumber(b.cardId))) {
    out += formatCard(c, false) + '\n'
  }

  // Group "others" by primary aspect combination to mirror the registration sheet's organization.
  const byAspect = new Map<string, CardListEntry[]>()
  for (const c of others) {
    const key = ((c.aspects || []) as string[]).slice().sort().join('+') || 'NO ASPECT'
    if (!byAspect.has(key)) byAspect.set(key, [])
    byAspect.get(key)!.push(c)
  }
  const sortedKeys = [...byAspect.keys()].sort((a, b) => {
    const aIsSingle = !a.includes('+')
    const bIsSingle = !b.includes('+')
    if (aIsSingle !== bIsSingle) return aIsSingle ? -1 : 1
    if (aIsSingle) return ASPECT_ORDER.indexOf(a) - ASPECT_ORDER.indexOf(b)
    return a.localeCompare(b)
  })
  for (const key of sortedKeys) {
    const cs = byAspect.get(key)!
    out += `\n${key.toUpperCase()} (${cs.length}):\n`
    for (const c of cs.sort((a: any, b: any) => cardNumber(a.cardId) - cardNumber(b.cardId))) {
      out += formatCard(c, true) + '\n'
    }
  }
  return out
}

function buildAllSetsCardListContext(): string {
  initializeCardCache().catch(() => {})

  // Lazy import setConfigs so we can get human-readable set names for the prompt.
  // Falls back to set code if config isn't available.
  let getSetName: (code: string) => string | null = () => null
  try {
    const { getSetConfig } = require('../src/utils/setConfigs/index') as {
      getSetConfig: (code: string) => { setName: string } | null
    }
    getSetName = (code: string) => getSetConfig(code)?.setName || null
  } catch {
    // ignore — fall back to code-only labels
  }

  let out = `=== KNOWN CARD LISTS — ALL SETS ===\n`
  out +=
    `Each section below is the COMPLETE Normal-variant card list for one Star Wars: Unlimited set. ` +
    `The registration sheet's header will name which set the player is using (e.g. "A Lawless Time"). ` +
    `Match the header to the corresponding "----- SET: XXX (Set Name) -----" section below and use ONLY card names from that section. ` +
    `When two cards share a name within a set (e.g. multiple "Han Solo" entries), use the subtitle to disambiguate. ` +
    `Handle OCR errors by picking the closest matching name from the right set's list. ` +
    `If you can't read a card name on the sheet, return "?" rather than guessing.\n`

  for (const code of ALL_SET_CODES) {
    out += formatSingleSet(code, getSetName(code))
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
          extractConfidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
        },
        required: ['name', 'type', 'subtitle', 'poolQty', 'deckQty', 'aspectGroup', 'extractConfidence'],
      },
    },
  },
  required: ['header', 'rows'],
}

// Typical per-primary-section card-count ranges for an 84-non-leader/base sealed pool.
// If a section's row count falls below the low end, we flag it as likely under-extracted.
const SECTION_TYPICAL_RANGES: Array<{ key: string; matcher: (a: string[]) => boolean; low: number; high: number }> = [
  { key: 'Vigilance', matcher: (a) => a.includes('Vigilance') && !a.some((x) => ['Command', 'Aggression', 'Cunning'].includes(x)), low: 5, high: 18 },
  { key: 'Command', matcher: (a) => a.includes('Command') && !a.some((x) => ['Vigilance', 'Aggression', 'Cunning'].includes(x)), low: 5, high: 18 },
  { key: 'Aggression', matcher: (a) => a.includes('Aggression') && !a.some((x) => ['Vigilance', 'Command', 'Cunning'].includes(x)), low: 5, high: 18 },
  { key: 'Cunning', matcher: (a) => a.includes('Cunning') && !a.some((x) => ['Vigilance', 'Command', 'Aggression'].includes(x)), low: 5, high: 18 },
  { key: 'Heroism', matcher: (a) => a.length === 1 && a[0] === 'Heroism', low: 1, high: 8 },
  { key: 'Villainy', matcher: (a) => a.length === 1 && a[0] === 'Villainy', low: 1, high: 8 },
  { key: 'Multicolor', matcher: (a) => a.filter((x) => ['Vigilance', 'Command', 'Aggression', 'Cunning'].includes(x)).length >= 2, low: 8, high: 30 },
  { key: 'Neutral', matcher: (a) => a.length === 0, low: 1, high: 8 },
]

export interface SectionGap {
  section: string
  count: number
  expectedLow: number
  expectedHigh: number
  message: string
}

export function computeSectionGaps(parsed: any, setCode?: string): SectionGap[] {
  if (!parsed?.rows || !Array.isArray(parsed.rows)) return []
  const nonLBRows = parsed.rows.filter(
    (r: any) => r.type !== 'Leader' && r.type !== 'Base' && Number(r.poolQty) > 0,
  )
  // Build a name+type → aspects lookup from cached card data so we can classify
  // each row even though Claude's response schema doesn't include aspects.
  const code = setCode || parsed?.header?.setCode || getLatestReleasedSetCode()
  const cards = (getCachedCards(code) || []).filter((c: any) => c.variantType === 'Normal')
  const aspectsByKey = new Map<string, string[]>()
  for (const c of cards) {
    aspectsByKey.set(`${c.name}|${c.type}`.toLowerCase(), c.aspects || [])
  }
  const lookupAspects = (row: any): string[] => {
    if (Array.isArray(row.aspects)) return row.aspects
    return aspectsByKey.get(`${row.name}|${row.type}`.toLowerCase()) || []
  }

  const counts: Record<string, number> = {}
  for (const r of nonLBRows) {
    const aspects = lookupAspects(r)
    for (const range of SECTION_TYPICAL_RANGES) {
      if (range.matcher(aspects)) {
        counts[range.key] = (counts[range.key] || 0) + 1
        break
      }
    }
  }
  const gaps: SectionGap[] = []
  for (const range of SECTION_TYPICAL_RANGES) {
    const c = counts[range.key] || 0
    if (c < range.low) {
      gaps.push({
        section: range.key,
        count: c,
        expectedLow: range.low,
        expectedHigh: range.high,
        message: `${range.key} section has only ${c} card${c === 1 ? '' : 's'} marked. Typical sealed pool has ${range.low}-${range.high}.`,
      })
    } else if (c > range.high) {
      gaps.push({
        section: range.key,
        count: c,
        expectedLow: range.low,
        expectedHigh: range.high,
        message: `${range.key} section has ${c} cards marked. Typical sealed pool has ${range.low}-${range.high} — possible phantom marks.`,
      })
    }
  }
  return gaps
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

  // The card list block contains EVERY released set's cards — Claude detects
  // the set from the sheet header and uses the matching section. No "wrong
  // set picked upfront" failure mode anymore.
  const cardListContext = buildAllSetsCardListContext()

  // Cache the image bytes with ttl='1h' so subsequent extractions of the
  // same images within the hour hit the cache (cheaper, faster). Useful
  // when iterating on prompt or matcher changes against the same source
  // photos.
  const userContent: Anthropic.MessageParam['content'] = []
  for (let i = 0; i < images.length; i++) {
    const image = images[i]
    const isLast = i === images.length - 1
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
      // Mark cache point only on the last image so we don't blow the
      // 4-breakpoint limit (we already have 2 on system + this 1 = 3).
      ...(isLast ? { cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } } : {}),
    })
  }
  userContent.push({
    type: 'text',
    text: opts.setHint
      ? `Extract the registration sheet data. The user indicated this sheet is for set "${opts.setHint}" — confirm against the sheet header and use that set's section of the KNOWN CARD LISTS above.`
      : `Extract the registration sheet data. Read the set name from the sheet header (e.g. "A Lawless Time" → set LAW), then use only that set's section of the KNOWN CARD LISTS above as your closed vocabulary. Report the detected setCode in the response header.`,
  })

  // Streaming required: SDK rejects non-streaming requests that may take >10 min,
  // which fires above ~16K max_tokens.
  //
  // Both system blocks cached with ttl: '1h' since their content is static —
  // SYSTEM_PROMPT is the frozen extraction-rules text, and the all-sets card
  // list is bundled card data that only changes when a new set ships. Pays
  // ~2x cache write cost on first call, but reads are ~10x cheaper than the
  // base input price for the entire 1-hour window. With many extractions
  // per hour (admin/patron pool), this dominates the simple no-cache path.
  const systemBlocks = [
    {
      type: 'text' as const,
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' as const, ttl: '1h' as const },
    },
    {
      type: 'text' as const,
      text: cardListContext,
      cache_control: { type: 'ephemeral' as const, ttl: '1h' as const },
    },
  ]
  const outputConfig = {
    format: { type: 'json_schema' as const, schema: RESPONSE_SCHEMA },
  }

  // Single-shot extraction. Earlier versions had a runtime self-correcting
  // loop and per-section refinement passes — both pulled out. Tuning the
  // prompt is something we iterate on collaboratively (assistant observes
  // the log, proposes prompt/code changes), not something the route does
  // at runtime. Keeps the call cheap, fast, and easy to reason about.
  const response = await client.messages
    .stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      output_config: outputConfig,
      messages: [{ role: 'user', content: userContent }],
    })
    .finalMessage()

  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      `Anthropic response truncated at max_tokens (${MAX_TOKENS}). ` +
        `Output had ${response.usage.output_tokens} tokens. ` +
        `Increase MAX_TOKENS in lib/anthropic.ts or split the sheet across separate calls.`,
    )
  }
  if (response.stop_reason === 'refusal') {
    throw new Error('Anthropic refused to process the image (safety filter).')
  }

  const textBlock = response.content.find((b: any) => b.type === 'text')
  if (!textBlock || (textBlock as any).type !== 'text') {
    throw new Error(
      `Anthropic response contained no text content (stop_reason: ${response.stop_reason})`,
    )
  }

  let parsed: any
  try {
    parsed = JSON.parse((textBlock as any).text)
  } catch (err) {
    throw new Error(
      `Anthropic response is not valid JSON (output_tokens: ${response.usage.output_tokens}): ${(err as Error).message}`,
    )
  }
  if (!parsed || typeof parsed !== 'object' || !('header' in parsed) || !('rows' in parsed)) {
    throw new Error('Anthropic response missing required header/rows fields')
  }

  return parsed as RawExtractResponse
}

/** Re-export for callers that want to type-narrow against SDK errors. */
export { Anthropic }
