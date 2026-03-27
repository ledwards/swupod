/**
 * Generate deck images via the swuapi.com deck-image API.
 * Replaces the old Playwright-based deckScreenshot approach.
 */

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
  cardId?: string | undefined
  variantType?: string | undefined
}

interface DeckImageOptions {
  leader: CardInfo
  base: CardInfo
  deckCards: CardInfo[]
  sideboardCards?: CardInfo[] | undefined
  title?: string | undefined
  subtitle?: string | undefined
  poolUrl?: string | undefined
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

    // Deck cards (group by cardId or name+subtitle+variant to get counts)
    const deckCounts = new Map<string, DeckCard>()
    for (const card of opts.deckCards) {
      const key = card.cardId || `${card.name}||${card.subtitle || ''}||${card.variantType || 'Normal'}`
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
        const key = card.cardId || `${card.name}||${card.subtitle || ''}||${card.variantType || 'Normal'}`
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

/** Build a DeckCard, preferring cardId for exact lookup, falling back to full name */
function toDeckCard(card: CardInfo, type?: string): DeckCard {
  // If we have a cardId (e.g. "LAW-104"), convert to swuapi format ("LAW_104") for exact lookup
  if (card.cardId) {
    return {
      id: card.cardId.replace('-', '_'),
      variant: mapVariant(card.variantType),
      type,
      count: 1,
    }
  }
  // Fall back to "Name, Subtitle" for name-based lookup
  const name = card.subtitle ? `${card.name}, ${card.subtitle}` : card.name
  return {
    name,
    variant: mapVariant(card.variantType),
    type,
    count: 1,
  }
}

/** Map swupod variantType to swuapi variant names */
function mapVariant(variantType?: string): string | undefined {
  if (!variantType || variantType === 'Normal') return undefined
  // swuapi expects: "Hyperspace", "Showcase", "Standard Foil", "Hyperspace Foil"
  if (variantType === 'Foil') return 'Standard Foil'
  return variantType
}
