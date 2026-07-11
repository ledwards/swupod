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
  prereleaseDate?: string // UTC date string (YYYY-MM-DD) when pre-release begins
  releaseDate?: string    // UTC date string (YYYY-MM-DD) of official release
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
 * Check if a set is in beta state (before prereleaseDate)
 */
export function isBeta(config: SetConfig): boolean {
  if (!config.prereleaseDate) return false
  return new Date().toISOString() < new Date(config.prereleaseDate + 'T00:00:00Z').toISOString()
}

/**
 * Check if a set is in pre-release state (between prereleaseDate and releaseDate)
 */
export function isPrerelease(config: SetConfig): boolean {
  if (!config.prereleaseDate || !config.releaseDate) return false
  const now = new Date().toISOString()
  return now >= new Date(config.prereleaseDate + 'T00:00:00Z').toISOString() &&
         now < new Date(config.releaseDate + 'T00:00:00Z').toISOString()
}

/**
 * Check if a set has been officially released
 */
export function isReleased(config: SetConfig): boolean {
  if (!config.releaseDate) return true
  return new Date().toISOString() >= new Date(config.releaseDate + 'T00:00:00Z').toISOString()
}
