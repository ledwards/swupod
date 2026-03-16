// @ts-nocheck
/**
 * Strategy 3: All Player
 *
 * Draft by community consensus.
 * Uses overall popularity data (current default behavior).
 */

import { BaseStrategy } from '../BaseStrategy'
import type { StrategyContext } from '../BaseStrategy'
import type { RawCard } from '../../../utils/cardData'
import type { SetDraftStats } from '../../data/draftStats'
import type { MixinModifier } from '../mixins'

export class AllPlayerStrategy extends BaseStrategy {
  constructor(mixin: MixinModifier | null = null) {
    super('allPlayer', mixin)
  }

  getYRange(): [number, number] { return [2, 5] }
  getXRange(): [number, number] { return [5, 8] }

  rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[] {
    return this.rankLeadersByPopularity(leaders, context)
  }

  // Uses default leaderStats and cardStats (all players) — no override needed
}
