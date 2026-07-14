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
  // Filter to only keep variants we need for sealed/draft
  // Exclude promo variants (PQ, SS, Prerelease, Weekly Play) which share IDs with Normal cards
  // but have different content, causing lookup bugs
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

  // Re-inject GC 2026 promo cards (stopgap). The official GC alt-art / showcase promo
  // printings are not in swuapi/strapi yet, so each catalog entry surfaces a promo as a
  // distinct 'GC 2026 Promo' variant cloned from its STANDARD printing (a clean stand-in,
  // per migration 050's "same game piece, different printing" philosophy).
  //
  // MUST run after 'Keep only draft-relevant variants' (the whitelist) — 'GC 2026 Promo' is
  // deliberately NOT in allowedVariants, so injecting earlier would just be filtered out.
  // Keyed by unique synthetic uuid `id` only (never by widening the variant-type whitelist),
  // so migration 050's cardId-collision guard for the OTHER promo variants stays intact.
  // Idempotent: the built cards.json already contains these, and the runtime re-applies
  // transforms — so we skip any id already present.
  {
    name: 'Inject GC 2026 promo cards (stopgap)',
    transform: (cards: Card[]): Card[] => {
      const catalog = (gc2026PromoCatalog as { cards?: any[] }).cards || []
      const present = new Set(cards.map(c => c.id))
      const sourceById = new Map(cards.map(c => [c.id, c]))
      const injected: Card[] = []

      for (const entry of catalog) {
        if (present.has(entry.id)) continue          // already injected — idempotent
        const source = sourceById.get(entry.sourceCardId)
        if (!source) continue                         // underlying card missing — skip (logged in report)
        injected.push({
          ...source,
          id: entry.id,                               // unique synthetic id; shares cardId/number with source (documented stopgap)
          variantType: 'GC 2026 Promo',
          isFoil: false,
          isHyperspace: false,
          isShowcase: false,
          isPrestige: false,
          imageUrl: entry.imageUrl || source.imageUrl,
          gcPromo: { campaign: 'gc2026', category: entry.category, obtain: entry.obtain },
        })
      }

      return injected.length ? [...cards, ...injected] : cards
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
