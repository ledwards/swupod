// @ts-nocheck
/**
 * Set Configuration Index
 *
 * Central registry for all set configurations
 */

import { SOR_CONFIG } from './SOR'
import { SHD_CONFIG } from './SHD'
import { TWI_CONFIG } from './TWI'
import { JTL_CONFIG } from './JTL'
import { LOF_CONFIG } from './LOF'
import { SEC_CONFIG } from './SEC'
import { LAW_CONFIG } from './LAW'
import { ASH_CONFIG } from './ASH'
import { HMW_CONFIG } from './HMW'
import type { SetCode } from '../../types'

export interface LeaderBaseCounts {
  common: number
  rare: number
  total: number
}

export interface CardCounts {
  leaders: LeaderBaseCounts
  bases: LeaderBaseCounts
  commons: number
  uncommons: number
  rares: number
  legendaries: number
  specials: number
}

export interface PackRules {
  rareBasesInRareSlot: boolean
  specialInFoilSlot: boolean
  specialInHyperspaceSlots: boolean
  specialShowcaseLeaders: boolean
  baseLineAspectConflict: boolean
  uncommonAspectInterleave: boolean
  lineStackingCollation: boolean
  carboniteTiered: boolean
  foilSlotIsHyperspaceFoil?: boolean
  guaranteedHyperspaceCommon?: boolean
  hyperspaceCommonSlot?: number
  prestigeInStandardPacks?: boolean
}

export interface RarityWeights {
  Common?: number
  Uncommon?: number
  Rare?: number
  Legendary?: number
  Special?: number
}

export interface SetRarityWeights {
  foilSlot?: RarityWeights | null
  foilBeltTarget: RarityWeights
  hyperfoil?: RarityWeights
  hyperspaceFoilSlot?: RarityWeights
  // Explicit per-card copy counts for the foil sheet stack (real 11×11 sheets).
  // When set, HyperfoilBelt uses these directly (equal frequency, exact ratio,
  // no weight/rounding). Values are copies PER CARD of that rarity.
  hyperspaceFoilSheetCopies?: RarityWeights
  ucSlot3Upgraded: RarityWeights
  hyperspaceNonFoil: RarityWeights
}

export interface BeltRatios {
  rareToLegendary: number
  hyperspaceRareToLegendary: number
}

export interface DedupWindows {
  rareLegendary: number
  leaderCap: number
  hyperspaceLeaderCap: number | null
  uncommon: number
}

export interface UpgradeProbabilities {
  leaderToHyperspace: number
  leaderToShowcase: number
  baseToHyperspace: number
  foilToHyperfoil: number
  thirdUCToHyperspaceRL: number
  firstUCToHyperspaceUC: number
  secondUCToHyperspaceUC: number
  commonToHyperspace: number
  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  rareToPrestige?: number
  uc3ToPrestige?: number
}

export interface SetConfig {
  setCode: SetCode | string
  setName: string
  setNumber: number
  color: string
  prereleaseDate?: string // UTC date string (YYYY-MM-DD) when FFG's pre-release begins
  releaseDate?: string    // UTC date string (YYYY-MM-DD) of official release
  /**
   * UTC date string (YYYY-MM-DD) on which PTP opened this set to beta
   * testers. Set it when you flip the set on for beta; everyone else gets in
   * BETA_EXCLUSIVITY_DAYS later. Omit it and the set falls back to the old
   * behavior (public at prereleaseDate), which is why every pre-HMW set is
   * unaffected by this field existing.
   */
  betaAccessDate?: string
  cardCounts: CardCounts
  packRules: PackRules
  rarityWeights: SetRarityWeights
  beltRatios: BeltRatios
  dedupWindows: DedupWindows
  upgradeProbabilities: UpgradeProbabilities
}

/**
 * All set configurations
 */
export const SET_CONFIGS: Record<string, SetConfig> = {
  'SOR': SOR_CONFIG,
  'SHD': SHD_CONFIG,
  'TWI': TWI_CONFIG,
  'JTL': JTL_CONFIG,
  'LOF': LOF_CONFIG,
  'SEC': SEC_CONFIG,
  'LAW': LAW_CONFIG,
  'ASH': ASH_CONFIG,
  'HMW': HMW_CONFIG,
}

/**
 * Get configuration for a specific set
 * @param setCode - The set code (e.g., 'SOR', 'JTL')
 * @returns The set configuration
 */
export function getSetConfig(setCode: SetCode | string): SetConfig | null {
  return SET_CONFIGS[setCode] || null
}

/**
 * Get all set codes
 * @returns Array of set codes
 */
export function getAllSetCodes(): string[] {
  return Object.keys(SET_CONFIGS)
}

/**
 * How long beta testers get a new set to themselves before it opens to
 * everyone, counted from the set's betaAccessDate.
 */
export const BETA_EXCLUSIVITY_DAYS = 10

/** Add whole days to a YYYY-MM-DD UTC date string. */
function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The date this set stops being beta-only and opens to every user.
 *
 * Two regimes, deliberately:
 *  - betaAccessDate set  → betaAccessDate + BETA_EXCLUSIVITY_DAYS. Beta gets a
 *    fixed head start measured from when WE turned the set on, not from FFG's
 *    calendar, because the trigger is "the first cards exist" and that date
 *    moves around.
 *  - betaAccessDate absent → prereleaseDate, the original behavior. Every set
 *    before HMW is in this regime and behaves exactly as it always has.
 *
 * Capped at prereleaseDate either way: once FFG's own pre-release has started
 * the set is in players' hands, so continuing to beta-gate it here would be
 * absurd. A late beta launch therefore shortens the window rather than
 * pushing public access past the real-world release.
 */
export function getPublicAccessDate(
  config: Pick<SetConfig, 'prereleaseDate' | 'betaAccessDate'>,
): string | null {
  if (!config.betaAccessDate) return config.prereleaseDate ?? null
  const earned = addDays(config.betaAccessDate, BETA_EXCLUSIVITY_DAYS)
  if (!config.prereleaseDate) return earned
  return earned < config.prereleaseDate ? earned : config.prereleaseDate
}

/**
 * Check if a set is still beta-only (before its public access date).
 *
 * `now` is injectable purely so the date crossovers can be tested — these
 * predicates decide who can open a set at all, and an untestable
 * `new Date()` meant the gate was only ever verified by waiting for the day.
 */
export function isBeta(config: SetConfig, now: Date = new Date()): boolean {
  const publicAccess = getPublicAccessDate(config)
  if (!publicAccess) return false
  return now.toISOString() < new Date(publicAccess + 'T00:00:00Z').toISOString()
}

/**
 * Check if a set is in pre-release state (between prereleaseDate and releaseDate)
 */
export function isPrerelease(config: SetConfig, now: Date = new Date()): boolean {
  if (!config.prereleaseDate || !config.releaseDate) return false
  const nowIso = now.toISOString()
  return nowIso >= new Date(config.prereleaseDate + 'T00:00:00Z').toISOString() &&
         nowIso < new Date(config.releaseDate + 'T00:00:00Z').toISOString()
}

/**
 * Check if a set has been officially released
 */
export function isReleased(config: SetConfig, now: Date = new Date()): boolean {
  if (!config.releaseDate) return true
  return now.toISOString() >= new Date(config.releaseDate + 'T00:00:00Z').toISOString()
}
