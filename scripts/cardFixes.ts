// @ts-nocheck
/**
 * Card Data Fixes
 *
 * This file contains corrections to apply to card data after fetching from the API.
 * Each fix is declarative and documented with a reason.
 *
 * Fixes are applied by scripts/postProcessCards.ts
 */

// Stopgap catalog of GC 2026 promo cards (re-injected below). See the file's __meta for why.
import gc2026PromoCatalog from '../src/data/promoPacks/gc2026-cards.json' with { type: 'json' }

interface Card {
  id: string
  name: string
  type: string
  variantType?: string
  isFoil?: boolean
  isHyperspace?: boolean
  isShowcase?: boolean
  isLeader?: boolean
  isBase?: boolean
  [key: string]: any
}

interface IndividualFix {
  id: string
  field: string
  value: any
  reason: string
}

interface BatchFix {
  condition: (card: Card) => boolean
  field: string
  value: any
  reason: string
}

interface CustomTransform {
  name: string
  transform: (cards: Card[] | Card) => Card[] | Card
  isArrayTransform?: boolean
}

export const cardFixes: IndividualFix[] = [
  // Example fixes (add your actual fixes here):

  // Missing isHyperspace flag on Hyperspace variant cards
  // {
  //   id: 'SOR-324',
  //   field: 'isHyperspace',
  //   value: true,
  //   reason: 'Hyperspace variant missing isHyperspace flag'
  // },

  // Missing isFoil flag on Foil variant cards
  // {
  //   id: 'LOF-488',
  //   field: 'isFoil',
  //   value: true,
  //   reason: 'Foil variant missing isFoil flag'
  // },

  // Missing isShowcase flag on Showcase variant cards
  // {
  //   id: 'SOR-265',
  //   field: 'isShowcase',
  //   value: true,
  //   reason: 'Showcase variant missing isShowcase flag'
  // },
]

/**
 * Batch fixes for common patterns
 * Apply the same fix to multiple cards matching a condition
 */
export const batchFixes: BatchFix[] = [
  // Example: Set isHyperspace=true for all Hyperspace variants
  {
    condition: (card: Card) => card.variantType === 'Hyperspace' && !card.isHyperspace,
    field: 'isHyperspace',
    value: true,
    reason: 'Auto-fix: Hyperspace variant missing isHyperspace flag'
  },

  // Example: Set isHyperspace=true for all Hyperspace Foil variants
  {
    condition: (card: Card) => card.variantType === 'Hyperspace Foil' && !card.isHyperspace,
    field: 'isHyperspace',
    value: true,
    reason: 'Auto-fix: Hyperspace Foil variant missing isHyperspace flag'
  },

  // Example: Set isFoil=true for all Foil variants
  {
    condition: (card: Card) => card.variantType === 'Foil' && !card.isFoil,
    field: 'isFoil',
    value: true,
    reason: 'Auto-fix: Foil variant missing isFoil flag'
  },

  // Example: Set isFoil=true for all Hyperspace Foil variants
  {
    condition: (card: Card) => card.variantType === 'Hyperspace Foil' && !card.isFoil,
    field: 'isFoil',
    value: true,
    reason: 'Auto-fix: Hyperspace Foil variant missing isFoil flag'
  },

  // Example: Set isShowcase=true for all Showcase variants
  {
    condition: (card: Card) => card.variantType === 'Showcase' && !card.isShowcase,
    field: 'isShowcase',
    value: true,
    reason: 'Auto-fix: Showcase variant missing isShowcase flag'
  },

  // Set isPrestige=true for all Prestige variants
  {
    condition: (card: Card) => (card.variantType === 'Standard Prestige' || card.variantType === 'Foil Prestige' || card.variantType === 'Serialized Prestige') && !card.isPrestige,
    field: 'isPrestige',
    value: true,
    reason: 'Auto-fix: Prestige variant missing isPrestige flag'
  },

  // Set isFoil=true for Foil Prestige variants
  {
    condition: (card: Card) => card.variantType === 'Foil Prestige' && !card.isFoil,
    field: 'isFoil',
    value: true,
    reason: 'Auto-fix: Foil Prestige variant missing isFoil flag'
  },

  // Set isFoil=true for Serialized Prestige variants
  {
    condition: (card: Card) => card.variantType === 'Serialized Prestige' && !card.isFoil,
    field: 'isFoil',
    value: true,
    reason: 'Auto-fix: Serialized Prestige variant missing isFoil flag'
  },
]

/**
 * Custom transformation functions for complex fixes
 * These run after individual and batch fixes
 */
