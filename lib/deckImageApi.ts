/**
 * Generate deck images via the swuapi.com deck-image API.
 * Replaces the old Playwright-based deckScreenshot approach.
 */

const SWUAPI_URL = process.env['SWUAPI_URL'] || 'https://api.swuapi.com'

interface DeckCard {
  name: string
  variant?: string | undefined
  type?: string | undefined
  count?: number | undefined
  sideboard?: boolean | undefined
}

interface DeckImageOptions {
  leader: { name: string; variantType?: string | undefined }
  base: { name: string; variantType?: string | undefined }
  deckCards: Array<{ name: string; variantType?: string | undefined }>
  sideboardCards?: Array<{ name: string; variantType?: string | undefined }> | undefined
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
    cards.push({
      name: opts.leader.name,
      variant: mapVariant(opts.leader.variantType),
      type: 'Leader',
      count: 1,
    })

    // Base
    cards.push({
      name: opts.base.name,
      variant: mapVariant(opts.base.variantType),
      type: 'Base',
      count: 1,
    })

    // Deck cards (group by name+variant to get counts)
    const deckCounts = new Map<string, DeckCard>()
    for (const card of opts.deckCards) {
      const key = `${card.name}||${card.variantType || 'Normal'}`
      const existing = deckCounts.get(key)
      if (existing) {
        existing.count = (existing.count || 1) + 1
      } else {
        deckCounts.set(key, {
          name: card.name,
          variant: mapVariant(card.variantType),
          count: 1,
        })
      }
    }
    cards.push(...deckCounts.values())

    // Sideboard cards
    if (opts.sideboardCards && opts.sideboardCards.length > 0) {
      const sbCounts = new Map<string, DeckCard>()
      for (const card of opts.sideboardCards) {
        const key = `${card.name}||${card.variantType || 'Normal'}`
        const existing = sbCounts.get(key)
        if (existing) {
          existing.count = (existing.count || 1) + 1
        } else {
          sbCounts.set(key, {
            name: card.name,
            variant: mapVariant(card.variantType),
            count: 1,
            sideboard: true,
          })
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
      headers: { 'Content-Type': 'application/json' },
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

/** Map swupod variantType to swuapi variant names */
function mapVariant(variantType?: string): string | undefined {
  if (!variantType || variantType === 'Normal') return undefined
  // swuapi expects: "Hyperspace", "Showcase", "Standard Foil", "Hyperspace Foil"
  if (variantType === 'Foil') return 'Standard Foil'
  return variantType
}
