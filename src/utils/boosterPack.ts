// @ts-nocheck
/**
 * Booster Pack Generation
 *
 * Uses belts to provide cards for pack slots.
 *
 * Pack structure (Sets 1-6):
 * - 1 Leader (from LeaderBelt)
 * - 1 Base (common)
 * - 9 Commons
 * - 3 Uncommons
 * - 1 Rare or Legendary
 * - 1 Foil (any rarity)
 *
 * Pack structure (LAW+):
 * - 1 Leader (from LeaderBelt)
 * - 1 Base (common)
 * - 4 Commons (Belt A, slots 1-4; slot 4 upgrades to HS common 1/48 packs)
 * - 1 HS Common (from HyperspaceCommonBelt, slot 5)
 * - 4 Commons (Belt B, slots 6-9; slot 6 upgrades to HS common 1/48 packs)
 * - 1 Hyperspace Foil
 * - 3 Uncommons (UC3 can upgrade to Prestige OR HS UC/R/S/L via weighted selection)
 * - 1 Rare or Legendary (CANNOT upgrade)
 *
 * Total: 16 cards
 */

import type { SetCode } from '../types';
import type { RawCard } from './cardData';

import { isCarboniteCode } from './carboniteConstants';
import { generateCarboniteBoosterPack, clearCarboniteBeltCache } from './carboniteBoosterPack';
import { CarbonitePrestigeBelt } from '../belts/CarbonitePrestigeBelt';
import { LeaderBelt } from '../belts/LeaderBelt';
import { BaseBelt } from '../belts/BaseBelt';
import { FoilBelt } from '../belts/FoilBelt';
import { RareLegendaryBelt } from '../belts/RareLegendaryBelt';
import { UncommonBelt } from '../belts/UncommonBelt';
import { CommonBelt } from '../belts/CommonBelt';
import { getBlockForSet, getBeltConfig } from '../belts/data/commonBeltAssignments';
import { ShowcaseLeaderBelt } from '../belts/ShowcaseLeaderBelt';
import { HyperfoilBelt } from '../belts/HyperfoilBelt';
import { HyperspaceLeaderBelt } from '../belts/HyperspaceLeaderBelt';
import { HyperspaceBaseBelt } from '../belts/HyperspaceBaseBelt';
import { HyperspaceUncommonBelt } from '../belts/HyperspaceUncommonBelt';
import { HyperspaceCommonBelt } from '../belts/HyperspaceCommonBelt';
import { HyperspaceCommonLaneBelt } from '../belts/HyperspaceCommonLaneBelt';
import { HyperspaceRareLegendaryBelt } from '../belts/HyperspaceRareLegendaryBelt';
import { HyperspaceSingleRarityBelt } from '../belts/HyperspaceSingleRarityBelt';
import { HyperspaceUpgradeBelt, type UpgradePlan } from '../belts/HyperspaceUpgradeBelt';
import { CommonUpgradeBelt, type CommonUpgradeSlot } from '../belts/CommonUpgradeBelt';
import { Set7PlusUc3OutcomeBelt, type Set7PlusUc3Outcome } from '../belts/Set7PlusUc3OutcomeBelt';
import { getSetConfig } from './setConfigs/index';
import { getCachedCards } from './cardCache';

// === TYPES ===

/** A booster pack containing cards */
interface Pack {
  cards: RawCard[];
}

/** Upgrade probabilities from set config */
interface UpgradeProbabilities {
  leaderToShowcase?: number;
  leaderToHyperspace?: number;
  baseToHyperspace?: number;
  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
  foilToHyperfoil?: number;
  firstUCToHyperspaceUC?: number;
  secondUCToHyperspaceUC?: number;
  thirdUCToHyperspaceRL?: number;
  commonToHyperspace?: number;
  rareToPrestige?: number;
  uc3ToPrestige?: number;
}

/** Belt configuration from commonBeltAssignments */
interface BeltConfig {
  hyperspaceSlot: number;
  guaranteedHyperspace?: boolean;
}

/** Generic belt interface for type safety */
interface Belt {
  next(): RawCard | null;
}

/** Set configuration (partial - just what we need) */
interface SetConfig {
  packRules?: {
    foilSlotIsHyperspaceFoil?: boolean;
    prestigeInStandardPacks?: boolean;
  };
  upgradeProbabilities?: UpgradeProbabilities;
  rarityWeights?: {
    ucSlot3Upgraded?: Record<string, number>;
  };
}

// === MODULE STATE ===

// Cache belts by set code so we reuse the same belt across pack generation
const beltCache = new Map<string, Belt>();

// Track which common belt to start with for alternating (true = start with A)
let startWithBeltA = true;

