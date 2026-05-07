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
import {
  checkInvariants,
  invariantDistance,
  POOL_TARGET,
  DECK_MIN,
  DECK_MAX,
  LEADER_TARGET,
  BASE_TARGET,
  type ExtractionInvariantStatus,
} from '../src/services/importPool/invariants'
import { preprocessImageForExtraction } from '../src/services/importPool/preprocessImage'

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
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Long vision streams over high-latency networks intermittently terminate
      // with `SocketError: other side closed`. Bump retries from default 2.
      maxRetries: 5,
      // Default is 10 minutes for streaming; long card-list grounding + 32K
      // output occasionally pushes near that. Generous ceiling.
      timeout: 15 * 60 * 1000,
    })
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
  /** Confidence in the TOTAL column (pool qty) handwritten read. */
  poolQtyConfidence: 'high' | 'medium' | 'low'
  /** Confidence in the PLAYED column (deck qty) handwritten read. */
  deckQtyConfidence: 'high' | 'medium' | 'low'
}

export interface ExtractedHeader {
  setName: string | null
  eventName: string | null
  eventDate: string | null
  playerName: string | null
  leader: { name: string | null; subtitle: string | null }
  base: { name: string | null; subtitle: string | null }
}

export type SectionName =
  | 'Leaders'
  | 'Bases'
  | 'Vigilance'
  | 'Command'
  | 'Aggression'
  | 'Cunning'
  | 'Heroism'
  | 'Villainy'
  | 'Multicolor'
  | 'NoAspect'

/** Normalized [0,1] bounding box for a section's rows on one photo. The UI
 *  uses these to crop the source photo to just that section so the user can
 *  verify Claude's read against only the relevant slice — and downstream
 *  refinement passes use them to send Claude a tightly-cropped image with
 *  no other distractions. */
export interface SectionBounds {
  name: SectionName
  /** 0 for the first uploaded photo, 1 for the second */
  photoIndex: number
  /** Top-left x in [0, 1] (fraction of photo width) */
  x0: number
  /** Top-left y in [0, 1] (fraction of photo height) */
  y0: number
  /** Bottom-right x in [0, 1] */
  x1: number
  /** Bottom-right y in [0, 1] */
  y1: number
}

export interface RawExtractResponse {
  header: ExtractedHeader
  rows: ExtractedRow[]
  sections: SectionBounds[]
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

PROCEDURE — work in this order:
  STEP 1: Locate section headers on each photo (LEADERS / BASES / VIGILANCE / COMMAND / AGGRESSION / CUNNING / HEROISM / VILLAINY / MULTICOLOR / NO ASPECT). Output the "sections" array with a bounding box for each visible section on each photo (rule 9 details the schema). Commit to bounds BEFORE you start counting marks — this enforces a macro-level scan first.
  STEP 2: For each section located in step 1, count the marked rows. Especially: walk MULTICOLOR by sub-aspect pair (Vigilance+Command, Vigilance+Aggression, Vigilance+Cunning, Command+Aggression, Command+Cunning, Aggression+Cunning, plus the Heroism/Villainy variants of each). MULTICOLOR is consistently under-counted because it has the most sub-groups and spans many rows.
  STEP 3: For every printed row in the set, output one entry in "rows". Mark poolQty/deckQty from the player's marks. Most rows will be 0/0 (player doesn't own them). Sum verifications happen in the FINAL CHECKLIST below.

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

5b. **Typical section sizes — calibration.** A sealed pool has roughly these per-section ranges. If your output for a section falls below the low end you've MISSED rows; sweep it again before responding.
    - Vigilance / Command / Aggression / Cunning: 5–18 marked cards each
    - Heroism (alone) / Villainy (alone): 1–8 each
    - **MULTICOLOR (cards with TWO game-side aspects, e.g. Vigilance+Command): 8–30 — typically the LARGEST single section in the pool.** This section is the #1 place extractions go wrong, because it spans many rows on the sheet and is easy to under-scan. If your MULTICOLOR count is under 8, go back and re-count.
    - No Aspect / Neutral: 1–8

