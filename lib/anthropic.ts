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
import {
  TABLE_NAMES,
  SUB_GROUP_KEYS,
  groupCardsByTable,
  groupCardsBySubGroup,
  cardNumberOf,
  type TableName,
} from '../src/services/importPool/tableGrouping'
import {
  cropForTable,
  cropOriginalAndPreprocess,
  extractTableFromCrop,
  extractTableMultiSample,
} from '../src/services/importPool/sectionExtraction'
import {
  classifyTableWithClaude,
  classifyCellStrips,
  runOmrSidecar,
  type CellStripInput,
  type CellStripRead,
} from '../src/services/importPool/omrExtraction'
import {
  addResponseUsage,
  newExtractUsage,
  type ExtractUsage,
} from '../src/services/importPool/extractUsage'

// Extraction model. Env-overridable so the eval harness can A/B alternative
// models (e.g. IMPORT_EXTRACT_MODEL=claude-fable-5) without a code change.
const MODEL = process.env.IMPORT_EXTRACT_MODEL || 'claude-opus-4-7'
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
  /** Test/eval-only: when true, skip preprocessImageForExtraction and use the
   *  caller-provided buffers as-is. Lets the eval harness apply parametric
   *  conversion+resize+sharpen pipelines and feed already-prepared bytes.
   *  Production code should never set this. */
  skipPreprocess?: boolean
  /** Test/eval-only: override what the OMR sidecar sees. Production passes
   *  the same `originalBuffers` to the sidecar that came from the caller,
   *  but the eval harness wants to vary sidecar input independently from
   *  Phase 1 input to isolate which preprocessing helps which step. */
  sidecarBuffers?: Buffer[]
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
  /** Per-table architecture only: name of the table this iteration ran on. */
  tableName?: string
  /** Per-table architecture only: total cards in the table's closed vocab. */
  tableTotalCards?: number
  /** Per-table architecture only: count of rows with poolQty>0 (vs poolSum which sums quantities). */
  tableMarkedRows?: number
  /** Per-table architecture only: count of rows with deckQty>0. */
  tableDeckRows?: number
}

export interface ExtractResult {
  result: RawExtractResponse
  iterations: ExtractIterationLog[]
  converged: boolean
  /** 1-indexed pass whose `result` was returned. When `converged`, this is the
   *  passing iteration; otherwise it's the iteration with the smallest
   *  invariant distance. */
  bestIteration: number
  /** Cumulative token usage across EVERY API call in this extraction
   *  (Phase 1 + all Phase 2 table/sample/refine calls). */
  usage: ExtractUsage
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

// === Phase 1: header + section bounds ===
//
// One small Claude call to identify the per-table bounding boxes and the
// header. Output is tiny (< 1KB) so this is fast (~30-60s) compared to a
// full extraction. The bounds feed Phase 2's per-table calls.

const PHASE1_SYSTEM_PROMPT = `You're looking at one or two photos of a sealed-deck registration sheet for Star Wars: Unlimited.

Your ONLY job: identify the header info and bounding boxes for each visible TABLE on the sheet AND each SUB-SECTION within those tables. Do NOT extract row-by-row card data — that's a separate pass.

LAYOUT: The sheet is laid out as a series of TABLES, one per aspect (Leaders, Bases, Vigilance, Command, Aggression, Cunning, Heroism, Villainy, Multicolor, NoAspect). Each table has a column header (PLAYED | TOTAL | NO. # | name).

Within each main-aspect table (Vigilance / Command / Aggression / Cunning), the rows are divided into SUB-SECTIONS by tiny icon dividers. The sub-sections within a Vigilance table are typically:
  - Vigilance + Villainy (cards with both Vigilance and Villainy aspects)
  - Vigilance + Heroism (cards with both Vigilance and Heroism)
  - Vigilance alone (cards with only the Vigilance aspect)

Same pattern for Command/Aggression/Cunning.

The MULTICOLOR table is divided into sub-sections by main-aspect PAIR (Vigilance+Command, Vigilance+Aggression, Vigilance+Cunning, Command+Aggression, Command+Cunning, Aggression+Cunning). Cards with three aspects (e.g. Vigilance+Command+Heroism) belong in their two-main-aspect pair (V+C in that example).

Leaders / Bases / Heroism / Villainy / NoAspect tables have NO sub-sections.

PART 1 — return TABLE-LEVEL bboxes (in "sections" array):
For each visible table, return:
- name: one of "Leaders", "Bases", "Vigilance", "Command", "Aggression", "Cunning", "Heroism", "Villainy", "Multicolor", "NoAspect"
- photoIndex (0 or 1)
- x0, y0, x1, y1 as fractions [0,1]
- Include the column header AND all rows through the last row of the table.

PART 2 — return SUB-SECTION bboxes (in "subSections" array):
For each sub-section visible on the sheet (typically 3 per main-aspect table, 1 per simpler table, 6 for multicolor), return:
- key: one of the sub-section keys listed below
- photoIndex (0 or 1)
- x0, y0, x1, y1 as fractions [0,1]
- Include only the rows of that specific sub-section. Do NOT include rows from sibling sub-sections.

Allowed sub-section keys:
  Leaders, Bases, Heroism, Villainy, NoAspect (each table is one sub-section)
  Vigilance, Vigilance+Heroism, Vigilance+Villainy
  Command, Command+Heroism, Command+Villainy
  Aggression, Aggression+Heroism, Aggression+Villainy
  Cunning, Cunning+Heroism, Cunning+Villainy
  Multicolor:Command+Vigilance, Multicolor:Aggression+Vigilance, Multicolor:Cunning+Vigilance
  Multicolor:Aggression+Command, Multicolor:Command+Cunning, Multicolor:Aggression+Cunning

Header info:
- setName, eventName, eventDate, playerName
- leader: { name, subtitle } if marked
- base: { name, subtitle } if marked

Return strict JSON. NO row data.`

const PHASE1_SCHEMA = {
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
    subSections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: {
            type: 'string',
            enum: SUB_GROUP_KEYS,
          },
          photoIndex: { type: 'integer' },
          x0: { type: 'number' },
          y0: { type: 'number' },
          x1: { type: 'number' },
          y1: { type: 'number' },
        },
        required: ['key', 'photoIndex', 'x0', 'y0', 'x1', 'y1'],
      },
    },
  },
  required: ['header', 'sections', 'subSections'],
}