/**
 * A booster box is ALWAYS 24 packs. This is a property of the physical product,
 * not a tunable: `stackBoxOrder` assembles two interleaved columns of BOX_SIZE/2,
 * and the belts' boot length is calibrated so one boot ≈ one box. Enforced for
 * Set 7+ in `generateStackedBox`.
 */
export const BOX_SIZE = 24;

// Per-set virtual-box buffer for Set 7+ sealed pods.
// Real boxes are stacked from the factory line into two interleaved columns and
// consumed top-down by column; pods must be cut from consecutive box positions.
// Keyed by setCode; cleared by clearBeltCache like the other belt caches.
const virtualBoxBuffer = new Map<string, Pack[]>();

// === HELPER FUNCTIONS ===

/** Weighted random rarity selection from a weights map (e.g. { Uncommon: 24, Rare: 12, ... }) */
function weightedRaritySelect(weights: Record<string, number>): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return rarity;
  }
  return entries[entries.length - 1][0];
}

function findHyperspaceVariant(card: RawCard | null, setCode: SetCode | string): RawCard | null {
  if (!card || !card.name) return null;

  const allCards = getCachedCards(setCode);
  const hsVariant = allCards.find(c =>
    c.name === card.name &&
    c.variantType === 'Hyperspace' &&
    c.rarity === card.rarity &&
    c.type === card.type
  );

  if (hsVariant) {
    return { ...hsVariant, isHyperspace: true };
  }

  return { ...card, variantType: 'Hyperspace', isHyperspace: true };
}

/**
 * Check if a set uses LAW+ pack rules (Set 7 onwards)
 * - Foil slot is always Hyperspace Foil
 * - Guaranteed Hyperspace common in every pack
 * - Prestige cards can appear in rare slot
 */
function usesLawPackRules(setCode: SetCode | string): boolean {
  const config = getSetConfig(setCode) as SetConfig | null;
  return config?.packRules?.foilSlotIsHyperspaceFoil === true;
}

/**
 * Set 7+ (LAW, ASH) model the physical factory line + box stacking. Sets 1-6
 * keep byte-identical behavior.
 */
function usesLineStacking(setCode: SetCode | string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = getSetConfig(setCode) as any;
  return config?.packRules?.lineStackingCollation === true;
}

/**
 * Reorder packs from factory LINE order into physical BOX order (Set 7+).
 *
 * The factory belts emit packs in line order (line index k = 1..N in generation
 * sequence). Packs are stacked into the box in two interleaved columns of N/2,
 * bottom-up alternating. Mapping (1-indexed positions):
 *   - line k (odd)  → box position 12-(k-1)/2   (generalizes to (N/2)-(k-1)/2)
 *   - line k (even) → box position 24-(k-2)/2   (generalizes to N-(k-2)/2)
 * Return array index = box position - 1.
 *
 * This is physical box assembly — whole packs move, contents are never touched.
 * Odd or too-short boxes (< 2) are returned unchanged.
 */
export function stackBoxOrder<T>(packs: T[]): T[] {
  const n = packs.length;
  if (n < 2 || n % 2 !== 0) return packs;
  const half = n / 2;
  const boxed = new Array<T>(n);
  for (let k = 1; k <= n; k++) {
    const pos = (k % 2 === 1)
      ? half - (k - 1) / 2   // odd line index → first (top) column
      : n - (k - 2) / 2;     // even line index → second (bottom) column
    boxed[pos - 1] = packs[k - 1];
  }
  return boxed;
}

// === BELT GETTERS ===

/**
 * Get or create a LeaderBelt for a set
 */
function getLeaderBelt(setCode: SetCode | string): Belt {
  const key = `leader-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new LeaderBelt(setCode));
  }
  return beltCache.get(key)!;
}

/**
 * Get or create a BaseBelt for a set
 */
function getBaseBelt(setCode: SetCode | string): Belt {
  const key = `base-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new BaseBelt(setCode));
  }
  return beltCache.get(key)!;
}

/**
 * Get or create a FoilBelt for a set
 */
function getFoilBelt(setCode: SetCode | string): Belt {
  const key = `foil-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new FoilBelt(setCode));
  }
  return beltCache.get(key)!;
}

/**
 * Get or create a RareLegendaryBelt for a set
 */
function getRareLegendaryBelt(setCode: SetCode | string): Belt {
  const key = `rarelegendary-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new RareLegendaryBelt(setCode));
  }
  return beltCache.get(key)!;
}

/**
 * Get or create an UncommonBelt for a set
 */