5c. **Deck total calibration.** The PLAYED column marks the cards in the player's competitive deck. Sealed decks start at 30 cards (the minimum), and most players don't run above 32 — the bulk of the pool stays in the side. Including the active leader (deckQty=1) and active base (deckQty=1), the sum of deckQty across ALL rows should be approximately 30–35. If your sum exceeds 36, you've OVER-counted deck inclusions — re-verify the PLAYED column marks (a row with a TOTAL mark but NO PLAYED mark is poolQty>0, deckQty=0).

6. **For each row, return:**
   - "name": the printed card name ONLY (e.g. "Han Solo"). NEVER combine with subtitle. NEVER include a comma. If the printed text is "Han Solo, I Got a Really Good Feeling", that's name="Han Solo" and subtitle="I Got a Really Good Feeling" — TWO separate fields. Returning name="Han Solo, I Got a Really Good Feeling" with subtitle=null is wrong. The card list above shows each card on its own line as "Name, Subtitle" — when you find one, split it back into the two JSON fields.
   - "type": exactly one of "Leader" / "Base" / "Unit" / "Event" / "Upgrade"
   - "subtitle": the printed subtitle ONLY (e.g. "Audacious Smuggler"), or null if there is no subtitle printed below the name. Never put the name in this field.
   - "poolQty": integer 0-6 from the TOTAL column
   - "deckQty": integer 0-6 from the PLAYED column (must not exceed poolQty)
   - "aspectGroup": the section header the row appears under (e.g. "Vigilance", "Command", "Aggression Vigilance", "Multicolor", "No Aspect")

7. **Names you can't read.** If a card name is unreadable, use the literal string "?". Never invent cards.

8. **Per-COLUMN qty confidence — read each handwritten number SEPARATELY.** For every row, attach TWO confidence fields, one for each qty column:
   - "poolQtyConfidence": confidence in your read of the TOTAL column (the pool count). "high" / "medium" / "low".
   - "deckQtyConfidence": confidence in your read of the PLAYED column (the deck count). "high" / "medium" / "low".

   These are about HANDWRITING legibility ONLY — not about the card name. The card name is grounded against a closed card list (see KNOWN CARD LISTS above) so its OCR is reliable; what matters is whether you can read the player's pencil/pen marks in the two qty columns.

   - Use "high" when you are CERTAIN of the value. A clearly empty cell is HIGH (you're sure it's blank). A single sharp tally mark is HIGH (you're sure it's "1"). Two clean tallies is HIGH for "2".
   - Use "medium" when you can see something but the exact value is unclear (one tally vs two? smudge that might be a mark? mark partially occluded by the column ruler?).
   - Use "low" when the column is genuinely hard to read for this row: faded marks, ambiguous between blank and a faint mark, eraser smudges, glare, the photo is blurry there. Includes the case "I THINK this is blank but I can't quite tell" — that's a low-confidence 0.

   The user uses these two confidences to know which numbers to manually verify against the source photo. Be honest: if a "blank" cell is actually a low-confidence guess, mark it low — the user wants to catch cards they own that you missed.

9. **Section bounding boxes — REQUIRED, not optional.** Return a non-empty "sections" array describing where each visible section's rows appear on each photo. The UI USES these bounds to crop the source photo to one section at a time so the player can verify your read; without bounds the feature breaks. For every section that's visible on any photo (Leaders, Bases, Vigilance, Command, Aggression, Cunning, Heroism, Villainy, Multicolor, NoAspect), return one entry PER PHOTO it appears on:
   - "name": exactly one of the values above (use "NoAspect" for the No Aspect / Neutral / gray section)
   - "photoIndex": 0 for the first uploaded photo, 1 for the second
   - "x0", "y0": top-left corner as [0, 1] fractions of the photo (0,0 = top-left of the photo). NOT pixels — fractions.
   - "x1", "y1": bottom-right corner as [0, 1] fractions
   The bounding box must include the section header AND every row beneath it through the last row of the section. Be conservative: slightly over-include (1–2% of slack on each side) rather than crop a row in half. If a section spans both photos (e.g. Multicolor continues from photo 1 onto photo 2), return one entry per photo. Typical entry counts: 8–10 entries on a single-photo upload, 12–18 entries on a two-photo upload. If you return zero sections you have failed this requirement.

================================================================
FINAL CHECKLIST — verify ALL of these before returning your JSON.
This list is the difference between a usable response and one we
have to reject. Every item is a hard requirement.