interface SubSectionBounds {
  key: string
  photoIndex: number
  x0: number
  y0: number
  x1: number
  y1: number
}

async function runPhase1(
  client: Anthropic,
  images: ImageInput[],
  setHint?: string,
): Promise<{
  header: ExtractedHeader
  sections: SectionBounds[]
  subSections: SubSectionBounds[]
  usage: any
}> {
  const userContent: Anthropic.MessageParam['content'] = []
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const isLast = i === images.length - 1
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
      ...(isLast ? { cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } } : {}),
    })
  }
  userContent.push({
    type: 'text',
    text: setHint
      ? `Identify the header (set, event, player, leader, base) and the bounding box of each visible aspect table. Set is "${setHint}".`
      : `Identify the header (set, event, player, leader, base) and the bounding box of each visible aspect table.`,
  })

  let response: any
  let attempt = 0
  while (true) {
    try {
      response = await client.messages
        .stream({
          model: MODEL,
          // 16K, not 2K: thinking-enabled models (e.g. Fable 5) spend output
          // budget on thinking blocks before the JSON — observed >8K thinking
          // on busy two-photo sheets. Opus 4.7 ignores the extra headroom —
          // max_tokens is a cap, not a spend.
          max_tokens: 16000,
          system: PHASE1_SYSTEM_PROMPT,
          output_config: { format: { type: 'json_schema' as const, schema: PHASE1_SCHEMA } },
          messages: [{ role: 'user', content: userContent }],
        })
        .finalMessage()
      break
    } catch (err) {
      attempt++
      const msg = (err as Error)?.message || ''
      const isTransient = /terminated|socket|ECONNRESET|ETIMEDOUT|timeout/.test(msg)
      if (!isTransient || attempt >= 3) throw err
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }

  if (response.stop_reason === 'max_tokens') {
    throw new Error(`Phase 1 max_tokens hit (output=${response.usage.output_tokens})`)
  }
  if (response.stop_reason === 'refusal') {
    throw new Error('Phase 1 refusal')
  }

  const textBlock = response.content.find((b: any) => b.type === 'text') as any
  if (!textBlock) throw new Error('Phase 1: no text block')
  let parsed: any
  try {
    parsed = JSON.parse(textBlock.text)
  } catch (err) {
    throw new Error(`Phase 1: invalid JSON: ${(err as Error).message}`)
  }
  return {
    header: parsed.header,
    sections: parsed.sections || [],
    subSections: parsed.subSections || [],
    usage: response.usage,
  }
}