function getUncommonBelt(setCode: SetCode | string): Belt {
  const key = `uncommon-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new UncommonBelt(setCode));
  }
  return beltCache.get(key)!;
}

/**
 * Get or create CommonBelts A and B for a set
 *
 * Block 0 (SOR, SHD, TWI):
 * - Belt A: Vigilance, Command, Aggression (60 cards)
 * - Belt B: Cunning, Villainy, Heroism, Neutral (30 cards)
 *
 * Block A (JTL, LOF, SEC):
 * - Belt A: Vigilance, Command, Villainy (50 cards)
 * - Belt B: Aggression, Cunning, Heroism, Neutral (50 cards)
 */
function getCommonBelts(setCode: SetCode | string): { beltA: Belt; beltB: Belt } {
  const keyA = `common-a-${setCode}`;
  const keyB = `common-b-${setCode}`;

  if (!beltCache.has(keyA) || !beltCache.has(keyB)) {
    beltCache.set(keyA, new CommonBelt(setCode, 'A'));
    beltCache.set(keyB, new CommonBelt(setCode, 'B'));
  }

  return {
    beltA: beltCache.get(keyA)!,
    beltB: beltCache.get(keyB)!
  };
}

// === Variant Belt Getters ===

/** Get ShowcaseLeaderBelt - exported for testing/future use */
export function getShowcaseLeaderBelt(setCode: SetCode | string): Belt {
  const key = `showcase-leader-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new ShowcaseLeaderBelt(setCode));
  }
  return beltCache.get(key)!;
}

function getHyperfoilBelt(setCode: SetCode | string): Belt {
  const key = `hyperfoil-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperfoilBelt(setCode));
  }
  return beltCache.get(key)!;
}

/** Get HyperspaceLeaderBelt - exported for testing/future use */
export function getHyperspaceLeaderBelt(setCode: SetCode | string): Belt {
  const key = `hyperspace-leader-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceLeaderBelt(setCode));
  }
  return beltCache.get(key)!;
}

/** Get HyperspaceBaseBelt - exported for testing/future use */
export function getHyperspaceBaseBelt(setCode: SetCode | string): Belt {
  const key = `hyperspace-base-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceBaseBelt(setCode));
  }
  return beltCache.get(key)!;
}

/** Get HyperspaceUncommonBelt - exported for testing/future use */
export function getHyperspaceUncommonBelt(setCode: SetCode | string): Belt {
  const key = `hyperspace-uncommon-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceUncommonBelt(setCode));
  }
  return beltCache.get(key)!;
}

/** Get HyperspaceCommonBelt - exported for testing/future use */
export function getHyperspaceCommonBelt(setCode: SetCode | string): Belt {
  const key = `hyperspace-common-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceCommonBelt(setCode));
  }
  return beltCache.get(key)!;
}

function getHyperspaceCommonLaneBelt(setCode: SetCode | string, beltId: 'A' | 'B'): Belt {
  const key = `hyperspace-common-${beltId.toLowerCase()}-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceCommonLaneBelt(setCode, beltId));
  }
  return beltCache.get(key)!;
}

function getHyperspaceRareLegendaryBelt(setCode: SetCode | string): Belt {
  const key = `hyperspace-rarelegendary-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceRareLegendaryBelt(setCode));
  }
  return beltCache.get(key)!;
}

function getHyperspaceSingleRarityBelt(setCode: SetCode | string, rarity: string): Belt {
  const key = `hyperspace-${rarity.toLowerCase()}-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceSingleRarityBelt(setCode, rarity));
  }
  return beltCache.get(key)!;
}