(A) **sections array is non-empty.** It must contain one entry per
    visible section per photo (Leaders + Bases + each aspect section
    that's visible). On a single-photo sheet that's typically 8–10
    entries. On a two-photo sheet it's 12–18 entries. ZERO
    is a failure — go re-read rule 9.

(B) **Sum of poolQty across all rows equals 96.** Compute the sum.
    If it's less than 96, you've missed marks — sweep the dense
    sections (Vigilance, Command, Aggression, Cunning, Multicolor)
    one more time. The Multicolor section especially is where pool
    under-counts originate — typical sealed pools have 8–30 cards
    in Multicolor, not 6.

(C) **Sum of deckQty across all rows is between 30 and 35.** This
    is the player's competitive deck, which by sealed rules is at
    least 30 cards and most players don't run more than 32. If your
    deck total is above 36, you've over-counted PLAYED-column marks
    — recheck the rows where you put deckQty>0; many rows have a
    TOTAL mark but no PLAYED mark and should be deckQty=0.

(D) **Exactly 6 leaders with poolQty=1, exactly 1 with deckQty=1.**
    Same for bases. The other 12 leader rows and 6 base rows all
    have poolQty=0 and deckQty=0.

(E) **Names are split from subtitles.** No commas in the "name"
    field. "Han Solo, Audacious Smuggler" → name="Han Solo",
    subtitle="Audacious Smuggler".

If ANY of A–E fails, fix it before returning. Return strict JSON
only — no prose, no markdown, no explanation outside the JSON.
The user will verify against the source sheet so accuracy on what's
NOT marked matters as much as accuracy on what IS.`

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
//
// Field order matters: structured-output models generate keys in the order
// they appear in `properties`. We put `sections` BEFORE `rows` so Claude
// commits to bounding boxes while it's still scanning the photo at a
// macro level — earlier runs put sections last and Claude routinely
// returned an empty array because by then it was "done."
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
    sections: {
      type: 'array',
      // Anthropic structured outputs only support minItems values of 0 or 1
      // (anything higher is rejected with "minItems values other than 0 or
      // 1 are not supported"). Keep at 1 to at least force non-null /
      // non-empty responses; the prompt rule 9 + final checklist (A) cover
      // the rest of the "fill all sections" requirement non-structurally.
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
            enum: [
              'Leaders',
              'Bases',
              'Vigilance',
              'Command',
              'Aggression',
              'Cunning',
              'Heroism',
              'Villainy',
              'Multicolor',
              'NoAspect',
            ],
          },
          photoIndex: { type: 'integer' },
          x0: { type: 'number' },
          y0: { type: 'number' },
          x1: { type: 'number' },
          y1: { type: 'number' },
        },
        required: ['name', 'photoIndex', 'x0', 'y0', 'x1', 'y1'],
      },
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
          // Per-column handwriting-read confidence. Card-name OCR is grounded
          // against the closed card list, so the only thing left to verify
          // is the player's marks in the two qty columns.
          poolQtyConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          deckQtyConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: [
          'name',
          'type',
          'subtitle',
          'poolQty',
          'deckQty',
          'aspectGroup',
          'poolQtyConfidence',
          'deckQtyConfidence',
        ],
      },
    },
  },
  required: ['header', 'sections', 'rows'],
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
  /** Cap on refine iterations. Default 4 — average API roundtrip is ~15s, so 4 keeps us under the 60s route timeout. */
  maxIterations?: number
}

export interface ExtractIterationLog {
  iteration: number
  poolSum: number
  deckSum: number
  leaderCount: number
  baseCount: number
  subsetViolations: number
  passing: boolean
  failures: string[]
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface ExtractResult {
  result: RawExtractResponse
  iterations: ExtractIterationLog[]
  converged: boolean
  /** 1-indexed pass whose `result` was returned. When `converged`, this is the
   *  passing iteration; otherwise it's the iteration with the smallest
   *  invariant distance. */
  bestIteration: number
}

function buildInitialUserText(setHint: string | undefined): string {
  return setHint
    ? `Extract the registration sheet data. The user indicated this sheet is for set "${setHint}" — confirm against the sheet header and use that set's section of the KNOWN CARD LISTS above.`
    : `Extract the registration sheet data. Read the set name from the sheet header (e.g. "A Lawless Time" → set LAW), then use only that set's section of the KNOWN CARD LISTS above as your closed vocabulary. Report the detected setCode in the response header.`
}

