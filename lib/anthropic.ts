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
        },
        required: ['name', 'type', 'subtitle', 'poolQty', 'deckQty', 'aspectGroup'],
      },
    },
  },
  required: ['header', 'rows'],
}

// === Validation against known-good invariants for self-correcting loop ===

const POOL_TOTAL = 96
const LEADER_POOL = 6
const LEADER_DECK = 1
const BASE_POOL = 6
const BASE_DECK = 1

function validateExtraction(parsed: any): string[] {
  const issues: string[] = []
  if (!parsed?.rows || !Array.isArray(parsed.rows)) {
    issues.push('Response missing rows array.')
    return issues
  }

  const rows: any[] = parsed.rows
  const sumPool = rows.reduce((s, r) => s + (Number(r.poolQty) || 0), 0)
  const sumDeck = rows.reduce((s, r) => s + (Number(r.deckQty) || 0), 0)

  if (sumPool !== POOL_TOTAL) {
    const dir = sumPool < POOL_TOTAL ? 'too few — you missed marks' : 'too many — you added marks where there are none'
    issues.push(
      `Pool total = ${sumPool}; expected exactly ${POOL_TOTAL} (6 leaders + 6 bases + 84 other cards). That's ${dir}.`,
    )
  }

  const leaderPoolRows = rows.filter((r) => r.type === 'Leader' && Number(r.poolQty) > 0)
  const leaderDeckRows = rows.filter((r) => r.type === 'Leader' && Number(r.deckQty) > 0)
  if (leaderPoolRows.length !== LEADER_POOL) {
    issues.push(
      `Found ${leaderPoolRows.length} leader(s) with poolQty>0; expected exactly ${LEADER_POOL} (one per pack from the player's 6 packs).`,
    )
  }
  if (leaderDeckRows.length !== LEADER_DECK) {
    issues.push(
      `Found ${leaderDeckRows.length} leader(s) with deckQty>0; expected exactly ${LEADER_DECK} (the active leader).`,
    )
  }

  const basePoolRows = rows.filter((r) => r.type === 'Base' && Number(r.poolQty) > 0)
  const baseDeckRows = rows.filter((r) => r.type === 'Base' && Number(r.deckQty) > 0)
  if (basePoolRows.length !== BASE_POOL) {
    issues.push(
      `Found ${basePoolRows.length} base(s) with poolQty>0; expected exactly ${BASE_POOL} (one per pack).`,
    )
  }
  if (baseDeckRows.length !== BASE_DECK) {
    issues.push(
      `Found ${baseDeckRows.length} base(s) with deckQty>0; expected exactly ${BASE_DECK} (the active base).`,
    )
  }

  for (const row of rows) {
    const pool = Number(row.poolQty) || 0
    const deck = Number(row.deckQty) || 0
    if (deck > pool) {
      issues.push(
        `Row "${row.name}" has deckQty=${deck} but poolQty=${pool}. deckQty must never exceed poolQty.`,
      )
    }
    if (pool > 6 || deck > 6) {
      issues.push(
        `Row "${row.name}" has out-of-bounds quantities (pool=${pool}, deck=${deck}). Max is 6.`,
      )
    }
  }

  // Cap the issue list to keep the correction message focused
  if (issues.length > 12) {
    return [...issues.slice(0, 12), `…and ${issues.length - 12} more issues.`]
  }
  return issues
}

// Typical per-primary-section card-count ranges for an 84-non-leader/base sealed pool.
// If a section's row count falls below the low end, we flag it as likely under-extracted.
const SECTION_TYPICAL_RANGES: Array<{ key: string; matcher: (a: string[]) => boolean; low: number; high: number }> = [
  { key: 'Vigilance', matcher: (a) => a.includes('Vigilance') && !a.some((x) => ['Command', 'Aggression', 'Cunning'].includes(x)), low: 5, high: 18 },
  { key: 'Command', matcher: (a) => a.includes('Command') && !a.some((x) => ['Vigilance', 'Aggression', 'Cunning'].includes(x)), low: 5, high: 18 },
  { key: 'Aggression', matcher: (a) => a.includes('Aggression') && !a.some((x) => ['Vigilance', 'Command', 'Cunning'].includes(x)), low: 5, high: 18 },
  { key: 'Cunning', matcher: (a) => a.includes('Cunning') && !a.some((x) => ['Vigilance', 'Command', 'Aggression'].includes(x)), low: 5, high: 18 },
  { key: 'Heroism (only)', matcher: (a) => a.length === 1 && a[0] === 'Heroism', low: 1, high: 8 },
  { key: 'Villainy (only)', matcher: (a) => a.length === 1 && a[0] === 'Villainy', low: 1, high: 8 },
  { key: 'Multicolor', matcher: (a) => a.filter((x) => ['Vigilance', 'Command', 'Aggression', 'Cunning'].includes(x)).length >= 2, low: 8, high: 30 },
  { key: 'Neutral', matcher: (a) => a.length === 0, low: 1, high: 8 },
]

