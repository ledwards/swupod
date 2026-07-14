/**
 * GC 2026 promo-pack campaign catalog (plan U2).
 *
 * Pure data: the claim window, pack size, and which GC 2026 promo cards fall in the
 * Silver vs Black pool. Card ids reference the synthetic `gc2026-*` ids injected into
 * card data by U1 (see src/data/promoPacks/gc2026-cards.json + scripts/cardFixes.ts).
 *
 * ⚠️ POOL SPLIT IS A PLACEHOLDER TO CONFIRM. The wayfinder GC prize catalog groups cards by
 * how you *earn* them (placement / attendee / prize-wall / showcase), not by which physical
 * Event Pack they land in — that mapping isn't published. The Silver vs Black assignment below
 * is a defensible default (Black = premium event-exclusive / placement / showcase; Silver =
 * broad alt-art: prize-wall variants, alt-art bases, participation promos). Swap the ids freely
 * once the real pack contents are decided — the service logic doesn't change.
 */

export type PromoTier = 'silver' | 'black'

export interface PromoCampaign {
  /** Stable campaign key (also the `campaign` column value in promo_entitlements). */
  readonly id: string
  readonly name: string
  /** Inclusive claim window, expressed as America/Los_Angeles calendar dates (YYYY-MM-DD). */
  readonly claimWindow: { readonly startLA: string; readonly endLA: string; readonly timeZone: string }
  /** Cards drawn per pack open. */
  readonly packSize: number
  /** Card-id pools per tier (synthetic `gc2026-*` ids from U1). */
  readonly pools: Readonly<Record<PromoTier, readonly string[]>>
}

export const GC2026_CAMPAIGN: PromoCampaign = {
  id: 'gc2026',
  name: 'Galactic Championship 2026',
  claimWindow: { startLA: '2026-07-24', endLA: '2026-07-26', timeZone: 'America/Los_Angeles' },
  packSize: 2,
  pools: {
    // Black = premium: event-exclusive attendee promos, top placement promos, showcase leaders.
    black: [
      'gc2026-att-vader',      // Darth Vader — Meet Your Destiny (Event Exclusive)
      'gc2026-att-quigon',     // Qui-Gon Jinn — Influencing Chance
      'gc2026-promo-luke',     // Luke Skywalker — Day 1
      'gc2026-promo-chimaera', // Chimaera — Day 2
      'gc2026-promo-ben-solo', // Ben Solo — Top 4
      'gc2026-promo-poe',      // Poe Dameron — Finalist
      'gc2026-promo-rey',      // Rey — Champion
      'gc2026-sc-sor-luke',    // Showcase Leader — Luke (SOR)
      'gc2026-sc-sor-vader',   // Showcase Leader — Vader (SOR)
    ],
    // Silver = broad alt-art: prize-wall variants, alt-art bases, participation promos.
    silver: [
      'gc2026-pw-superlaser',  // Superlaser Blast
      'gc2026-pw-razorcrest',  // Razor Crest
      'gc2026-pw-krennic',     // Director Krennic
      'gc2026-pw-chewbacca',   // Chewbacca
      'gc2026-base-daimyo',    // Daimyo's Palace (alt-art base)
      'gc2026-base-icc',       // Imperial Command Complex
      'gc2026-base-stygeon',   // Stygeon Spire
      'gc2026-base-canto',     // Canto Bight
      'gc2026-promo-sri',      // Single Reactor Ignition — LCQ participation
      'gc2026-promo-finn',     // Finn — Top 8
      'gc2026-att-huyang',     // Huyang — Early Badge Pickup
      'gc2026-att-maxrebo',    // The Max Rebo Band — Earlybird
    ],
  },
}

export const PROMO_CAMPAIGNS: Readonly<Record<string, PromoCampaign>> = {
  gc2026: GC2026_CAMPAIGN,
}
