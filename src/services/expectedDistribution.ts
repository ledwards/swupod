// @ts-nocheck
/**
 * Expected Distribution Service
 *
 * Pure functions that derive the per-pack expected distribution of cards by
 * rarity, aspect, and per-card-id from the set configs + card pool. Used by
 * the personal-stats luck endpoint (`/api/stats/me/luck`) as the baseline
 * against which observed user pulls are compared.
 *
 * SCOPE — base belt path only.
 * --------------------------------------------------------------------
 * v1 covers ONLY the rarity and aspect distributions in the base belt
 * path. Belt-managed variants are EXCLUDED:
 *   - Hyperspace (HS) variants (variantType === 'Hyperspace')
 *   - Hyperspace Foil (variantType === 'Hyperspace Foil')
 *   - Showcase (variantType === 'Showcase')
 *   - Foil-slot cards (variantType === 'Foil', and any Prestige variant)
 *   - Standard/Foil/Serialized Prestige
 *
 * Belts that produce these variants (HyperspaceUpgradeBelt,
 * HyperspaceCommonBelt, FoilBelt, HyperfoilBelt, ShowcaseLeaderBelt,
 * CarbonitePrestigeBelt, etc.) are 60-pack-budgeted rather than per-slot
 * independent. A multinomial model over them would produce wrong CIs;
 * those dimensions are deferred to v2. See plan
 * `docs/plans/2026-06-09-001-feat-personal-stats-plan.md` § "Key Technical
 * Decisions" and `.claude/rules/belt-system.md`.
 *
 * Slot accounting per pack (PACK_STRUCTURE in `src/utils/packConstants.ts`):
 *   leaders: 1 (excluded — has its own belt, not part of rarity/aspect Q)
 *   bases: 1   (excluded — has its own belt, not part of rarity/aspect Q)
 *   commons: 9 — base belt slots. For LAW (Set 7+) slot 5 is the dedicated
 *                HS-common slot and is excluded; v1 treats the remaining 8
 *                common slots as base for LAW. For older sets all 9 commons
 *                are base belt (some upgrade to HS but the upgrade noise is
 *                small and bounded — documented inline; v2 may tighten).
 *   uncommons: 3 — base belt slots (UC3 can upgrade to HS R/L / Prestige
 *                  per setConfig.upgradeProbabilities.thirdUCToHyperspaceRL,
 *                  but v1 treats all 3 UCs as base for simplicity. The
 *                  upgrade rate is ~1/3 for LAW and ~1/5 for sets 1-6; the
 *                  bias on the per-pack base UC mean is small relative to
 *                  the per-aspect CI widths we report).
 *   rareOrLegendary: 1 — split by `setConfig.beltRatios.rareToLegendary`
 *                        (LAW: 5 → 5/6 R + 1/6 L; SOR: 7 → 7/8 R + 1/8 L).
 *   foils: 1   (excluded — FoilBelt / HyperfoilBelt, belt-managed)
 *
 * For LAW (and any Set 7+ config with `guaranteedHyperspaceCommon`), the
 * dedicated HS common slot is subtracted from the base common count.
 *
 * Aspect categories (matches the API/UI contract):
 *   Vigilance / Command / Aggression / Cunning — cards with exactly that
 *     single COLOR aspect (Heroism/Villainy alignments do not count as
 *     colors).
 *   Neutral — cards with 0 color aspects.
 *   Multicolor — cards with 2+ color aspects (e.g., LAW's triple-aspect
 *                cards like Cad Bane with Vigilance + Command).
 *
 * Per-card expected: P(specific card in pack) =
 *   (slot count × slot odds for that rarity) × (1 / pool size for that
 *   rarity in this set).
 *
 * The per-card Map is keyed by the card id field used by `card_generations`:
 * we key by the `cardId` field (e.g., "LAW-032") for consistency with how
 * the API will count observed pulls. Cards with non-base variantTypes are
 * NOT in the Map.
 */

import {
  PACK_STRUCTURE,
  SETS_1_3_CONSTANTS,
  SETS_4_6_CONSTANTS,
  SET_7_PLUS_CONSTANTS,
  type PackConstants,
} from '../utils/packConstants'
import { getCardsBySet, type RawCard } from '../utils/cardData'
import { getSetConfig, type SetConfig } from '../utils/setConfigs'

// ============================================================================
// TYPES
// ============================================================================

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary'] as const
export type ExpectedRarity = (typeof RARITIES)[number]