/**
 * Extract pool data from one or two registration-sheet images.
 *
 * Two-phase architecture:
 *
 *   Phase 1 (one cheap call): identify the header + per-table bounding
 *   boxes. Output is tiny so this is fast.
 *
 *   Phase 2 (10 parallel cheap calls): for each table on the sheet, crop
 *   the image to the table's bounding box and send Claude:
 *     - the crop
 *     - a CLOSED list of cards in this table by printed card number
 *   Claude maps marks → card numbers (no name OCR, no set-wide vocab).
 *   Hallucinations are sharply reduced because Claude can only return
 *   card numbers from the list it was given.
 *
 *   Aggregate: combine all per-table results into the final rows[].
 *
 * Each Phase 2 call is small (one cropped image, ~30 known cards in the
 * vocab, ~50-row JSON response) so total time is ~2-3 minutes vs. the
 * old ~25-30 min eight-iteration refine loop.
 *
 * Throws on:
 * - Missing ANTHROPIC_API_KEY env var
 * - Empty images array (too few or too many)
 * - Persistent upstream failure (after retries)
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

  // Two parallel buffer arrays:
  //  - originalBuffers: the raw upload bytes, used by Phase 2 so each table
  //    crop is taken at NATIVE photo resolution (column pixel density is
  //    preserved on large phone photos).
  //  - preprocessedBuffers: full-photo contrast-enhanced bytes, used by
  //    Phase 1 (header + bounds) where we want the model to see the whole
  //    sheet legibly.
  const originalBuffers: Buffer[] = images.map((img) => Buffer.from(img.data, 'base64'))
  const preprocessedBuffers: Buffer[] = []
  for (const buf of originalBuffers) {
    try {
      preprocessedBuffers.push(await preprocessImageForExtraction(buf))
    } catch (err) {
      throw new Error(
        `Image preprocessing failed: ${(err as Error).message}. ` +
          `Possible causes: corrupt JPEG, unsupported format.`,
      )
    }
  }
  const preprocessedInputs: ImageInput[] = preprocessedBuffers.map((buf) => ({
    data: buf.toString('base64'),
    mediaType: 'image/jpeg',
  }))

  // Resolve setCode from hint or fall back to latest released set. The
  // route handler will reconcile this against the header's setName, but
  // for table grouping we need a setCode locally.
  await initializeCardCache().catch(() => {})
  const setCode = opts.setHint || getLatestReleasedSetCode()
  const allCards = (getCachedCards(setCode) || []).filter((c: any) => c.variantType === 'Normal')
  const tableGroups = groupCardsByTable(allCards)

  const client = getClient()

  // Cumulative token usage across every API call in this extraction.
  const usage = newExtractUsage()

  // Phase 1: header + section bounds
  const phase1Start = Date.now()
  let phase1: { header: ExtractedHeader; sections: SectionBounds[]; usage: any }
  try {
    phase1 = await runPhase1(client, preprocessedInputs, opts.setHint)
  } catch (err) {
    throw new Error(`Phase 1 failed: ${(err as Error).message}`)
  }
  addResponseUsage(usage, phase1.usage)
  const phase1Elapsed = Date.now() - phase1Start

  // Phase 2: per-SUB-GROUP parallel extraction with multi-sample voting.
  //
  // Per table, cards are split by sub-aspect (e.g. Vigilance table → three
  // sub-groups: V+Heroism, V+Villainy, V-alone; Multicolor → six pair
  // sub-groups). Each sub-group is a separate call with a smaller closed
  // vocab — better focus, less hallucination on long lists.
  //
  // Sample count is adaptive: small sub-groups (≤15 cards) get 5 samples
  // (variance is more visible there and runs are cheap because the vocab
  // is small); larger sub-groups get 3 samples to keep total cost in
  // check.
  //
  // Leaders/Bases get a STRUCTURAL CONSTRAINT hint up front: a sealed
  // pool always has exactly 6 leaders + 6 bases and exactly 1 active
  // each. If the voted result is off, a refine pass re-runs.
  // Sample count tiers. More samples on small / structurally-important
  // tables where each card matters and cost is low. Larger sub-groups
  // (>15 cards) keep moderate samples to bound total cost.
  const samplesFor = (cardCount: number, tableName: string): number => {
    if (tableName === 'Leaders' || tableName === 'Bases') return 9
    if (cardCount <= 15) return 7
    return 5
  }
  const phase2Start = Date.now()

  // Crop each TABLE once (used as fallback for sub-groups Phase 1 didn't
  // bound at the sub-section level).
  const tableCrops = new Map<TableName, { cropBuf: Buffer; fellBack: boolean }>()
  for (const tableName of TABLE_NAMES) {
    const sectionBounds = phase1.sections.find((s: any) => s.name === tableName)
    if (
      sectionBounds &&
      sectionBounds.photoIndex >= 0 &&
      sectionBounds.photoIndex < originalBuffers.length
    ) {
      try {
        const cropBuf = await cropOriginalAndPreprocess(
          originalBuffers[sectionBounds.photoIndex],
          sectionBounds,
        )
        tableCrops.set(tableName, { cropBuf, fellBack: false })
      } catch {
        tableCrops.set(tableName, { cropBuf: preprocessedBuffers[0], fellBack: true })
      }
    } else {
      tableCrops.set(tableName, { cropBuf: preprocessedBuffers[0], fellBack: true })
    }
  }

  // Per-sub-section crops: a tighter crop for each sub-group, isolating
  // just the rows belonging to that sub-aspect. CRITICAL: each sub-section
  // crop is extended UPWARD to include the parent table's column header
  // (the "PLAYED TOTAL NO.# name" row). Without that header, the per-table
  // prompt's column-anchoring logic ("scan right-to-left from the printed
  // card number, TOTAL is one cell left, PLAYED is two cells left") falls
  // apart because the crop has no labels to anchor on.
  //
  // Sub-group key → table mapping:
  //   "Vigilance+Heroism" / "Vigilance+Villainy" / "Vigilance" → Vigilance table
  //   "Multicolor:Aggression+Vigilance" → Multicolor table (etc.)
  //   "Leaders" / "Bases" / "Heroism" / "Villainy" / "NoAspect" → themselves
  function tableForSubGroup(key: string): TableName | null {
    if ((TABLE_NAMES as string[]).includes(key)) return key as TableName
    if (key.startsWith('Multicolor:')) return 'Multicolor'
    if (key.startsWith('Vigilance')) return 'Vigilance'
    if (key.startsWith('Command')) return 'Command'
    if (key.startsWith('Aggression')) return 'Aggression'
    if (key.startsWith('Cunning')) return 'Cunning'
    return null
  }

  // Sub-section crops disabled — multiple attempts regressed accuracy
  // because Phase 1's sub-section bbox identification is unreliable on
  // lower-resolution photos and the tighter crops drop column-header
  // context. Phase 1 still RETURNS subSections (kept in the schema for
  // future iteration / diagnostics), but Phase 2 always uses the
  // table-level crop.
  const subSectionCrops = new Map<string, Buffer>()

  // Build sub-group jobs across all tables.
  const subGroups = groupCardsBySubGroup(allCards)

  type SubGroupJobResult = {
    subGroup: string
    tableName: TableName
    rows: any[]
    outputTokens: number
    fellBack: boolean
    cardCount: number
    samplesRun: number
    voteCount?: {
      poolMarkedCount: Map<number, number>
      deckMarkedCount: Map<number, number>
      totalSamples: number
    }
  }

  const jobs: Promise<SubGroupJobResult>[] = subGroups.map(async ({ subGroup, table, cards: sgCards }) => {
    // Prefer the sub-section-specific crop from Phase 1 if available;
    // fall back to the table-level crop, then full photo.
    let cropBuf: Buffer
    let fellBack = false
    const subCrop = subSectionCrops.get(subGroup)
    if (subCrop) {
      cropBuf = subCrop
    } else {
      const tableEntry = tableCrops.get(table)!
      cropBuf = tableEntry.cropBuf
      fellBack = tableEntry.fellBack
    }
    // Hint per table: Leaders has a fixed sum of 6 (one per pack, no rare
    // tier). Bases has ≥6 (6 commons + variable rare bases) so we do NOT
    // give it a hard sum hint; the prompt's table-specific block tells
    // it to count freely. Note also that deckQty for active leader/base
    // can be 0 (sheet incomplete) or 1 — so we don't pin that either at
    // the first-pass hint level; the structural refine pass below
    // enforces the more nuanced rule.
    const hint =
      table === 'Leaders' ? { expectedPoolSum: 6 } : undefined
    const samplesForThis = samplesFor(sgCards.length, table)
    const result = await extractTableMultiSample(
      client,
      cropBuf,
      table,
      sgCards,
      setCode,
      samplesForThis,
      hint,
      usage,
    )
    return {
      subGroup,
      tableName: table,
      rows: result.rows,
      outputTokens: result.outputTokens,
      fellBack,
      cardCount: sgCards.length,
      samplesRun: result.samplesRun,
      voteCount: result.voteCount,
    }
  })
  const sgResults = await Promise.all(jobs)

  // Aggregate by table for invariant checks and reporting.
  const byTable = new Map<TableName, SubGroupJobResult[]>()
  for (const r of sgResults) {
    if (!byTable.has(r.tableName)) byTable.set(r.tableName, [])
    byTable.get(r.tableName)!.push(r)
  }

  // Second-chance pass for small sub-groups that voted 0 marked rows.
  // 5 samples all coming back blank is strong evidence — but on small
  // tables (Heroism, Villainy, sub-aspect splits) it can also indicate
  // Claude is bailing rather than scanning. Re-run those with an explicit
  // "look harder" hint and 3 more samples; if the new run finds any
  // marks, replace the original.
  for (const sg of sgResults) {
    if (sg.cardCount > 15) continue
    const hasMarks = sg.rows.some((r: any) => Number(r.poolQty || 0) > 0)
    if (hasMarks) continue

    const tableEntry = tableCrops.get(sg.tableName)!
    const sgCards = (groupCardsBySubGroup(allCards).find(
      (g) => g.subGroup === sg.subGroup,
    )?.cards || [])
    // Same hint shape as the first pass — Leaders gets a sum constraint,
    // Bases gets a free count.
    const baseHint =
      sg.tableName === 'Leaders' ? { expectedPoolSum: 6 } : {}
    try {
      const second = await extractTableMultiSample(
        client,
        tableEntry.cropBuf,
        sg.tableName,
        sgCards,
        setCode,
        3,
        { ...baseHint, lookHarder: true },
        usage,
      )
      const secondHasMarks = second.rows.some((r: any) => Number(r.poolQty || 0) > 0)
      if (secondHasMarks) {
        sg.rows = second.rows
        sg.outputTokens += second.outputTokens
      }
    } catch (err) {
      console.warn(`[second-chance] ${sg.tableName}/${sg.subGroup}: ${(err as Error).message}`)
    }
  }

  // Structural refine pass for Leaders/Bases.
  //
  // Leaders: poolSum MUST equal 6 (no rare leaders). deckSum should be
  // 0 or 1 (player picks one — or none if sheet incomplete).
  //
  // Bases: poolSum MUST be ≥ 6 (6 commons + 0 or more rare bases).
  // deckSum should be 0 or 1.
  //
  // If voted result violates these, run one targeted refine call.
  for (const tableName of ['Leaders', 'Bases'] as const) {
    const sgs = byTable.get(tableName) || []
    if (sgs.length !== 1) continue
    const sg = sgs[0]
    const poolSum = sg.rows.reduce((s: number, r: any) => s + Number(r.poolQty || 0), 0)
    const deckSum = sg.rows.reduce((s: number, r: any) => s + Number(r.deckQty || 0), 0)

    const gapParts: string[] = []
    if (tableName === 'Leaders') {
      if (poolSum !== 6) gapParts.push(`poolQty sum was ${poolSum}, must be 6`)
      if (deckSum > 1) gapParts.push(`deckQty sum was ${deckSum}, must be 0 or 1`)
    } else {
      // Bases: only complain if UNDER 6
      if (poolSum < 6) gapParts.push(`poolQty sum was ${poolSum}, must be ≥6`)
      if (deckSum > 1) gapParts.push(`deckQty sum was ${deckSum}, must be 0 or 1`)
    }
    if (gapParts.length === 0) continue

    const refineHint =
      tableName === 'Leaders'
        ? { expectedPoolSum: 6, previousAttempt: { rows: sg.rows, gap: gapParts.join('; ') } }
        : { previousAttempt: { rows: sg.rows, gap: gapParts.join('; ') } }
    const tableEntry = tableCrops.get(tableName)!
    const tableCards = tableGroups.get(tableName) || []
    const refineResult = await extractTableFromCrop(
      client,
      tableEntry.cropBuf,
      tableName,
      tableCards,
      setCode,
      refineHint,
      usage,
    )
    sg.rows = refineResult.rows
    sg.outputTokens += refineResult.outputTokens
  }

  const phase2Elapsed = Date.now() - phase2Start

  // Build the equivalent of the old tableResults shape so the rest of the
  // function (aggregation, iteration log, return) doesn't need to change.
  type TableJobResult = {
    tableName: TableName
    rows: any[]
    outputTokens: number
    fellBack: boolean
  }
  const tableResults: TableJobResult[] = TABLE_NAMES.map((tableName) => {
    const sgs = byTable.get(tableName) || []
    const allRows = sgs.flatMap((s) => s.rows)
    const totalOutput = sgs.reduce((s, r) => s + r.outputTokens, 0)
    const fellBack = sgs.some((s) => s.fellBack)
    return { tableName, rows: allRows, outputTokens: totalOutput, fellBack }
  })

  // Aggregate: convert table results to ExtractedRow[] using the cardCache
  // for name/subtitle/aspects. Card number → card lookup.
  const cardByNumber = new Map<number, any>()
  for (const c of allCards) cardByNumber.set(cardNumberOf(c.cardId), c)

  const allRows: ExtractedRow[] = []
  let droppedUnknownNumbers = 0
  for (const tr of tableResults) {
    for (const r of tr.rows) {
      const card = cardByNumber.get(r.cardNumber)
      if (!card) {
        droppedUnknownNumbers++
        continue
      }
      allRows.push({
        name: card.name,
        type: card.type,
        subtitle: card.subtitle,
        poolQty: r.poolQty,
        deckQty: r.deckQty,
        aspectGroup: card.aspects?.join(' ') || null,
        poolQtyConfidence: r.poolQtyConfidence,
        deckQtyConfidence: r.deckQtyConfidence,
      } as any)
    }
  }

  // Per-table iteration log entries (one per table) so the route handler's
  // per-iter logging surfaces table-by-table progress and the eval harness
  // can see which table over/under-counted.
  const iterations: ExtractIterationLog[] = tableResults.map((tr, i) => {
    const allRowsThisTable = tr.rows
    const markedPool = allRowsThisTable.filter((r: any) => Number(r.poolQty) > 0)
    const markedDeck = allRowsThisTable.filter((r: any) => Number(r.deckQty) > 0)
    const poolSum = allRowsThisTable.reduce((s: number, r: any) => s + Number(r.poolQty || 0), 0)
    const deckSum = allRowsThisTable.reduce((s: number, r: any) => s + Number(r.deckQty || 0), 0)
    const subsetViolations = allRowsThisTable.filter(
      (r: any) => Number(r.deckQty || 0) > Number(r.poolQty || 0),
    ).length
    const tableTotal = tableGroups.get(tr.tableName)?.length || 0
    const tableLabel = `${tr.tableName}${tr.fellBack ? '*' : ''}`
    return {
      iteration: i + 1,
      poolSum,
      deckSum,
      leaderCount: tr.tableName === 'Leaders' ? poolSum : 0,
      baseCount: tr.tableName === 'Bases' ? poolSum : 0,
      subsetViolations,
      passing: false,
      failures: [
        `table=${tableLabel} pool=${poolSum} deck=${deckSum} (${markedPool.length}/${tableTotal} rows marked, ${markedDeck.length}/${tableTotal} in deck)`,
      ],
      outputTokens: tr.outputTokens,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      tableName: tr.tableName,
      tableTotalCards: tableTotal,
      tableMarkedRows: markedPool.length,
      tableDeckRows: markedDeck.length,
    }
  })

  // Final invariant check on aggregated result
  const status = checkInvariants(allRows)

  const result: RawExtractResponse = {
    header: phase1.header,
    rows: allRows,
    sections: phase1.sections,
  } as RawExtractResponse

  // Touch unused vars so TS doesn't complain in the @ts-nocheck file (these
  // are useful for future logging/telemetry from the route handler)
  void phase1Elapsed
  void phase2Elapsed
  void droppedUnknownNumbers
  void invariantDistance

  return {
    result,
    iterations,
    converged: status.passing,
    bestIteration: 1,
    usage,
  }
}

/**
 * Whole-table extraction using OMR table detection + per-table Claude calls.
 *
 * This is the OPUS-WHOLE-TABLE architecture from
 * `plans/IMPORT_POOL_OMR_REPORT.md`: replaces the multi-sample sub-aspect
 * voting loop with a single Claude Opus 4.7 call per detected table.
 *
 * Pipeline:
 *   1. Phase 1 (header + section bounds) — same as before.
 *   2. OMR sidecar: spawn `scripts/omr/extract_for_node.py` to detect
 *      tables on each photo. Returns one cropped image per table.
 *   3. Per-table Claude call: closed-vocabulary whole-table classification.
 *   4. Aggregate ExtractedRow[] (same shape as before).
 *
 * Validated to ~97% per-cell accuracy at ~$0.55-0.69/import on 3 LAW
 * fixtures. About 13 pp better than the prior multi-sample architecture
 * (~83-84%) at half the cost and ~10x faster.
 */
