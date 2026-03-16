// @ts-nocheck
/**
 * Strategy 6: Primary Color Corner
 *
 * Lock a primary color early and deny it from others.
 * After picking leader, aggressively draft all cards matching
 * the leader's PRIMARY color aspect.
 */

import { BaseStrategy, COLOR_ASPECTS } from '../BaseStrategy'
import type { StrategyContext } from '../BaseStrategy'
import type { RawCard } from '../../../utils/cardData'
import type { MixinModifier } from '../mixins'

export class PrimaryColorCornerStrategy extends BaseStrategy {
  constructor(mixin: MixinModifier | null = null) {
    super('primaryColorCorner', mixin)
  }

  // Very early commitment
  getYRange(): [number, number] { return [1, 3] }
  getXRange(): [number, number] { return [3, 5] }

  rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[] {
    return this.rankLeadersByPopularity(leaders, context)
  }

  adjustCardScore(card: RawCard, baseScore: number, context: StrategyContext): number {
    if (!this.committedLeader) return 0

    const primaryColor = this._getLeaderPrimaryColor(this.committedLeader)
    if (!primaryColor) return 0

    const cardAspects = card.aspects || []

    // Strong bonus for matching primary color
    if (cardAspects.includes(primaryColor)) {
      return 30  // Aggressively pick primary color cards
    }

    // Penalty for off-primary color (not just off-aspect)
    const leaderColors = this._getLeaderColors(this.committedLeader)
    const matchesAnyLeaderColor = cardAspects.some(a => leaderColors.includes(a))
    if (!matchesAnyLeaderColor && cardAspects.length > 0) {
      return -15  // Discourage off-color more than base strategy
    }

    return 0
  }
}
