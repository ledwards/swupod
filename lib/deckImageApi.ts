/**
 * Generate deck images via the swuapi.com deck-image API.
 * Replaces the old Playwright-based deckScreenshot approach.
 *
 * swuapi identifies a card by its NORMAL printing's collector number and
 * picks the treatment with a separate `variant` field. Our catalog gives
 * every treatment its own collector number (ASH-005 Normal, ASH-269
 * Hyperspace, ASH-771 Showcase), so every card is downgraded to its Normal
 * number before it goes over the wire — the same rule the SWUDB export and
 * the canvas deck image already follow. Sending a Hyperspace number *with*
 * variant: 'Hyperspace' asks swuapi for a printing that does not exist and
 * it renders a grey "Unknown" tile.
 */

import { getAllCards } from '@/src/utils/cardData'
import { buildCardLookupMaps, cardIdentityKey, normalizeCardId } from '@/src/utils/cardNormalization'

const SWUAPI_URL = process.env['SWUAPI_URL'] || 'https://api.swuapi.com'
const SWUAPI_API_KEY = process.env['SWUAPI_API_KEY'] || ''

interface DeckCard {
  name?: string | undefined
  id?: string | undefined
  variant?: string | undefined
  type?: string | undefined
  count?: number | undefined
  sideboard?: boolean | undefined
}

interface CardInfo {
  name: string
  subtitle?: string | undefined
  /** Catalog uuid. Used to resolve cards stored without a cardId. */
  id?: string | undefined
  cardId?: string | undefined
  variantType?: string | undefined
}

type DeckImageLayout = 'default' | 'limited'

interface DeckImageOptions {
  leader: CardInfo
  base: CardInfo
  deckCards: CardInfo[]
  sideboardCards?: CardInfo[] | undefined
  title?: string | undefined
  subtitle?: string | undefined
  poolUrl?: string | undefined
  layout?: DeckImageLayout | undefined
}

/**
 * Generate a deck image via swuapi and return the PNG buffer.
 * Returns null if generation fails.
 */
export async function generateDeckImage(opts: DeckImageOptions): Promise<Buffer | null> {
  try {
    const cards: DeckCard[] = []

    // Leader
    cards.push(toDeckCard(opts.leader, 'Leader'))

    // Base
    cards.push(toDeckCard(opts.base, 'Base'))

    // Deck cards (group by the card's identity, so every printing of a card
    // shares one tile with a quantity)
    const deckCounts = new Map<string, DeckCard>()
    for (const card of opts.deckCards) {
      const key = deckCardKey(card)
      const existing = deckCounts.get(key)
      if (existing) {
        existing.count = (existing.count || 1) + 1
      } else {
        deckCounts.set(key, toDeckCard(card))
      }
    }
    cards.push(...deckCounts.values())

    // Sideboard cards
    if (opts.sideboardCards && opts.sideboardCards.length > 0) {
      const sbCounts = new Map<string, DeckCard>()
      for (const card of opts.sideboardCards) {
        const key = deckCardKey(card)
        const existing = sbCounts.get(key)
        if (existing) {
          existing.count = (existing.count || 1) + 1
        } else {
          const dc = toDeckCard(card)
          dc.sideboard = true
          sbCounts.set(key, dc)
        }
      }
      cards.push(...sbCounts.values())
    }

    const body: Record<string, unknown> = {
      cards,
      title: opts.title,
      subtitle: opts.subtitle,
    }

    if (opts.poolUrl) {
      body.branding = { url: opts.poolUrl }
    }
    if (opts.layout) {
      body.layout = opts.layout
    }

    const res = await fetch(`${SWUAPI_URL}/deck-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SWUAPI_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      console.error('[DeckImageAPI] Failed to generate image:', res.status, await res.text())
      return null
    }

    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (err) {
    console.error('[DeckImageAPI] Error generating deck image:', err)
    return null
  }
}

type CatalogMaps = ReturnType<typeof buildCardLookupMaps>

let cachedMaps: CatalogMaps | null = null

function getCatalogMaps(): CatalogMaps {
  if (!cachedMaps) cachedMaps = buildCardLookupMaps(getAllCards())
  return cachedMaps
}

/**
 * Resolve any printing to the collector number swuapi indexes it under —
 * the Normal printing's, in SET_XXX form. Returns null when the card is not
 * in our catalog (an unspoiled placeholder, say), so the caller can fall
 * back to a name lookup instead of sending a number swuapi cannot match.
 */
function normalPrintingId(card: CardInfo): string | null {
  const { cardMap, normalCardMap } = getCatalogMaps()

  // `id` first: collector numbers are not unique. SEC-571 is both Willrow
  // Hood and Bardottan Ornithopter, and a Leader shares its number with the
  // Hyperspace printing of some other card (SOR-007). Only the uuid is exact.
  const catalogCard =
    (card.id && cardMap.get(card.id)) ||
    (card.cardId && (cardMap.get(card.cardId) || cardMap.get(normalizeCardId(card.cardId) || ''))) ||
    null

  if (!catalogCard) return null

  const normal = normalCardMap.get(cardIdentityKey(catalogCard)) || catalogCard
  return normal.cardId ? normalizeCardId(normal.cardId) : null
}

/**
 * Group key for merging copies. All printings of one game piece share a key
 * so they land on a single tile with a quantity, matching the SWUDB export.
 */
function deckCardKey(card: CardInfo): string {
  return normalPrintingId(card) || `${card.name}||${card.subtitle || ''}`
}

/** Build a DeckCard, preferring the Normal collector number, falling back to full name */
function toDeckCard(card: CardInfo, type?: string): DeckCard {
  const id = normalPrintingId(card)
  if (id) {
    return {
      id,
      variant: mapVariant(card.variantType),
      type,
      count: 1,
    }
  }
  // Not in the catalog — fall back to "Name, Subtitle" for name-based lookup
  const name = card.subtitle ? `${card.name}, ${card.subtitle}` : card.name
  return {
    name,
    variant: mapVariant(card.variantType),
    type,
    count: 1,
  }
}

// The treatments swuapi models. Anything else (the prestige tiers, promo
// treatments) has no swuapi variant, so those cards render as standard art
// rather than as an unmatched request.
const SWUAPI_VARIANTS = new Set(['Hyperspace', 'Showcase', 'Standard Foil', 'Hyperspace Foil'])

/** Map swupod variantType to swuapi variant names */
function mapVariant(variantType?: string): string | undefined {
  if (!variantType || variantType === 'Normal') return undefined
  const mapped = variantType === 'Foil' ? 'Standard Foil' : variantType
  return SWUAPI_VARIANTS.has(mapped) ? mapped : undefined
}
