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

You will receive one or two photographs of a registration sheet. Each sheet has:
- A header with: set name, event name, event date, player name, selected leader, selected base
- Rows of cards grouped by aspect (Vigilance, Command, Aggression, Cunning, Villainy, Heroism, Neutral)
- For each row: card name, card type (Leader/Base/Unit/Event/Upgrade), optional subtitle, "in pool" quantity, "in deck" quantity

A complete pool always totals exactly 96 cards: 6 leaders + 6 bases + 84 other cards.
The user's selected leader and base are 1 each of those 6 (the rest are unused alternates).
The active leader and base are typically marked with "in deck" = 1 on their rows.
Other cards have "in pool" = N (1 to 6) and "in deck" between 0 and N (capped at 4 typically per game rules).

IMPORTANT EXTRACTION RULES:
- Extract every card row visible on the sheet, in order.
- For card type, use exactly one of: "Leader", "Base", "Unit", "Event", "Upgrade".
- For card subtitle: include if visible (e.g. "Audacious Smuggler" for Han Solo Leader); use null if absent.
- Quantities must be integers from 0 to 6.
- "deckQty" must never exceed "poolQty" for a given row.
- For aspectGroup, use the section header the row appears under (e.g. "Vigilance", "Command/Heroism", "Neutral").
- If a quantity number is unreadable, use 0 and rely on the resolution UI to fix it.
- If a card name is unreadable, use the literal string "?" and rely on the resolution UI.
- Never invent cards that aren't on the sheet.

Return strict JSON conforming to the response schema. Do not include any prose, markdown, or explanation outside the JSON.`

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
      ? `Extract the registration sheet data. The user has indicated this sheet is for set "${opts.setHint}".`
      : 'Extract the registration sheet data. Detect the set from the header.',
  })

  // Streaming required: SDK rejects non-streaming requests that may take >10 min,
  // which fires above ~16K max_tokens. .finalMessage() resolves with the same
  // Message shape we'd get back from messages.create.
  const response = await client.messages
    .stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Frozen system prompt with prompt-cache breakpoint — repeated extractions
      // benefit from cache reads on the system + schema portion.
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
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