export const ASPECT_CATEGORIES = [
  'Vigilance',
  'Command',
  'Aggression',
  'Cunning',
  'Neutral',
  'Multicolor',
] as const
export type AspectCategory = (typeof ASPECT_CATEGORIES)[number]

/** The four color aspects (alignments Heroism/Villainy do not count). */
export const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning'] as const
export type ColorAspect = (typeof COLOR_ASPECTS)[number]

export type RarityExpected = Record<ExpectedRarity, number>
export type AspectExpected = Record<AspectCategory, number>

export interface ExpectedPerPack {
  setCode: string
  /**
   * Total non-leader, non-base, non-foil-slot, non-HS-common base-belt
   * cards expected per pack. Equals
   *   commonSlots + uncommonSlots + rareOrLegendarySlots.
   * Sum of all rarity values; sum of all aspect values.
   */
  baseCardsPerPack: number
  rarity: RarityExpected
  aspect: AspectExpected
  /**
   * Map of cardId → expected pulls per pack. Excludes belt-managed
   * variants (HS, HSF, Showcase, Foil, Prestige).
   */
  cards: Map<string, number>
}

export interface ExpectedTotal {
  setCode: string
  packsCracked: number
  baseCardsTotal: number
  rarity: RarityExpected
  aspect: AspectExpected
  cards: Map<string, number>
}

// ============================================================================
// CONSTANTS HELPERS
// ============================================================================

/** Return the pack constants block that drives a given set's belts. */
function getConstantsForSet(setConfig: SetConfig): PackConstants {
  const n = setConfig.setNumber
  if (n >= 1 && n <= 3) return SETS_1_3_CONSTANTS
  if (n >= 4 && n <= 6) return SETS_4_6_CONSTANTS
  // Set 7+ (LAW, ASH, ...)
  return SET_7_PLUS_CONSTANTS
}

/**
 * Count of base-belt common slots per pack for a given set.
 *
 * LAW/ASH (Set 7+) have a dedicated HS-common slot (slot 5 per
 * `packConstants.hyperspaceCommonSlot`) that comes from
 * HyperspaceCommonBelt. That slot is belt-managed and excluded from base.
 *
 * Older sets (1-6) have no dedicated HS-common slot; all 9 commons come
 * from CommonBelt. Some commons upgrade to HS at a belt-budgeted rate
 * (~12/60 packs in sets 1-3 and 4-6 — see `HS_BELT_CONFIGS`). v1 treats
 * those as base for simplicity; the bias on per-pack expected is small and
 * documented in the file header.
 */
function getBaseCommonSlots(setConfig: SetConfig): number {
  const total = PACK_STRUCTURE.commons // 9
  if (setConfig.packRules?.guaranteedHyperspaceCommon === true) {
    return total - 1
  }
  return total
}

/** Number of base-belt uncommon slots per pack. v1 treats all 3 UCs as base. */
function getBaseUncommonSlots(): number {
  return PACK_STRUCTURE.uncommons // 3
}

/** Always 1 R/L slot per pack. The R/L split is handled separately. */
function getBaseRareOrLegendarySlots(): number {
  return PACK_STRUCTURE.rareOrLegendary // 1
}

/**
 * Split a single R/L slot into per-pack expected (rare, legendary) counts
 * using setConfig.beltRatios.rareToLegendary (LAW: 5 → 5R + 1L per 6 packs).
 */
function getRareLegendarySplit(setConfig: SetConfig): { rare: number, legendary: number } {
  const ratio = setConfig.beltRatios.rareToLegendary
  const slot = getBaseRareOrLegendarySlots()
  const denom = ratio + 1
  return {
    rare: slot * (ratio / denom),
    legendary: slot * (1 / denom),
  }
}

// ============================================================================
// CARD POOL FILTERING
// ============================================================================

/**
 * Return only base-belt cards for a set: variantType === 'Normal', no
 * leaders or bases, and Common/Uncommon/Rare/Legendary rarity (Special is
 * foil-slot / HSF only, belt-managed).
 *
 * This is the same pool the per-card expected Map is built from.
 */
