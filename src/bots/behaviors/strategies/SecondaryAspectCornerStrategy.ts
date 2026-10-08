// @ts-nocheck
/**
 * Strategy 7: Secondary Aspect Corner
 *
 * Lock hero/villain alignment early and deny it from others.
 * Heavily prioritize cards matching the leader's alignment (Heroism or Villainy),
 * then lock base color based on which primary color has the best aligned cards.
 */

import { BaseStrategy, ALIGNMENT_ASPECTS, COLOR_ASPECTS } from '../BaseStrategy'
import type { StrategyContext } from '../BaseStrategy'
import type { RawCard } from '../../../utils/cardData'
import type { MixinModifier } from '../mixins'

export class SecondaryAspectCornerStrategy extends BaseStrategy {
  constructor(mixin: MixinModifier | null = null) {
    super('secondaryAspectCorner', mixin)
  }

  // Very early commitment
  getYRange(): [number, number] { return [1, 3] }
  getXRange(): [number, number] { return [3, 6] }

  rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[] {
    return this.rankLeadersByPopularity(leaders, context)
  }

  adjustCardScore(card: RawCard, baseScore: number, context: StrategyContext): number {
    if (!this.committedLeader) return 0

    const alignment = this._getLeaderAlignment(this.committedLeader)
    if (!alignment) return 0

    const cardAspects = card.aspects || []
    const leaderColors = this._getLeaderColors(this.committedLeader)
    const matchesLeaderColor = cardAspects.some(a => leaderColors.includes(a))
    const matchesBaseColor = this.committedBaseColor
      ? cardAspects.includes(this.committedBaseColor)
      : false

    // Same-alignment cards are best when they also stay inside the leader/base lane.
    // Otherwise this strategy over-drafts aligned off-color cards that never make the deck.
    if (cardAspects.includes(alignment)) {
      if (matchesLeaderColor) return 25
      if (matchesBaseColor) return 18
      if (!this.committedBaseColor) return 8
      return -12
    }

    // Cards with the WRONG alignment are very bad
    const oppositeAlignment = alignment === 'Heroism' ? 'Villainy' : 'Heroism'
    if (cardAspects.includes(oppositeAlignment)) {
      return -30  // Strongly discourage wrong alignment
    }

    return 0
  }
}