export async function extractPoolFromImagesWholeTable(
  images: ImageInput[],
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  if (images.length === 0) {
    throw new Error('extractPoolFromImagesWholeTable requires at least 1 image')
  }
  if (images.length > 2) {
    throw new Error('extractPoolFromImagesWholeTable supports at most 2 images')
  }

  const originalBuffers: Buffer[] = images.map((img) => Buffer.from(img.data, 'base64'))
  const preprocessedBuffers: Buffer[] = []
  for (const buf of originalBuffers) {
    preprocessedBuffers.push(opts.skipPreprocess ? buf : await preprocessImageForExtraction(buf))
  }
  const preprocessedInputs: ImageInput[] = preprocessedBuffers.map((buf) => ({
    data: buf.toString('base64'),
    mediaType: 'image/jpeg',
  }))

  // Resolve setCode and card list (same as legacy path).
  await initializeCardCache().catch(() => {})
  const setCode = opts.setHint || getLatestReleasedSetCode()
  const allCards = (getCachedCards(setCode) || []).filter((c: any) => c.variantType === 'Normal')
  const tableGroups = groupCardsByTable(allCards)

  const client = getClient()

  // Cumulative token usage across every API call in this extraction.
  const usage = newExtractUsage()

  // Phase 1: header + section bounds (kept from legacy path).
  const phase1Start = Date.now()
  let phase1: { header: ExtractedHeader; sections: SectionBounds[]; usage: any }
  try {
    phase1 = await runPhase1(client, preprocessedInputs, opts.setHint)
  } catch (err) {
    throw new Error(`Phase 1 failed: ${(err as Error).message}`)
  }
  addResponseUsage(usage, phase1.usage)
  const phase1Elapsed = Date.now() - phase1Start

  // Phase 2: OMR sidecar (Python) + per-table whole-table Claude calls.
  const phase2Start = Date.now()
  const sidecar = await runOmrSidecar(opts.sidecarBuffers || originalBuffers)
  if (sidecar.warnings.length > 0) {
    for (const w of sidecar.warnings) console.warn(`[omr-sidecar] ${w}`)
  }

  // Build per-section bounds in the ORIGINAL photo's coordinate system,
  // so the resolve UI's source-image modal can crop to a section. The
  // sidecar already gave us normalized [0,1] AABBs from inverse-projecting
  // each detected table's canonical-space bounds through the warp
  // matrix.
  const omrSections: SectionBounds[] = sidecar.tables.map((t) => ({
    name: t.name as SectionName,
    photoIndex: t.photo_index,
    x0: t.bounds_original.x0,
    y0: t.bounds_original.y0,
    x1: t.bounds_original.x1,
    y1: t.bounds_original.y1,
  }))

  // Run per-table Claude calls in parallel (concurrency-limited).
  const concurrency = 8
  const tableResults: Array<{
    tableName: TableName
    rows: Array<{ cardNumber: number; poolQty: number; deckQty: number; poolUnclear: boolean; deckUnclear: boolean }>
    error: string | null
  }> = []
  const queue = [...sidecar.tables]
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const t = queue.shift()
        if (!t) break
        const cards = (tableGroups.get(t.name as TableName) || []) as any[]
        if (cards.length === 0) continue
        try {
          const rows = await classifyTableWithClaude(client, t.name as TableName, cards, t.image_b64, usage)
          tableResults.push({ tableName: t.name as TableName, rows, error: null })
        } catch (err) {
          tableResults.push({
            tableName: t.name as TableName,
            rows: [],
            error: (err as Error).message,
          })
          console.warn(`[whole-table] ${t.name} failed: ${(err as Error).message}`)
        }
      }
    }),
  )
  const phase2Elapsed = Date.now() - phase2Start

  // Aggregate per-table rows into ExtractedRow[] (using cardCache for
  // name/subtitle/aspects). Card number → card lookup.
  const cardByNumber = new Map<number, any>()
  for (const c of allCards) cardByNumber.set(cardNumberOf(c.cardId), c)

  const allRows: ExtractedRow[] = []
  let droppedUnknownNumbers = 0
  for (const tr of tableResults) {
    for (const r of tr.rows) {
      const card = cardByNumber.get(r.cardNumber)
      if (!card) {
        droppedUnknownNumbers++
        continue
      }
      // Map "unclear" flags → 'low' confidence so the resolve UI surfaces
      // these cells for human review (existing behavior preserved).
      const poolConf = r.poolUnclear ? 'low' : 'high'
      const deckConf = r.deckUnclear ? 'low' : 'high'
      allRows.push({
        name: card.name,
        type: card.type,
        subtitle: card.subtitle,
        poolQty: r.poolQty,
        deckQty: r.deckQty,
        aspectGroup: card.aspects?.join(' ') || null,
        poolQtyConfidence: poolConf,
        deckQtyConfidence: deckConf,
      } as any)
    }
  }

  // Per-table iteration log entries.
  const iterations: ExtractIterationLog[] = tableResults.map((tr, i) => {
    const markedPool = tr.rows.filter((r: any) => Number(r.poolQty) > 0)
    const markedDeck = tr.rows.filter((r: any) => Number(r.deckQty) > 0)
    const poolSum = tr.rows.reduce((s: number, r: any) => s + Number(r.poolQty || 0), 0)
    const deckSum = tr.rows.reduce((s: number, r: any) => s + Number(r.deckQty || 0), 0)
    const subsetViolations = tr.rows.filter(
      (r: any) => Number(r.deckQty || 0) > Number(r.poolQty || 0),
    ).length
    const tableTotal = tableGroups.get(tr.tableName)?.length || 0
    return {
      iteration: i + 1,
      poolSum,
      deckSum,
      leaderCount: tr.tableName === 'Leaders' ? poolSum : 0,
      baseCount: tr.tableName === 'Bases' ? poolSum : 0,
      subsetViolations,
      passing: false,
      failures: tr.error
        ? [`table=${tr.tableName} ERROR: ${tr.error}`]
        : [
            `table=${tr.tableName} pool=${poolSum} deck=${deckSum} (${markedPool.length}/${tableTotal} rows marked, ${markedDeck.length}/${tableTotal} in deck)`,
          ],
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      tableName: tr.tableName,
      tableTotalCards: tableTotal,
      tableMarkedRows: markedPool.length,
      tableDeckRows: markedDeck.length,
    }
  })

  // Final invariant check on aggregated result
  const status = checkInvariants(allRows)

  // Use OMR-derived sections (precise, table-by-table) as the primary
  // source. Fall back to Phase 1's Claude-derived sections only if OMR
  // didn't produce any (e.g. fiducials weren't detected on a photo).
  const sectionsForResponse = omrSections.length > 0 ? omrSections : phase1.sections

  const result: RawExtractResponse = {
    header: phase1.header,
    rows: allRows,
    sections: sectionsForResponse,
  } as RawExtractResponse

  void phase1Elapsed
  void phase2Elapsed
  void droppedUnknownNumbers
  void invariantDistance

  return {
    result,
    iterations,
    converged: status.passing,
    bestIteration: 1,
    usage,
  }
}