function getBaseBeltCards(setCode: string): RawCard[] {
  const cards = getCardsBySet(setCode)
  return cards.filter((card) => {
    // Belt-managed variants are excluded
    if (card.variantType !== 'Normal') return false
    // Prestige flags also indicate belt-managed (foil/serialized/standard)
    if (card.isPrestige === true) return false
    if (card.isShowcase === true) return false
    if (card.isHyperspace === true) return false
    if (card.isFoil === true) return false
    // Leaders/Bases are not part of rarity/aspect dimensions
    if (card.isLeader === true || card.type === 'Leader') return false
    if (card.isBase === true || card.type === 'Base') return false
    // Specials are foil-slot / HSF only; not in the base belt path
    return (
      card.rarity === 'Common' ||
      card.rarity === 'Uncommon' ||
      card.rarity === 'Rare' ||
      card.rarity === 'Legendary'
    )
  })
}

/** Classify a card into one of the 6 aspect categories. */
export function classifyAspect(card: RawCard): AspectCategory {
  const aspects = Array.isArray(card.aspects) ? card.aspects : []
  const colors = aspects.filter((a) =>
    (COLOR_ASPECTS as readonly string[]).includes(a)
  )
  if (colors.length === 0) return 'Neutral'
  if (colors.length >= 2) return 'Multicolor'
  // Exactly one color
  return colors[0] as AspectCategory
}

/**
 * Aspect mix for a bucket of cards: aspectMix[A] = (# cards in bucket
 * classified as A) / |bucket|. Sums to 1 across the 6 categories.
 *
 * Returns all zeros if the bucket is empty.
 */
function aspectMixForBucket(bucket: RawCard[]): AspectExpected {
  const mix: AspectExpected = {
    Vigilance: 0,
    Command: 0,
    Aggression: 0,
    Cunning: 0,
    Neutral: 0,
    Multicolor: 0,
  }
  if (bucket.length === 0) return mix
  for (const card of bucket) {
    const cat = classifyAspect(card)
    mix[cat] += 1
  }
  for (const cat of ASPECT_CATEGORIES) {
    mix[cat] = mix[cat] / bucket.length
  }
  return mix
}

// ============================================================================
// PURE COMPUTATIONS
// ============================================================================

/**
 * Compute per-pack expected rarity counts using slot counts and the R/L
 * split. Excludes belt-managed slots/cards.
 */
function computeRarityExpected(setConfig: SetConfig): RarityExpected {
  const split = getRareLegendarySplit(setConfig)
  return {
    Common: getBaseCommonSlots(setConfig),
    Uncommon: getBaseUncommonSlots(),
    Rare: split.rare,
    Legendary: split.legendary,
  }
}

/**
 * Compute per-pack expected aspect counts by weighting each rarity
 * bucket's aspect mix by the slot count × split.
 *
 * If a rarity bucket has zero base-belt cards (unlikely in production, but
 * possible for placeholder-only sets), it contributes zero to all
 * aspects rather than blowing up.
 */
function computeAspectExpected(
  setConfig: SetConfig,
  baseBeltCards: RawCard[]
): AspectExpected {
  const rarityExpected = computeRarityExpected(setConfig)
  const mixByRarity: Record<ExpectedRarity, AspectExpected> = {
    Common: aspectMixForBucket(
      baseBeltCards.filter((c) => c.rarity === 'Common')
    ),
    Uncommon: aspectMixForBucket(
      baseBeltCards.filter((c) => c.rarity === 'Uncommon')
    ),
    Rare: aspectMixForBucket(baseBeltCards.filter((c) => c.rarity === 'Rare')),
    Legendary: aspectMixForBucket(
      baseBeltCards.filter((c) => c.rarity === 'Legendary')
    ),
  }
  const out: AspectExpected = {
    Vigilance: 0,
    Command: 0,
    Aggression: 0,
    Cunning: 0,
    Neutral: 0,
    Multicolor: 0,
  }
  for (const rarity of RARITIES) {
    const slotCount = rarityExpected[rarity]
    const mix = mixByRarity[rarity]
    for (const cat of ASPECT_CATEGORIES) {
      out[cat] += slotCount * mix[cat]
    }
  }
  return out
}

/**
 * Compute per-card expected pulls per pack. For each base-belt card C:
 *   P(C in pack) = (rarity slot count × slot share for C's rarity) ×
 *                  (1 / pool size for C's rarity).
 *
 * For Common/Uncommon, the slot share is 1 (the slot is always that
 * rarity). For Rare and Legendary the slot is split by
 * beltRatios.rareToLegendary.
 *
 * Pool size: # of base-belt cards of the same rarity in this set.
 */