function getPrestigeBelt(setCode: SetCode | string): Belt {
  const key = `prestige-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new CarbonitePrestigeBelt(setCode));
  }
  return beltCache.get(key)!;
}

/**
 * Get the set group key for HS belt config ('1-3', '4-6', 'LAW')
 * All sets use the HyperspaceUpgradeBelt for controlled variance.
 * LAW+ belt guarantees ≥1 HS per pack (budget-0 = 0).
 */
function getHSBeltGroup(setCode: SetCode | string): string | null {
  const config = getSetConfig(setCode);
  if (!config) return null;
  const n = config.setNumber;
  if (n >= 1 && n <= 3) return '1-3';
  if (n >= 4 && n <= 6) return '4-6';
  // ASH (Set 8) has its own real-box-calibrated HS sheet (spaced, lower rates).
  if (config.setCode === 'ASH') return 'ASH';
  if (n >= 7) return 'LAW';
  return null;
}

function getHyperspaceUpgradeBelt(setCode: SetCode | string): HyperspaceUpgradeBelt | null {
  const group = getHSBeltGroup(setCode);
  if (!group) return null;
  const key = `hs-upgrade-${setCode}`;
  if (!beltCache.has(key)) {
    beltCache.set(key, new HyperspaceUpgradeBelt(group));
  }
  return beltCache.get(key) as HyperspaceUpgradeBelt;
}

/**
 * Get or create a CommonUpgradeBelt for LAW+ sets
 * 48-pack cycle: 1 Belt A upgrade, 1 Belt B upgrade, 46 none
 */
function getCommonUpgradeBelt(setCode: SetCode | string): CommonUpgradeBelt | null {
  if (!usesLawPackRules(setCode)) return null;
  const key = `common-upgrade-${setCode}`;
  if (!beltCache.has(key)) {
    // Default 1+1 per 48 (~1 second HS common/box) matches the 6 sharp real ASH
    // boxes (1.18/box, sd 0.68) once HS common *leaders* are excluded from the
    // count. No per-set override needed.
    beltCache.set(key, new CommonUpgradeBelt());
  }
  return beltCache.get(key) as CommonUpgradeBelt;
}

function getSet7PlusUc3OutcomeBelt(setCode: SetCode | string): Set7PlusUc3OutcomeBelt | null {
  if (!usesLawPackRules(setCode)) return null;
  const key = `set7plus-uc3-${setCode}`;
  if (!beltCache.has(key)) {
    const config = getSetConfig(setCode) as SetConfig | null;
    beltCache.set(key, new Set7PlusUc3OutcomeBelt({
      prestigeRate: config?.upgradeProbabilities?.uc3ToPrestige,
    }));
  }
  return beltCache.get(key) as Set7PlusUc3OutcomeBelt;
}

/**
 * Clear belt cache (useful for testing or resetting state)
 */
export function clearBeltCache(): void {
  beltCache.clear();
  clearCarboniteBeltCache();
  virtualBoxBuffer.clear(); // Discard any buffered virtual-box remainder
  startWithBeltA = true; // Reset alternating state
}

/**
 * Check if an upgrade should happen based on probability
 */
function shouldUpgrade(probability: number): boolean {
  return Math.random() < probability;
}

/**
 * Apply upgrade pass to a pack
 * Checks each slot for possible upgrades based on set-level probabilities
 *
 * @param pack - Pack with cards array
 * @param setCode - Set code
 * @returns Pack with upgraded cards
 */
function applyUpgradePass(pack: Pack, setCode: SetCode | string): Pack {
  const config = getSetConfig(setCode) as SetConfig | null;
  const probs: UpgradeProbabilities = config?.upgradeProbabilities || {};

  // Find card indices by type
  const leaderIndex = pack.cards.findIndex(c => c.isLeader);
  const baseIndex = pack.cards.findIndex(c => c.isBase);
  const foilIndex = pack.cards.findIndex(c => c.isFoil);

  // Find uncommon indices (cards with Uncommon rarity, not leaders/bases/foils)
  const uncommonIndices: number[] = [];
  pack.cards.forEach((c, i) => {
    if (c.rarity === 'Uncommon' && !c.isLeader && !c.isBase && !c.isFoil) {
      uncommonIndices.push(i);
    }
  });

  // Find rare/legendary slot (Rare or Legendary, not foil)
  const rareIndex = pack.cards.findIndex(c =>
    (c.rarity === 'Rare' || c.rarity === 'Legendary') &&
    !c.isFoil && !c.isLeader && !c.isBase
  );

  // Get HS upgrade plan from belt (sets 1-6) or null (LAW+)
  const hsBelt = getHyperspaceUpgradeBelt(setCode);
  const hsPlan: UpgradePlan | null = hsBelt ? hsBelt.next() : null;

  // 1. Leader upgrades
  // Showcase takes precedence. Leader treatment upgrades pull from their own
  // physical leader belts; the next pack continues on the standard leader belt.
  if (leaderIndex >= 0) {
    if (probs.leaderToShowcase && shouldUpgrade(probs.leaderToShowcase)) {
      const showcaseLeaderBelt = getShowcaseLeaderBelt(setCode);
      const upgraded = showcaseLeaderBelt.next();
      if (upgraded) pack.cards[leaderIndex] = upgraded;
    } else {
      const shouldUpgradeLeader = hsPlan ? hsPlan.leader : (probs.leaderToHyperspace && shouldUpgrade(probs.leaderToHyperspace));
      if (shouldUpgradeLeader) {
        const hsLeaderBelt = getHyperspaceLeaderBelt(setCode);
        const upgraded = hsLeaderBelt.next();
        if (upgraded) pack.cards[leaderIndex] = upgraded;
      }
    }
  }

  // 2. Base upgrade - replace with a fresh draw from the HS base belt
  if (baseIndex >= 0) {
    const shouldUpgradeBase = hsPlan ? hsPlan.base : (probs.baseToHyperspace && shouldUpgrade(probs.baseToHyperspace));
    if (shouldUpgradeBase) {
      const hsBaseBelt = getHyperspaceBaseBelt(setCode);
      const upgraded = hsBaseBelt.next();
      if (upgraded) pack.cards[baseIndex] = upgraded;
    }
  }

  // 3. Rare slot - NEVER upgrades to Hyperspace
  // NOTE: HS rares only appear via UC3 upgrade (slot 3 uncommon → HS R/L belt)

  // 4. Foil upgrade to Hyperfoil - replace with a Hyperspace Foil card from belt
  // Independent coin flip (too rare to affect variance). LAW+ skips entirely.
  const skipFoilUpgrade = usesLawPackRules(setCode);
  if (!skipFoilUpgrade && foilIndex >= 0 && probs.foilToHyperfoil && shouldUpgrade(probs.foilToHyperfoil)) {
    const hyperfoilBelt = getHyperfoilBelt(setCode);
    const upgraded = hyperfoilBelt.next();
    if (upgraded) {
      pack.cards[foilIndex] = upgraded;
    }
  }

  // 5. First UC upgrade to Hyperspace UC - fresh draw from HS UC belt
  // IMPORTANT: Apply UC->HS_UC upgrades BEFORE UC->HS_R/L to avoid index corruption
  const firstUCIndex = uncommonIndices[0];
  if (firstUCIndex !== undefined) {
    const shouldUpgradeUC1 = hsPlan ? hsPlan.uc1 : (probs.firstUCToHyperspaceUC && shouldUpgrade(probs.firstUCToHyperspaceUC));
    if (shouldUpgradeUC1) {
      const hsUCBelt = getHyperspaceUncommonBelt(setCode);
      const upgraded = hsUCBelt.next();
      if (upgraded) pack.cards[firstUCIndex] = upgraded;
    }
  }

  // 6. Second UC upgrade to Hyperspace UC - fresh draw from HS UC belt
  const secondUCIndex = uncommonIndices[1];
  if (secondUCIndex !== undefined) {
    const shouldUpgradeUC2 = hsPlan ? hsPlan.uc2 : (probs.secondUCToHyperspaceUC && shouldUpgrade(probs.secondUCToHyperspaceUC));
    if (shouldUpgradeUC2) {
      const hsUCBelt = getHyperspaceUncommonBelt(setCode);
      const upgraded = hsUCBelt.next();
      if (upgraded) pack.cards[secondUCIndex] = upgraded;
    }
  }

  // 7. Third UC upgrade — two possible paths:
  // a) UC3 → Prestige tier 1 (LAW+, ~1/18 — checked FIRST, takes priority)
  // b) UC3 → Hyperspace R/L (RARITY change — uses belt for random R/L)
  // Cannot be both — at most one upgrade per slot.
  // This MUST happen after UC->HS_UC upgrades since it changes rarity and corrupts uncommonIndices
  // NOTE: If the HS R/L belt serves a card that matches the existing R/L, that's OK.
  // Belts are independent and do not have knowledge of each other — just like a real printer.
  const thirdUCIndex = uncommonIndices[2];
  if (thirdUCIndex !== undefined) {
    if (usesLawPackRules(setCode)) {
      const uc3OutcomeBelt = getSet7PlusUc3OutcomeBelt(setCode);
      const outcome: Set7PlusUc3Outcome = uc3OutcomeBelt ? uc3OutcomeBelt.next() : 'none';
      // Physical sheet semantics: an upgraded UC3 comes from another sheet, so
      // the normal-UC sheet never advanced — return the displaced card to the
      // FRONT of the UncommonBelt (drawing 3-then-discarding burned ~8 phantom
      // sheet positions per box and doubled UC seam repeats vs the 6 verified
      // real boxes: ~12/box generated vs 6.7 observed).
      const displacedUC3 = pack.cards[thirdUCIndex];
      const returnDisplaced = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ub = getUncommonBelt(setCode) as any;
        if (displacedUC3 && typeof ub.putBack === 'function') ub.putBack(displacedUC3);
      };

      if (outcome === 'prestige') {
        const prestigeBelt = getPrestigeBelt(setCode);
        const prestige = prestigeBelt ? (prestigeBelt as CarbonitePrestigeBelt).nextTier1({ allowSynthesis: false }) : null;
        if (prestige) { pack.cards[thirdUCIndex] = prestige; returnDisplaced(); }
      } else if (outcome === 'hsUncommon') {
        const hsUCBelt = getHyperspaceUncommonBelt(setCode);
        const upgraded = hsUCBelt.next();
        if (upgraded) { pack.cards[thirdUCIndex] = upgraded; returnDisplaced(); }
      } else if (outcome === 'hsRare') {
        const hsRareBelt = getHyperspaceSingleRarityBelt(setCode, 'Rare');
        const upgraded = hsRareBelt.next();
        if (upgraded) { pack.cards[thirdUCIndex] = upgraded; returnDisplaced(); }
      } else if (outcome === 'hsSpecial') {
        const hsSpecialBelt = getHyperspaceSingleRarityBelt(setCode, 'Special');
        const upgraded = hsSpecialBelt.next();
        if (upgraded) { pack.cards[thirdUCIndex] = upgraded; returnDisplaced(); }
      } else if (outcome === 'hsLegendary') {
        const hsLegendaryBelt = getHyperspaceSingleRarityBelt(setCode, 'Legendary');
        const upgraded = hsLegendaryBelt.next();
        if (upgraded) { pack.cards[thirdUCIndex] = upgraded; returnDisplaced(); }
      }
    } else {
      const shouldUpgradeUC3 = hsPlan ? hsPlan.uc3 : (probs.thirdUCToHyperspaceRL && shouldUpgrade(probs.thirdUCToHyperspaceRL));
      if (shouldUpgradeUC3) {
        const uc3Weights = config?.rarityWeights?.ucSlot3Upgraded;
        if (uc3Weights) {
          const rarity = weightedRaritySelect(uc3Weights);
          if (rarity === 'Uncommon') {
            const hsUCBelt = getHyperspaceUncommonBelt(setCode);
            const upgraded = hsUCBelt.next();
            if (upgraded) pack.cards[thirdUCIndex] = upgraded;
          } else if (rarity === 'Rare' || rarity === 'Legendary' || rarity === 'Special') {
            const hsRarityBelt = getHyperspaceSingleRarityBelt(setCode, rarity);
            const upgraded = hsRarityBelt.next();
            if (upgraded) pack.cards[thirdUCIndex] = upgraded;
          }
        } else {
          // Sets without weights — use R/L belt directly
          const hsRLBelt = getHyperspaceRareLegendaryBelt(setCode);
          const upgraded = hsRLBelt.next();
          if (upgraded) pack.cards[thirdUCIndex] = upgraded;
        }
      }
    }
  }

  // 8. Common upgrade - replace designated slot with a fresh draw from HS common belt
  // LAW+: Slot 5 is already HS from dedicated HyperspaceCommonBelt (no upgrade needed here).
  // Other sets: use belt plan or probability to upgrade the common at the hyperspace slot.
  const block = getBlockForSet(setCode);
  const blockConfig: BeltConfig = getBeltConfig(block);

  if (block !== 'B') {
    // Sets 1-6: common HS upgrade via belt plan or probability
    const shouldUpgradeCommon = hsPlan ? hsPlan.common : (probs.commonToHyperspace && shouldUpgrade(probs.commonToHyperspace));
    if (shouldUpgradeCommon) {
      const hyperspaceIndex = 1 + blockConfig.hyperspaceSlot;
      if (hyperspaceIndex < pack.cards.length) {
      const currentCommon = pack.cards[hyperspaceIndex];
      if (currentCommon && currentCommon.rarity === 'Common' && !currentCommon.isLeader && !currentCommon.isBase) {
          const upgraded = findHyperspaceVariant(currentCommon, setCode);
          if (upgraded) pack.cards[hyperspaceIndex] = upgraded;
      }
    }
  }
  }
  // LAW+ (Block B): no common upgrade — slot 5 is already HS from dedicated belt

  // 9. Prestige card in rare slot (if configured — rareToPrestige > 0)
  // LAW: rareToPrestige is 0 (prestige moved to UC3 slot above)
  if (config?.packRules?.prestigeInStandardPacks && probs.rareToPrestige && shouldUpgrade(probs.rareToPrestige)) {
    const prestigeBelt = getPrestigeBelt(setCode);
    if (prestigeBelt && rareIndex >= 0) {
      const prestige = (prestigeBelt as CarbonitePrestigeBelt).nextTier1({ allowSynthesis: false });
      if (prestige) {
        pack.cards[rareIndex] = prestige;
      }
    }
  }

  return pack;
}


/**
 * Generate a single booster pack
 * @param cards - All cards (unused, kept for API compatibility)
 * @param setCode - Set code (SOR, SHD, etc.)
 * @returns Pack object with cards array
 */
export function generateBoosterPack(_cards: RawCard[], setCode: SetCode | string): Pack {
  // Carbonite packs have a completely different structure
  if (isCarboniteCode(setCode as string)) {
    return generateCarboniteBoosterPack(setCode as string);
  }

  // Get belts
  const leaderBelt = getLeaderBelt(setCode);
  const baseBelt = getBaseBelt(setCode);
  const rareLegendaryBelt = getRareLegendaryBelt(setCode);
  const uncommonBelt = getUncommonBelt(setCode);
  const { beltA: commonBeltA, beltB: commonBeltB } = getCommonBelts(setCode);

  // LAW+ uses HyperfoilBelt for foil slot (always Hyperspace Foil)
  // Earlier sets use regular FoilBelt
  const isLawPlus = usesLawPackRules(setCode);
  const foilBelt = isLawPlus ? getHyperfoilBelt(setCode) : getFoilBelt(setCode);

  // Build pack
  const packCards: RawCard[] = [];
  const currentStartWithA = startWithBeltA;

  // 1 Leader (from belt)
  const leader = leaderBelt.next();
  if (leader) packCards.push(leader);

  // 1 Base (from belt)
  const base = baseBelt.next();
  if (base) packCards.push(base);

  // 9 Commons - slot pattern depends on block
  // Block 0 (SOR, SHD, TWI): Belt A for slots 1-6, Belt B for slots 7-9
  // Block A (JTL, LOF, SEC): Belt A for slots 1-4, slot 5 alternates, Belt B for slots 6-9
  // Block B (LAW+): Belt A for slots 1-4, slot 5 from HyperspaceCommonBelt, Belt B for slots 6-9
  const block = getBlockForSet(setCode);
  // Note: BeltConfig is used in applyUpgradePass for hyperspace slot position

  for (let slot = 1; slot <= 9; slot++) {
    if (block === 'B' && slot === 5) {
      // Block B (LAW+): Slot 5 is a dedicated HS common from HyperspaceCommonBelt
      const hsCommonBelt = getHyperspaceCommonBelt(setCode);
      const hsCommon = hsCommonBelt.next();
      if (hsCommon) packCards.push(hsCommon);
      continue;
    }

    let belt: Belt;
    if (block === 0) {
      // Block 0: Belt A for slots 1-6, Belt B for slots 7-9
      belt = (slot <= 6) ? commonBeltA : commonBeltB;
    } else if (block === 'A') {
      // Block A: Belt A for slots 1-4, slot 5 alternates, Belt B for slots 6-9
      if (slot <= 4) {
        belt = commonBeltA;
      } else if (slot === 5) {
        // Slot 5 alternates between Belt A and Belt B
        belt = startWithBeltA ? commonBeltA : commonBeltB;
      } else {
        belt = commonBeltB;
      }
    } else {
      // Block B (LAW+): Belt A for slots 1-4, Belt B for slots 6-9
      // (slot 5 handled above with continue)
      if (slot <= 4) {
        belt = commonBeltA;
      } else {
        belt = commonBeltB;
      }
    }
    const common = belt.next();
    if (common) packCards.push(common);
  }

  // Toggle alternating slot for next pack (only relevant for Block A)
  startWithBeltA = !startWithBeltA;

  // LAW+ common upgrade: 1/48 packs upgrade Belt A slot 4 or Belt B slot 6
  // to an HS common (fresh draw from HyperspaceCommonBelt, not a variant swap)
  const commonUpgradeBelt = getCommonUpgradeBelt(setCode);
  if (commonUpgradeBelt) {
    const upgradeSlot = commonUpgradeBelt.next();
    if (upgradeSlot !== 'none') {
      const hsCommonBelt = getHyperspaceCommonLaneBelt(setCode, upgradeSlot === 'beltA' ? 'A' : 'B');
      const hsCommon = hsCommonBelt.next();
      if (hsCommon) {
        // Pack indices: 0=leader, 1=base, 2-5=Belt A slots 1-4, 6=HS common, 7-10=Belt B slots 6-9
        // Belt A slot 4 = pack index 5, Belt B slot 6 (first Belt B card) = pack index 7
        const upgradeIndex = upgradeSlot === 'beltA' ? 5 : 7;
        packCards[upgradeIndex] = hsCommon;
      }
    }
  }

  // Generate foil card from belt
  const foilCard = foilBelt.next();

  // LAW+ pack order: Leader, Base, 9 Commons, HS Foil, 3 UCs, R/L
  // Earlier sets: Leader, Base, 9 Commons, 3 UCs, R/L, Foil
  if (isLawPlus && foilCard) {
    packCards.push(foilCard);
  }

  // 3 Uncommons (from belt)
  for (let i = 0; i < 3; i++) {
    const uncommon = uncommonBelt.next();
    if (uncommon) packCards.push(uncommon);
  }

  // 1 Rare or Legendary (from belt)
  const rareOrLegendary = rareLegendaryBelt.next();
  if (rareOrLegendary) packCards.push(rareOrLegendary);

  // 1 Foil at end (sets 1-6 only; LAW+ already placed foil after commons)
  if (!isLawPlus && foilCard) {
    packCards.push(foilCard);
  }

  // Check for duplicates in pack (for debugging)
  // A duplicate is defined as same ID AND same foil status
  interface SeenCard {
    index: number;
    isFoil: boolean;
  }
  const seen = new Map<string, SeenCard[]>(); // Map of card.id to array of {index, isFoil}
  const duplicates: Array<{
    id: string;
    name: string;
    positions: number[];
    isFoil: boolean;
  }> = [];

  packCards.forEach((card, index) => {
    const id = card.id;

    if (!seen.has(id)) {
      seen.set(id, []);
    }

    const seenCards = seen.get(id)!;
    // Check if we've seen this card with the same foil status
    const matchingCards = seenCards.filter(c => c.isFoil === card.isFoil);

    if (matchingCards.length > 0) {
      // True duplicate found (same ID and same foil status)
      const firstMatch = matchingCards[0];
      if (firstMatch) {
        duplicates.push({
          id: id,
          name: card.name,
          positions: [firstMatch.index, index],
          isFoil: card.isFoil
        });
      }
    }

    seenCards.push({ index: index, isFoil: card.isFoil });
  });



  // Create pack and apply upgrade pass
  const pack: Pack = { cards: packCards };
  return applyUpgradePass(pack, setCode);
}

/**
 * Generate a sealed pod (6 booster packs)
 * @param cards - All cards (unused, kept for API compatibility)
 * @param setCode - Set code
 * @param packCount - Number of packs (default 6)
 * @returns Array of pack objects (each with cards array)
 */
export function generateSealedPod(_cards: RawCard[], setCode: SetCode | string, packCount: number = 6): Pack[] {
  // Set 7+ (LAW, ASH): pods are cut from stacked boxes — consecutive box
  // positions. A per-set virtual-box buffer holds the remainder of the current
  // stacked box; when it runs dry we generate a fresh full 24-pack stacked box.
  // This makes pods come out as box positions 1-6, 7-12, 13-18, 19-24, then a
  // fresh box. If a request spans a box boundary we finish the old box and start
  // a new one (simplest correct behavior).
  if (usesLineStacking(setCode)) {
    const key = String(setCode);
    const packs: Pack[] = [];
    while (packs.length < packCount) {
      let buffer = virtualBoxBuffer.get(key);
      if (!buffer || buffer.length === 0) {
        buffer = generateStackedBox(_cards, setCode, BOX_SIZE);
        virtualBoxBuffer.set(key, buffer);
      }
      const need = packCount - packs.length;
      const take = Math.min(need, buffer.length);
      packs.push(...buffer.splice(0, take));
    }
    return packs;
  }

  // Sets 1-6: independent-pack behavior (unchanged).
  // Clear belt cache for fresh pod generation
  // This ensures each sealed pod starts with a fresh belt at random position
  clearBeltCache();

  const packs: Pack[] = [];
  for (let i = 0; i < packCount; i++) {
    packs.push(generateBoosterPack(_cards, setCode));
  }
  return packs;
}

/**
 * Generate a complete sealed booster box (24 packs)
 * Used for the "Randomize Packs" feature - generates all 24 packs upfront
 * so users can shuffle which 6 packs they receive from the box.
 *
 * @param cards - All cards (unused, kept for API compatibility)
 * @param setCode - Set code
 * @param boxSize - Number of packs in box (default 24)
 * @returns Array of pack objects (each with cards array)
 */
export function generateSealedBox(_cards: RawCard[], setCode: SetCode | string, boxSize: number = BOX_SIZE): Pack[] {
  // Clear belt cache for fresh box generation
  // This ensures the box starts with fresh belts for proper collation
  clearBeltCache();
  return generateStackedBox(_cards, setCode, boxSize);
}

/**
 * Generate a box's worth of packs in LINE order, then stack into BOX order for
 * Set 7+. Does NOT clear the belt cache (callers manage belt/buffer lifecycle):
 * generateSealedBox clears first for a fresh box; the pod path refills its
 * virtual box on top of whatever belt state exists.
 *
 * Sets 1-6 return line order unchanged; Set 7+ returns box order. Pack contents
 * are never touched — only the array order changes.
 */
function generateStackedBox(_cards: RawCard[], setCode: SetCode | string, boxSize: number = BOX_SIZE): Pack[] {
  // A booster box is ALWAYS 24 packs. Column depth (BOX_SIZE/2) and the belt boot
  // length are both properties of the product, not parameters — stacking any other
  // size invents a box that does not exist and drags a boot seam into the middle
  // of a player's pool. If you need N packs, cut them from real boxes with
  // generateSealedPod. See .claude/rules/belt-system.md.
  if (usesLineStacking(setCode) && boxSize !== BOX_SIZE) {
    throw new Error(
      `A ${setCode} box is always ${BOX_SIZE} packs, got ${boxSize}. ` +
      `Use generateSealedPod([], '${setCode}', ${boxSize}) to cut ${boxSize} packs from real boxes.`
    );
  }

  const linePacks: Pack[] = [];
  for (let i = 0; i < boxSize; i++) {
    linePacks.push(generateBoosterPack(_cards, setCode));
  }
  return usesLineStacking(setCode) ? stackBoxOrder(linePacks) : linePacks;
}