function diagnoseSectionGaps(parsed: any): string[] {
  if (!parsed?.rows || !Array.isArray(parsed.rows)) return []
  const nonLBRows = parsed.rows.filter((r: any) =>
    r.type !== 'Leader' && r.type !== 'Base' && Number(r.poolQty) > 0,
  )
  const counts: Record<string, number> = {}
  for (const r of nonLBRows) {
    const aspects: string[] = Array.isArray(r.aspects) ? r.aspects : []
    for (const range of SECTION_TYPICAL_RANGES) {
      if (range.matcher(aspects)) {
        counts[range.key] = (counts[range.key] || 0) + 1
        break
      }
    }
  }
  const findings: string[] = []
  for (const range of SECTION_TYPICAL_RANGES) {
    const c = counts[range.key] || 0
    if (c < range.low) {
      findings.push(
        `${range.key} section has only ${c} card(s) with poolQty>0. Typical sealed pool has ${range.low}-${range.high}. Re-scan this section.`,
      )
    } else if (c > range.high) {
      findings.push(
        `${range.key} section has ${c} cards with poolQty>0. Typical sealed pool has ${range.low}-${range.high}. You may have added phantom marks.`,
      )
    }
  }
  return findings
}

function buildCorrectionMessage(issues: string[], parsed: any, attempt: number): string {
  const lines = [
    `Your extraction has the following problems (attempt ${attempt}):`,
    '',
    ...issues.map((i, idx) => `${idx + 1}. ${i}`),
  ]

  const sectionGaps = diagnoseSectionGaps(parsed)
  if (sectionGaps.length > 0) {
    lines.push('')
    lines.push('Specific sections that look wrong:')
    lines.push(...sectionGaps.map((g) => `  • ${g}`))
  }

  lines.push(
    '',
    'Re-scan the photograph(s) carefully and return the COMPLETE corrected extraction in the same JSON shape.',
    'CRITICAL guidance for this retry:',
    '- Process EACH image with EQUAL attention. If you uploaded 2 photos, do not give the second photo less scrutiny than the first. Sections like AGGRESSION, CUNNING, MULTICOLOR, HEROISM, VILLAINY, NO ASPECT often appear on the second photo and need just as careful counting as VIGILANCE/COMMAND on the first.',
    '- Sum of all poolQty values across every row MUST equal 96. If your previous totals oscillated between too-few and too-many, ANCHOR on the rows you are most CONFIDENT about, then carefully sweep dense sections you may have skipped or rushed.',
    '- A blank/empty cell is poolQty=0. Marks (slashes, tallies, dots) indicate qty>0 — count them precisely.',
    '- The MULTICOLOR section is typically the largest with 15-30 marked cards.',
    '',
    'Return JSON only.',
  )
  return lines.join('\n')
}

// === Public API ===

interface ExtractOptions {
  /** Optional set hint surfaced to the model (e.g., "LAW") if the user explicitly picked one */
  setHint?: string
  /** Maximum self-correction iterations (default 3 — initial + 2 retries on invariant violations) */
  maxAttempts?: number
  /** Optional progress callback fired after each attempt */
  onAttempt?: (attempt: number, issues: string[]) => void
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

  // Cache the image bytes — without this, every retry re-uploads the full
  // ~20K-token vision payload. ttl='1h' so the cache survives across the
  // multi-attempt loop and even across nearby user requests on the same images.
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

  // Self-correcting loop. The invariants we check (pool=96, exactly 6 leaders /
  // 6 bases / 1 active leader / 1 active base, deckQty<=poolQty<=6) are all
  // ground truth from the SWU sealed format spec — if Claude's extraction
  // violates them, it's wrong. Feed the discrepancies back and ask for a
  // corrected full re-extraction, up to maxAttempts (default 3 = initial + 2 retries).
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }]
  const maxAttempts = opts.maxAttempts ?? 3
  let response: Anthropic.Message | null = null
  let parsedFinal: RawExtractResponse | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    response = await client.messages
      .stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        output_config: outputConfig,
        messages,
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
        `Anthropic response is not valid JSON (attempt ${attempt}, output_tokens: ${response.usage.output_tokens}): ${(err as Error).message}`,
      )
    }
    if (!parsed || typeof parsed !== 'object' || !('header' in parsed) || !('rows' in parsed)) {
      throw new Error('Anthropic response missing required header/rows fields')
    }

    parsedFinal = parsed as RawExtractResponse
    const issues = validateExtraction(parsed)
    opts.onAttempt?.(attempt, issues)

    if (issues.length === 0) break
    if (attempt === maxAttempts) break

    // Append the assistant's response, then a user message with the issues.
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [{ type: 'text', text: buildCorrectionMessage(issues, parsed, attempt) }],
    })
  }

  if (!parsedFinal) {
    throw new Error('Extraction returned no parseable response after all attempts')
  }
  return parsedFinal
}

/** Re-export for callers that want to type-narrow against SDK errors. */
export { Anthropic }