function computePerCardExpected(
  setConfig: SetConfig,
  baseBeltCards: RawCard[]
): Map<string, number> {
  const rarityExpected = computeRarityExpected(setConfig)
  // Pool sizes derived from the actual base-belt slice. Test scenarios
  // verify these match setConfig.cardCounts (which is the spec source).
  const poolSizes: Record<ExpectedRarity, number> = {
    Common: baseBeltCards.filter((c) => c.rarity === 'Common').length,
    Uncommon: baseBeltCards.filter((c) => c.rarity === 'Uncommon').length,
    Rare: baseBeltCards.filter((c) => c.rarity === 'Rare').length,
    Legendary: baseBeltCards.filter((c) => c.rarity === 'Legendary').length,
  }
  const map = new Map<string, number>()
  for (const card of baseBeltCards) {
    const rarity = card.rarity as ExpectedRarity
    if (!(RARITIES as readonly string[]).includes(rarity)) continue
    const poolSize = poolSizes[rarity]
    if (poolSize <= 0) continue
    const expected = rarityExpected[rarity] / poolSize
    // Key by `cardId` (e.g., "LAW-032") for consistency with the API
    // counts of observed pulls, falling back to `id` for safety.
    const key = card.cardId || card.id
    if (!key) continue
    map.set(key, expected)
  }
  return map
}

// ============================================================================
// PUBLIC API + MODULE-SCOPE CACHE
// ============================================================================

const cache = new Map<string, ExpectedPerPack>()

/**
 * Reset the per-set cache. Useful for tests and for the
 * card-catalog-resolver-style reset pattern; not normally called at
 * runtime because cards.json and setConfigs are frozen at build time.
 */
export function resetExpectedDistributionCache(): void {
  cache.clear()
}

/**
 * Get the per-pack expected distribution for a set.
 *
 * Returns `null` for unknown setCodes (no throw — callers should treat
 * this as "no data" and skip the luck panels, consistent with the
 * existing setConfig accessor pattern in
 * `src/utils/setConfigs/index.ts:getSetConfig`).
 */
export function getExpectedPerPack(setCode: string): ExpectedPerPack | null {
  if (!setCode) return null
  const cached = cache.get(setCode)
  if (cached) return cached

  const setConfig = getSetConfig(setCode)
  if (!setConfig) return null

  const baseBeltCards = getBaseBeltCards(setCode)
  const rarity = computeRarityExpected(setConfig)
  const aspect = computeAspectExpected(setConfig, baseBeltCards)
  const cards = computePerCardExpected(setConfig, baseBeltCards)
  const baseCardsPerPack =
    rarity.Common + rarity.Uncommon + rarity.Rare + rarity.Legendary

  const result: ExpectedPerPack = {
    setCode,
    baseCardsPerPack,
    rarity,
    aspect,
    cards,
  }
  cache.set(setCode, result)
  return result
}

/**
 * Scale per-pack expectations by the number of packs cracked.
 *
 * `packsCracked = 0` returns all zeros (no draws to expect).
 * Negative `packsCracked` is treated as 0 (defensive — should never happen
 * but a luck endpoint should not crash on a malformed query).
 */
export function scaleExpected(
  perPack: ExpectedPerPack,
  packsCracked: number
): ExpectedTotal {
  const safePacks = Number.isFinite(packsCracked) && packsCracked > 0 ? packsCracked : 0
  const rarity: RarityExpected = {
    Common: perPack.rarity.Common * safePacks,
    Uncommon: perPack.rarity.Uncommon * safePacks,
    Rare: perPack.rarity.Rare * safePacks,
    Legendary: perPack.rarity.Legendary * safePacks,
  }
  const aspect: AspectExpected = {
    Vigilance: perPack.aspect.Vigilance * safePacks,
    Command: perPack.aspect.Command * safePacks,
    Aggression: perPack.aspect.Aggression * safePacks,
    Cunning: perPack.aspect.Cunning * safePacks,
    Neutral: perPack.aspect.Neutral * safePacks,
    Multicolor: perPack.aspect.Multicolor * safePacks,
  }
  const cards = new Map<string, number>()
  for (const [cardId, perPackRate] of perPack.cards) {
    cards.set(cardId, perPackRate * safePacks)
  }
  return {
    setCode: perPack.setCode,
    packsCracked: safePacks,
    baseCardsTotal:
      rarity.Common + rarity.Uncommon + rarity.Rare + rarity.Legendary,
    rarity,
    aspect,
    cards,
  }
}