/**
 * Build the user message text for a refine pass. Tells Claude what it
 * already identified, what's wrong, and where to look — without piling
 * extra rules onto the system prompt.
 */
function buildRefineUserText(
  prevResult: RawExtractResponse,
  prevStatus: ExtractionInvariantStatus,
  setHint: string | undefined,
): string {
  // Group prevResult's marked rows by section for compact recap.
  const markedRows = prevResult.rows.filter((r: any) => (Number(r.poolQty) || 0) > 0)
  const bySection = new Map<string, any[]>()
  for (const r of markedRows) {
    const key =
      r.type === 'Leader'
        ? 'Leaders'
        : r.type === 'Base'
          ? 'Bases'
          : (r as any).aspectGroup || 'Unspecified'
    if (!bySection.has(key)) bySection.set(key, [])
    bySection.get(key)!.push(r)
  }

  let out = 'Your previous extraction did not match expected sealed-pool invariants.\n\n'
  out += 'WHAT YOU IDENTIFIED (rows with poolQty>0):\n\n'
  for (const [section, rs] of bySection.entries()) {
    out += `${section.toUpperCase()} (${rs.length} marked):\n`
    for (const r of rs) {
      const sub = r.subtitle ? ` (${r.subtitle})` : ''
      out += `- ${r.name}${sub} — pool=${r.poolQty}, deck=${r.deckQty}\n`
    }
    out += '\n'
  }

  out += 'INVARIANT CHECK:\n'
  out += `- Pool sum: ${prevStatus.poolSum} (expected ${POOL_TARGET})${
    prevStatus.poolSum === POOL_TARGET ? ' OK' : ` — gap of ${POOL_TARGET - prevStatus.poolSum}`
  }\n`
  out += `- Deck sum: ${prevStatus.deckSum}${
    prevStatus.deckSum >= DECK_MIN && prevStatus.deckSum <= DECK_MAX
      ? ' OK'
      : ` (expected ${DECK_MIN}-${DECK_MAX})`
  }\n`
  out += `- Leader poolQty total: ${prevStatus.leaderCount}${
    prevStatus.leaderCount === LEADER_TARGET ? ' OK' : ` (expected ${LEADER_TARGET})`
  }\n`
  out += `- Base poolQty total: ${prevStatus.baseCount}${
    prevStatus.baseCount === BASE_TARGET ? ' OK' : ` (expected ${BASE_TARGET})`
  }\n`
  if (prevStatus.subsetViolations > 0) {
    out += `- ${prevStatus.subsetViolations} row(s) have deckQty > poolQty (impossible — deck is a subset of pool)\n`
  }
  out += '\n'

  // Section gap analysis — flag any aspect section that's outside its typical
  // range so Claude knows where to look.
  const setCode = setHint || prevResult.header?.setName || undefined
  const gaps = computeSectionGaps(prevResult, setCode as any)
  const lowGaps = gaps.filter((g: any) => g.count < g.expectedLow)
  if (lowGaps.length > 0) {
    out += 'LIKELY MISSED LOCATIONS:\n'
    for (const g of lowGaps) {
      out += `- ${g.section} has only ${g.count} marked card${g.count === 1 ? '' : 's'} but typical sealed pools have ${g.expectedLow}-${g.expectedHigh}. RE-SCAN this section.`
      if (g.section === 'Multicolor') {
        out += ' Walk each sub-aspect pair: Vigilance+Command, Vigilance+Aggression, Vigilance+Cunning, Command+Aggression, Command+Cunning, Aggression+Cunning, plus Heroism/Villainy variants of each.'
      }
      out += '\n'
    }
    out += '\n'
  }

  // Targeted instructions per axis. Critical: do NOT tell Claude to "fix
  // everything" if only one axis is wrong — empirically that causes Claude
  // to perturb the correct axis (e.g. pool fix triggers deck inflation).
  const instructions: string[] = []
  const deckInRange = prevStatus.deckSum >= DECK_MIN && prevStatus.deckSum <= DECK_MAX

  if (prevStatus.poolSum < POOL_TARGET) {
    instructions.push(
      `Pool: re-examine BOTH photos and find the ${POOL_TARGET - prevStatus.poolSum} missing marked row(s). The TOTAL column tells you poolQty. Keep the rows you already identified; ADD the missing ones. Pool sum MUST equal exactly ${POOL_TARGET}.`,
    )
  } else if (prevStatus.poolSum > POOL_TARGET) {
    instructions.push(
      `Pool: you over-counted by ${prevStatus.poolSum - POOL_TARGET}. Re-check rows where you set poolQty>0 and remove phantom marks. Pool sum MUST equal exactly ${POOL_TARGET}.`,
    )
  }

  if (deckInRange) {
    instructions.push(
      `Deck: your deck count of ${prevStatus.deckSum} is already in the valid 30-35 range — DO NOT change it. Keep deckQty values exactly as you had them on every row you already identified. New rows you add for the pool fix should generally have deckQty=0 (those were missed because they're side cards, not in the deck).`,
    )
  } else if (prevStatus.deckSum > DECK_MAX) {
    instructions.push(
      `Deck: you over-counted PLAYED-column marks (deck sum ${prevStatus.deckSum}, max ${DECK_MAX}). Re-check every row where deckQty>0. A row with a TOTAL mark but no PLAYED mark is deckQty=0 — they only PLAYED a subset of their pool.`,
    )
  } else if (prevStatus.deckSum < DECK_MIN) {
    instructions.push(
      `Deck: deck sum ${prevStatus.deckSum} is below the minimum ${DECK_MIN}. Re-scan the PLAYED column on rows that have a TOTAL mark — you missed PLAYED marks.`,
    )
  }

  if (prevStatus.leaderCount !== LEADER_TARGET || prevStatus.baseCount !== BASE_TARGET) {
    instructions.push(
      `Leader/Base: a sealed pool has EXACTLY 6 leaders (poolQty sum) and 6 bases. Re-scan those sections.`,
    )
  }

  if (prevStatus.subsetViolations > 0) {
    instructions.push(
      `Subset rule: deckQty must be ≤ poolQty on every row. Fix the ${prevStatus.subsetViolations} violation(s).`,
    )
  }

  out += `INSTRUCTIONS:\n`
  for (const inst of instructions) {
    out += `- ${inst}\n`
  }
  out += `\nReturn a CORRECTED COMPLETE extraction in the same JSON schema. Maintain field-by-field continuity with what you had right; only change what's listed above.\n`

  return out
}

