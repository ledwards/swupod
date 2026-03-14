// @ts-nocheck
/**
 * Mixin Modifiers for Draft Bot Strategies
 *
 * Each bot gets one mixin randomly applied on top of its core strategy.
 * Mixins adjust weights in the scoring formula — they don't override the strategy.
 *
 * Mixin A: High Optionality — picks broadly, commits late
 * Mixin B: High Conviction — commits early, strong synergy focus
 * Mixin C: High Groupthink — heavily weights popularity at all phases
 */

export interface MixinModifier {
  name: string
  /** Offset applied to Y and X turns. Positive = later commitment. */
  commitmentOffset: number
  /** Multiplier for color weight before commitment (e.g., -0.4 = 40% reduction) */
  preCommitColorMultiplier: number
  /** Multiplier for quality weight before commitment */
  preCommitQualityMultiplier: number
  /** Multiplier for synergy weight after commitment */
  postCommitSynergyMultiplier: number
  /** Multiplier for color weight after commitment */
  postCommitColorMultiplier: number
  /** Global quality (popularity) multiplier applied at all phases */
  qualityMultiplier: number
  /** Global need multiplier */
  needMultiplier: number
}

export const MIXIN_A: MixinModifier = {
  name: 'highOptionality',
  commitmentOffset: 3,        // Y and X pushed 3 turns later
  preCommitColorMultiplier: -0.4,   // Color weight reduced 40% before commitment
  preCommitQualityMultiplier: 0.2,  // Quality weight increased 20% before commitment
  postCommitSynergyMultiplier: 0,
  postCommitColorMultiplier: 0,
  qualityMultiplier: 0,
  needMultiplier: 0,
}

export const MIXIN_B: MixinModifier = {
  name: 'highConviction',
  commitmentOffset: -3,       // Y and X pulled 3 turns earlier
  preCommitColorMultiplier: 0,
  preCommitQualityMultiplier: 0,
  postCommitSynergyMultiplier: 0.5,  // Synergy +50% after commitment
  postCommitColorMultiplier: 0.3,    // Color +30% after commitment
  qualityMultiplier: 0,
  needMultiplier: 0,
}

export const MIXIN_C: MixinModifier = {
  name: 'highGroupthink',
  commitmentOffset: 0,
  preCommitColorMultiplier: 0,
  preCommitQualityMultiplier: 0,
  postCommitSynergyMultiplier: 0,
  postCommitColorMultiplier: 0,
  qualityMultiplier: 0.4,     // Popularity +40% at all phases
  needMultiplier: -0.2,       // Need reduced 20%
}

export const ALL_MIXINS: MixinModifier[] = [MIXIN_A, MIXIN_B, MIXIN_C]

/** Get a random mixin */
export function getRandomMixin(): MixinModifier {
  return ALL_MIXINS[Math.floor(Math.random() * ALL_MIXINS.length)]!
}
