// @ts-nocheck
/**
 * Set configuration type definitions
 */

import type { SetCode, Rarity } from './card';

// === CARD COUNTS ===

export interface LeaderBaseCounts {
  common: number;
  rare: number;
  total: number;
}

export interface CardCounts {
  leaders: LeaderBaseCounts;
  bases: LeaderBaseCounts;
  commons: number;
  uncommons: number;
  rares: number;
  legendaries: number;
  specials: number;
}

// === PACK RULES ===

export interface PackRules {
  /** Whether rare bases can appear in the rare slot */
  rareBasesInRareSlot: boolean;
  /** Whether the foil slot is a hyperspace foil (LAW+) */
  foilSlotIsHyperspaceFoil: boolean;
  /** Whether packs guarantee a hyperspace common (LAW+) */
  guaranteedHyperspaceCommon: boolean;
  /** Whether prestige variants appear in standard packs (LAW+) */
  prestigeInStandardPacks: boolean;
  /** Whether special rarity cards can appear in foil slot */
  specialInFoilSlot: boolean;
}

// === RARITY WEIGHTS ===

export type RarityWeightMap = Partial<Record<Rarity, number>>;

export interface RarityWeights {
  /** Weights for the foil slot rarity distribution */
  foilSlot: RarityWeightMap;
  /** Weights for hyperfoil rarity distribution */
  hyperfoil: RarityWeightMap;
  /** Weights when 3rd uncommon upgrades */
  ucSlot3Upgraded: RarityWeightMap;
  /** Weights for hyperspace non-foil variants */
  hyperspaceNonFoil: RarityWeightMap;
}

// === UPGRADE PROBABILITIES ===

export interface UpgradeProbabilities {
  /** Leader → Hyperspace leader */
  leaderToHyperspace: number;
  /** Leader → Showcase leader */
  leaderToShowcase: number;
  /** Base → Hyperspace base */
  baseToHyperspace: number;
  /** Foil → Hyperfoil */
  foilToHyperfoil: number;
  /** 3rd uncommon → Hyperspace rare/legendary */
  thirdUCToHyperspaceRL: number;
  /** 1st uncommon → Hyperspace uncommon */
  firstUCToHyperspaceUC: number;
  /** 2nd uncommon → Hyperspace uncommon */
  secondUCToHyperspaceUC: number;
  /** Common → Hyperspace common */
  commonToHyperspace: number;
  // NOTE: Rare slot NEVER upgrades to Hyperspace. HS rares only appear via UC3 upgrade.
  /** Rare → Prestige (LAW+) */
  rareToPrestige: number;
}

// === SET CONFIG ===

export interface BeltRatios {
  /** Ratio of rare:legendary (e.g., 6 = 6:1 ratio) */
  rareToLegendary: number;
}

/**
 * Complete set configuration
 */
export interface SetConfig {
  setCode: SetCode;
  setName: string;
  setNumber: number;
  /** UI color for the set */
  color: string;
  /** Whether this is a beta-only set */
  beta: boolean;
  cardCounts: CardCounts;
  packRules: PackRules;
  rarityWeights: RarityWeights;
  beltRatios: BeltRatios;
  upgradeProbabilities: UpgradeProbabilities;
}

// === SET CONFIG HELPERS ===

/**
 * Check if a set is a "Block A" set (different belt assignments)
 */
export function isBlockASet(setNumber: number): boolean {
  return setNumber >= 4;
}

/**
 * Check if a set has hyperspace variants
 */
export function hasHyperspaceVariants(setNumber: number): boolean {
  return setNumber >= 4;
}

/**
 * Check if a set has showcase variants
 */
export function hasShowcaseVariants(_setNumber: number): boolean {
  // All sets have showcase leaders
  return true;
}

/**
 * Check if a set has prestige variants
 */
export function hasPrestigeVariants(setNumber: number): boolean {
  return setNumber >= 7;
}

/**
 * Get the rare:legendary ratio for a set
 */
export function getRareToLegendaryRatio(setNumber: number): number {
  // Sets 1-3: 6:1, Sets 4+: 5:1
  return setNumber <= 3 ? 6 : 5;
}