/**
 * CELLS architecture: classical CV decides WHERE the ink is; the model
 * only reads the inked cells.
 *
 * Pipeline:
 *   1. Phase 1 (header + fallback bounds) — same helper as the siblings;
 *      at Haiku rates this is ~$0.01.
 *   2. OMR sidecar with --cells: warps each table, detects row bands via
 *      grid lines (gap-filled), measures per-cell ink on a marks-only
 *      mask, and returns a strip image [PLAYED|TOTAL|NO.#] for every band
 *      that looks inked (deliberately over-emitting — blank strips cost
 *      pennies; a missed strip is an unrecoverable miss).
 *   3. Batched strip reads: ~40 strips per call. The model transcribes
 *      the printed card number and the two handwritten quantities per
 *      strip — no table scanning, no row alignment, no closed-list
 *      matching. Bases strips (no printed number) carry the name column.
 *   4. Join by card number (bases by name) against the set's card list;
 *      unmatched or ambiguous reads become low-confidence rows.
 *
 * Target cost: ~$0.02-0.05/sheet at Haiku 4.5 rates.
 */
export async function extractPoolFromImagesCells(
  images: ImageInput[],
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  if (images.length === 0) {
    throw new Error('extractPoolFromImagesCells requires at least 1 image')
  }
  if (images.length > 2) {
    throw new Error('extractPoolFromImagesCells supports at most 2 images')
  }

  const originalBuffers: Buffer[] = images.map((img) => Buffer.from(img.data, 'base64'))
  const preprocessedBuffers: Buffer[] = []
  for (const buf of originalBuffers) {
    preprocessedBuffers.push(opts.skipPreprocess ? buf : await preprocessImageForExtraction(buf))
  }
  const preprocessedInputs: ImageInput[] = preprocessedBuffers.map((buf) => ({
    data: buf.toString('base64'),
    mediaType: 'image/jpeg',
  }))

  await initializeCardCache().catch(() => {})
  const setCode = opts.setHint || getLatestReleasedSetCode()
  const allCards = (getCachedCards(setCode) || []).filter((c: any) => c.variantType === 'Normal')
  const tableGroups = groupCardsByTable(allCards)

  const client = getClient()
  const usage = newExtractUsage()

  // Phase 1: header (+ fallback section bounds).
  let phase1: { header: ExtractedHeader; sections: SectionBounds[]; usage: any }
  try {
    phase1 = await runPhase1(client, preprocessedInputs, opts.setHint)
  } catch (err) {
    throw new Error(`Phase 1 failed: ${(err as Error).message}`)
  }
  addResponseUsage(usage, phase1.usage)

  // Phase 2: OMR sidecar with per-row cell detection.
  const sidecar = await runOmrSidecar(opts.sidecarBuffers || originalBuffers, { cells: true })
  if (sidecar.warnings.length > 0) {
    for (const w of sidecar.warnings) console.warn(`[omr-sidecar] ${w}`)
  }
  const omrSections: SectionBounds[] = sidecar.tables.map((t) => ({
    name: t.name as SectionName,
    photoIndex: t.photo_index,
    x0: t.bounds_original.x0,
    y0: t.bounds_original.y0,
    x1: t.bounds_original.x1,
    y1: t.bounds_original.y1,
  }))

  // Collect inked strips across all tables.
  const strips: CellStripInput[] = []
  for (const t of sidecar.tables) {
    for (const r of t.rows || []) {
      if (r.strip_b64) strips.push({ id: strips.length, table: t.name as TableName, b64: r.strip_b64 })
    }
  }

  // Read strips in batches (bounded parallelism). Small batches on
  // purpose: long multimodal sequences degrade small-model attention —
  // batch=40 measurably under-read vs batch=10 in eval.
  const BATCH = 10
  const batches: CellStripInput[][] = []
  for (let i = 0; i < strips.length; i += BATCH) batches.push(strips.slice(i, i + BATCH))
  const readsById = new Map<number, CellStripRead>()
  const batchErrors: string[] = []
  const batchQueue = [...batches]
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (batchQueue.length > 0) {
        const batch = batchQueue.shift()
        if (!batch) break
        try {
          const reads = await classifyCellStrips(client, batch, usage)
          for (const r of reads) readsById.set(r.s, r)
        } catch (err) {
          batchErrors.push((err as Error).message)
          console.warn(`[cells] strip batch failed: ${(err as Error).message}`)
        }
      }
    }),
  )

  // Join reads back to cards, per table.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const cardByNumber = new Map<number, any>()
  for (const c of allCards) cardByNumber.set(cardNumberOf(c.cardId), c)

  let unknownReads = 0
  const tableResults: Array<{
    tableName: TableName
    rows: Array<{ cardNumber: number; poolQty: number; deckQty: number; poolUnclear: boolean; deckUnclear: boolean }>
    error: string | null
  }> = []
  for (const t of sidecar.tables) {
    const tableName = t.name as TableName
    const vocab = (tableGroups.get(tableName) || []) as any[]
    if (vocab.length === 0) continue
    const vocabNumbers = new Set(vocab.map((c: any) => cardNumberOf(c.cardId)))
    const readByCard = new Map<number, { p: number; t: number; u: boolean }>()

    const tableStrips = strips.filter((s) => s.table === tableName)
    for (const s of tableStrips) {
      const read = readsById.get(s.id)
      if (!read || read.skip) continue
      if (read.p <= 0 && read.t <= 0) continue
      let cardNumber: number | null = null
      if (tableName === 'Bases') {
        const want = read.b ? norm(read.b) : null
        const match = want
          ? vocab.find((c: any) => norm(c.name) === want) || vocab.find((c: any) => norm(c.name).includes(want) || want.includes(norm(c.name)))
          : null
        if (match) cardNumber = cardNumberOf(match.cardId)
      } else if (read.n != null && vocabNumbers.has(read.n)) {
        cardNumber = read.n
      } else if (read.n != null && cardByNumber.has(read.n)) {
        // Number exists in the set but not this table — geometry drift or
        // misread. Accept it (the number is authoritative).
        cardNumber = read.n
      }
      if (cardNumber == null) {
        unknownReads++
        continue
      }
      const prev = readByCard.get(cardNumber)
      if (prev) {
        // Two bands read the same row (overlapping strips): keep the
        // larger read and flag as unclear.
        readByCard.set(cardNumber, {
          p: Math.max(prev.p, read.p),
          t: Math.max(prev.t, read.t),
          u: true,
        })
      } else {
        readByCard.set(cardNumber, { p: read.p, t: read.t, u: read.u })
      }
    }

    const rows = vocab.map((c: any) => {
      const num = cardNumberOf(c.cardId)
      const rd = readByCard.get(num)
      return {
        cardNumber: num,
        poolQty: rd?.t ?? 0,
        deckQty: rd?.p ?? 0,
        poolUnclear: rd?.u ?? false,
        deckUnclear: rd?.u ?? false,
      }
    })
    // Reads that resolved to cards outside this table's vocab still need a
    // home: attach them to the table whose vocab contains them instead.
    tableResults.push({ tableName, rows, error: null })
  }
  if (unknownReads > 0) console.warn(`[cells] ${unknownReads} strip reads did not resolve to a card`)

  // Aggregate (same shape as the whole-table path).
  const allRows: ExtractedRow[] = []
  for (const tr of tableResults) {
    for (const r of tr.rows) {
      const card = cardByNumber.get(r.cardNumber)
      if (!card) continue
      allRows.push({
        name: card.name,
        type: card.type,
        subtitle: card.subtitle,
        poolQty: r.poolQty,
        deckQty: r.deckQty,
        aspectGroup: card.aspects?.join(' ') || null,
        poolQtyConfidence: r.poolUnclear ? 'low' : 'high',
        deckQtyConfidence: r.deckUnclear ? 'low' : 'high',
      } as any)
    }
  }

  const iterations: ExtractIterationLog[] = tableResults.map((tr, i) => {
    const markedPool = tr.rows.filter((r) => Number(r.poolQty) > 0)
    const markedDeck = tr.rows.filter((r) => Number(r.deckQty) > 0)
    const poolSum = tr.rows.reduce((s, r) => s + Number(r.poolQty || 0), 0)
    const deckSum = tr.rows.reduce((s, r) => s + Number(r.deckQty || 0), 0)
    const subsetViolations = tr.rows.filter((r) => Number(r.deckQty || 0) > Number(r.poolQty || 0)).length
    const tableTotal = tableGroups.get(tr.tableName)?.length || 0
    return {
      iteration: i + 1,
      poolSum,
      deckSum,
      leaderCount: tr.tableName === 'Leaders' ? poolSum : 0,
      baseCount: tr.tableName === 'Bases' ? poolSum : 0,
      subsetViolations,
      passing: false,
      failures: [
        `table=${tr.tableName} pool=${poolSum} deck=${deckSum} (${markedPool.length}/${tableTotal} rows marked, ${markedDeck.length}/${tableTotal} in deck)`,
        ...(batchErrors.length > 0 && i === 0 ? batchErrors.map((e) => `strip batch ERROR: ${e}`) : []),
      ],
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      tableName: tr.tableName,
      tableTotalCards: tableTotal,
      tableMarkedRows: markedPool.length,
      tableDeckRows: markedDeck.length,
    }
  })

  const status = checkInvariants(allRows)
  const sectionsForResponse = omrSections.length > 0 ? omrSections : phase1.sections
  const result: RawExtractResponse = {
    header: phase1.header,
    rows: allRows,
    sections: sectionsForResponse,
  } as RawExtractResponse

  return {
    result,
    iterations,
    converged: status.passing,
    bestIteration: 1,
    usage,
  }
}

/** Re-export for callers that want to type-narrow against SDK errors. */
export { Anthropic }