/**
 * Build the user-turn content (images + text) for a single API call.
 * Same images go in every call so prompt cache hits across iterations.
 */
function buildUserContent(
  images: ImageInput[],
  text: string,
): Anthropic.MessageParam['content'] {
  const content: Anthropic.MessageParam['content'] = []
  for (let i = 0; i < images.length; i++) {
    const image = images[i]
    const isLast = i === images.length - 1
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
      // Mark cache point only on the last image — system has 2 cache points,
      // adding 1 here = 3 of the 4 allowed breakpoints.
      ...(isLast ? { cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } } : {}),
    })
  }
  content.push({ type: 'text', text })
  return content
}

/**
 * Extract pool data from one or two registration-sheet images.
 *
 * Runs a goal-oriented refine loop: pass 1 is a normal extraction; if the
 * result fails the structural invariants (pool sum 96, deck sum 30-35,
 * 6 leader-poolQty, 6 base-poolQty, no subset violations), the next pass
 * receives a recap of what was identified plus the gap, and Claude tries
 * again. Up to `maxIterations` total passes (default 4).
 *
 * Cache strategy: system blocks (frozen extraction rules + bundled card
 * list) and the images themselves are cached with ttl='1h'. Each refine
 * pass only sends the new gap-description text fresh, so iterations 2+
 * are dramatically cheaper than iteration 1.
 *
 * On non-convergence, returns the iteration with the smallest invariant
 * distance — the resolve UI handles the residual gap.
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
): Promise<ExtractResult> {
  if (images.length === 0) {
    throw new Error('extractPoolFromImages requires at least 1 image')
  }
  if (images.length > 2) {
    throw new Error('extractPoolFromImages supports at most 2 images')
  }

  // Server-side preprocessing (sharp): resize cap, normalise histogram,
  // contrast multiply, sharpen. The wizard's browser canvas only resizes
  // for upload size; this does the contrast/sharpen work that makes faint
  // tally marks legible to Claude. Done once per call (not per iteration)
  // since the bytes don't change across the refine loop.
  const preprocessed: ImageInput[] = []
  for (const img of images) {
    try {
      const buf = await preprocessImageForExtraction(Buffer.from(img.data, 'base64'))
      preprocessed.push({ data: buf.toString('base64'), mediaType: 'image/jpeg' })
    } catch (err) {
      throw new Error(
        `Image preprocessing failed: ${(err as Error).message}. ` +
          `Possible causes: corrupt JPEG, unsupported format. ` +
          `Original mediaType: ${img.mediaType}.`,
      )
    }
  }

  const client = getClient()
  const cardListContext = buildAllSetsCardListContext()

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

  const maxIterations = Math.max(1, Math.min(10, opts.maxIterations ?? 8))
  const iterations: ExtractIterationLog[] = []
  const resultsByIteration: RawExtractResponse[] = []
  let lastResult: RawExtractResponse | null = null
  let lastStatus: ExtractionInvariantStatus | null = null

  for (let i = 0; i < maxIterations; i++) {
    const userText =
      lastResult && lastStatus
        ? buildRefineUserText(lastResult, lastStatus, opts.setHint)
        : buildInitialUserText(opts.setHint)
    const userContent = buildUserContent(preprocessed, userText)

    // Manual retry for `AnthropicError: terminated` and similar mid-stream
    // socket failures. The SDK's built-in maxRetries doesn't always classify
    // these as retryable. Up to 3 attempts per iteration.
    let response: any
    let attempt = 0
    while (true) {
      try {
        response = await client.messages
          .stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemBlocks,
            output_config: outputConfig,
            messages: [{ role: 'user', content: userContent }],
          })
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
        // Brief backoff before retry
        await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }

    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `Anthropic response truncated at max_tokens (${MAX_TOKENS}) on pass ${i + 1}. ` +
          `Output had ${response.usage.output_tokens} tokens.`,
      )
    }
    if (response.stop_reason === 'refusal') {
      throw new Error('Anthropic refused to process the image (safety filter).')
    }

    const textBlock = response.content.find((b: any) => b.type === 'text')
    if (!textBlock || (textBlock as any).type !== 'text') {
      throw new Error(
        `Anthropic response contained no text content on pass ${i + 1} (stop_reason: ${response.stop_reason})`,
      )
    }

    let parsed: any
    try {
      parsed = JSON.parse((textBlock as any).text)
    } catch (err) {
      throw new Error(
        `Anthropic response is not valid JSON on pass ${i + 1} (output_tokens: ${response.usage.output_tokens}): ${(err as Error).message}`,
      )
    }
    if (!parsed || typeof parsed !== 'object' || !('header' in parsed) || !('rows' in parsed)) {
      throw new Error(`Anthropic response missing required header/rows fields on pass ${i + 1}`)
    }

    const status = checkInvariants(parsed.rows)
    iterations.push({
      iteration: i + 1,
      poolSum: status.poolSum,
      deckSum: status.deckSum,
      leaderCount: status.leaderCount,
      baseCount: status.baseCount,
      subsetViolations: status.subsetViolations,
      passing: status.passing,
      failures: status.failures,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: (response.usage as any).cache_read_input_tokens || 0,
      cacheCreationTokens: (response.usage as any).cache_creation_input_tokens || 0,
    })
    resultsByIteration.push(parsed as RawExtractResponse)

    lastResult = parsed
    lastStatus = status

    if (status.passing) {
      return {
        result: parsed as RawExtractResponse,
        iterations,
        converged: true,
        bestIteration: i + 1,
      }
    }
  }

  // Did not converge after maxIterations. Pick the iteration with the
  // smallest invariant distance — the resolve UI handles the residual gap.
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < iterations.length; i++) {
    const it = iterations[i]
    const dist = invariantDistance({
      passing: it.passing,
      poolSum: it.poolSum,
      deckSum: it.deckSum,
      leaderCount: it.leaderCount,
      baseCount: it.baseCount,
      subsetViolations: it.subsetViolations,
      unreadableCount: 0,
      failures: it.failures,
    })
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }

  return {
    result: resultsByIteration[bestIdx],
    iterations,
    converged: false,
    bestIteration: bestIdx + 1,
  }
}

/** Re-export for callers that want to type-narrow against SDK errors. */
export { Anthropic }
