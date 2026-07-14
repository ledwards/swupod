/**
 * GC 2026 promo-pack service (plan U2).
 *
 * Pure logic only — no React, no I/O, no card-cache import. Callers inject:
 *  - `resolveCard(id)` to turn a catalog card-id into a full card object (from the card cache), and
 *  - `now` / env-derived override flags for the claim-window check.
 *
 * See src/services/promoPacks.catalog.ts for the campaign data.
 */

import { PROMO_CAMPAIGNS, type PromoCampaign, type PromoTier } from './promoPacks.catalog'

/** A pack is always a `{ cards }` object (architecture rule). Card shape is caller-defined. */
export interface EventPack<TCard = unknown> {
  readonly cards: TCard[]
}

/** Look up a campaign by id (e.g. 'gc2026'); null when unknown. */
export function getCampaign(id: string): PromoCampaign | null {
  return PROMO_CAMPAIGNS[id] ?? null
}

/** True when `now` falls within the campaign's inclusive claim window, in its own time zone. */
export function isClaimWindowOpen(campaign: PromoCampaign, now: Date): boolean {
  const today = localCalendarDate(now, campaign.claimWindow.timeZone)
  return today >= campaign.claimWindow.startLA && today <= campaign.claimWindow.endLA
}

/**
 * Whether a new claim is allowed. Pure: the caller decides the override value.
 * U4 passes `overrideOpen = NODE_ENV !== 'production' && PROMO_CLAIM_WINDOW_OVERRIDE === '1'`
 * so local/e2e can claim before GC weekend; production always passes `false`.
 */
export function isClaimAllowed(
  campaign: PromoCampaign,
  now: Date,
  opts: { overrideOpen?: boolean } = {},
): boolean {
  return opts.overrideOpen === true || isClaimWindowOpen(campaign, now)
}

/**
 * Draw a pack for a tier: `packSize` distinct cards sampled from the tier pool.
 * `resolveCard` maps a catalog card-id to a full card (unresolvable ids are dropped).
 * `rng` is injectable for deterministic tests; defaults to Math.random.
 */
export function drawEventPack<TCard>(
  campaign: PromoCampaign,
  tier: PromoTier,
  resolveCard: (cardId: string) => TCard | null | undefined,
  rng: () => number = Math.random,
): EventPack<TCard> {
  const pool = campaign.pools[tier] ?? []
  const pickedIds = sampleDistinct(pool, campaign.packSize, rng)
  const cards = pickedIds
    .map(resolveCard)
    .filter((c): c is TCard => c != null)
  return { cards }
}

/** Calendar date (YYYY-MM-DD) of `date` in the given IANA time zone — DST-correct via Intl. */
function localCalendarDate(date: Date, timeZone: string): string {
  // en-CA yields ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Sample up to `count` distinct items uniformly (partial Fisher–Yates); returns all if pool is smaller. */
function sampleDistinct<T>(pool: readonly T[], count: number, rng: () => number): T[] {
  const arr = pool.slice()
  const n = Math.min(count, arr.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (arr.length - i))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}
