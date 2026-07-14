/**
 * GC 2026 promo-pack campaign catalog (plan U2).
 *
 * Pure data: the claim window, pack size, and which GC 2026 promo cards fall in the Silver vs
 * Black pool. The pools are derived from the SINGLE SOURCE OF TRUTH — the U1 card catalog
 * (src/data/promoPacks/gc2026-cards.json), where each entry carries its `pool` and the synthetic
 * `gc2026-*` id injected into card data. These are the authoritative GC 2026 Event Pack contents
 * (Silver Pack alt-arts + Black Pack cards), sourced from the wayfinder gc2026-schedule.ts.
 */

import gc2026Catalog from '../data/promoPacks/gc2026-cards.json' with { type: 'json' }

export type PromoTier = 'silver' | 'black'

export interface PromoCampaign {
  /** Stable campaign key (also the `campaign` column value in promo_entitlements). */
  readonly id: string
  readonly name: string
  /** Inclusive claim window, expressed as America/Los_Angeles calendar dates (YYYY-MM-DD). */
  readonly claimWindow: { readonly startLA: string; readonly endLA: string; readonly timeZone: string }
  /** Cards drawn per pack open. */
  readonly packSize: number
  /** Card-id pools per tier (synthetic `gc2026-*` ids), derived from the card catalog's `pool`. */
  readonly pools: Readonly<Record<PromoTier, readonly string[]>>
}

const CATALOG_CARDS = (gc2026Catalog as { cards: { id: string; pool: PromoTier }[] }).cards
const idsForPool = (pool: PromoTier): readonly string[] =>
  CATALOG_CARDS.filter(c => c.pool === pool).map(c => c.id)

export const GC2026_CAMPAIGN: PromoCampaign = {
  id: 'gc2026',
  name: 'Galactic Championship 2026',
  claimWindow: { startLA: '2026-07-24', endLA: '2026-07-26', timeZone: 'America/Los_Angeles' },
  packSize: 2,
  pools: {
    silver: idsForPool('silver'),
    black: idsForPool('black'),
  },
}

export const PROMO_CAMPAIGNS: Readonly<Record<string, PromoCampaign>> = {
  gc2026: GC2026_CAMPAIGN,
}