export const customTransforms: CustomTransform[] = [
  // Inject GC 2026 promo cards (Silver/Black Event Pack contents). Runs FIRST — before the
  // whitelist — so it can read the full raw card data and fall over to a real GC printing the
  // moment swuapi has one.
  //
  // swuapi doesn't carry the GC 2026 printings yet, so each catalog entry (src/data/promoPacks/
  // gc2026-cards.json) is surfaced as a distinct 'GC 2026 Promo' variant cloned from its STANDARD
  // printing, with stand-in art. Art resolution prefers, in order:
  //   1. a real GC printing (a same-cardId sibling whose art carries the `_OP_` GC marker),
  //   2. the catalog placeholderImage,
  //   3. the base card's standard art.
  // (1) makes the swap AUTOMATIC: when swuapi scrapes the GC art, the next data refresh uses it —
  //     no code change. (No `_OP_` siblings exist for these cardIds today, so no false positives.)
  //
  // What (2) actually is today differs by pool, and that's the point of the stand-in:
  //   Silver — the REAL GC promo art (medallion + P26-EN set code), captured from the FFG
  //            reveal stream and vendored to public/promo-cards/gc2026/.
  //   Black  — no GC-treated art has been shown, so it falls back to the base printing.
  //
  // Keyed by unique synthetic `id` (shares the base cardId/number — id is the only unique key).
  // Re-runnable: previously injected cards are dropped and rebuilt from the catalog each pass, so
  // catalog art/pool edits propagate instead of being pinned by whatever landed in cards.json
  // first. 'GC 2026 Promo' is whitelisted below so injected cards survive the filter; that admits
  // only this synthetic type — it does NOT reintroduce the old promo variants (Weekly Play / PQ /
  // SS) the filter guards against.
  {
    name: 'Inject GC 2026 promo cards',
    transform: (cards: Card[]): Card[] => {
      const catalog = (gc2026PromoCatalog as { cards?: any[] }).cards || []
      // Drop any previously injected promo cards and rebuild from the catalog, so an art or
      // pool change in the catalog actually propagates. (Skipping ids already present would
      // leave stale art baked into cards.json forever.)
      cards = cards.filter(c => !(c as any).gcPromo)
      const sourceById = new Map(cards.map(c => [c.id, c]))
      // Real GC art, when swuapi has it: a same-cardId sibling printing whose art carries `_OP_`.
      const realArtByCardId = new Map<string, string>()
      for (const c of cards) {
        if (/_OP_/i.test(c.imageUrl || '') && c.cardId) realArtByCardId.set(c.cardId, c.imageUrl)
      }

      const injected: Card[] = []
      for (const entry of catalog) {
        const source = sourceById.get(entry.sourceCardId)
        if (!source) continue                         // underlying card missing — skip
        const realArt = realArtByCardId.get(source.cardId)
        injected.push({
          ...source,
          id: entry.id,                               // unique synthetic id (shares cardId with source)
          variantType: 'GC 2026 Promo',
          isFoil: false,
          isHyperspace: false,
          isShowcase: false,
          isPrestige: false,
          imageUrl: realArt || entry.placeholderImage || source.imageUrl,
          gcPromo: {
            campaign: 'gc2026',
            pool: entry.pool,                         // 'silver' | 'black'
            // true while the art is our stand-in rather than swuapi's official record.
            // Silver stands in with the real GC promo art captured from the FFG stream;
            // Black has no GC-treated art yet, so it stands in with the base printing.
            placeholder: !realArt,
          },
        })
      }
      return injected.length ? [...cards, ...injected] : cards
    },
    isArrayTransform: true
  },

  // Filter to only keep variants we need for sealed/draft
  // Exclude promo variants (PQ, SS, Prerelease, Weekly Play) which share IDs with Normal cards
  // but have different content, causing lookup bugs. ('GC 2026 Promo' is our own synthetic variant,
  // injected just above, and is intentionally allowed through.)
  {
    name: 'Keep only draft-relevant variants',
    transform: (cards: Card[]): Card[] => {
      const allowedVariants = new Set([
        'Normal',
        'Hyperspace',
        'Foil',
        'Hyperspace Foil',
        'Showcase',
        'Standard Prestige',
        'Foil Prestige',
        'Serialized Prestige',
        'GC 2026 Promo',
      ])
      return cards.filter(card => {
        const vt = card.variantType || ''
        return allowedVariants.has(vt)
      })
    },
    isArrayTransform: true
  },

  // Filter out Token types - we don't need these in the deck builder
  {
    name: 'Remove Token cards',
    transform: (cards: Card[]): Card[] => {
      return cards.filter(card => {
        const type = card.type || ''
        // Filter out Token Unit, Token Upgrade, and Force Token
        if (type.includes('Token')) return false
        return true
      })
    },
    isArrayTransform: true
  },

  // Ensure all boolean fields are explicitly true or false, never undefined
  {
    name: 'Ensure boolean flags are explicit',
    transform: (card: Card): Card => {
      // Ensure isFoil is explicitly true or false
      if (card.isFoil === undefined || card.isFoil === null) {
        card.isFoil = false
      }

      // Ensure isHyperspace is explicitly true or false
      if (card.isHyperspace === undefined || card.isHyperspace === null) {
        card.isHyperspace = false
      }

      // Ensure isShowcase is explicitly true or false
      if (card.isShowcase === undefined || card.isShowcase === null) {
        card.isShowcase = false
      }

      // Ensure isPrestige is explicitly true or false
      if (card.isPrestige === undefined || card.isPrestige === null) {
        card.isPrestige = false
      }

      // Ensure isLeader is explicitly true or false
      if (card.isLeader === undefined || card.isLeader === null) {
        card.isLeader = card.type === 'Leader'
      }

      // Ensure isBase is explicitly true or false
      if (card.isBase === undefined || card.isBase === null) {
        card.isBase = card.type === 'Base'
      }

      return card
    }
  },
]
