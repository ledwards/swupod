// @ts-nocheck
/**
 * Strategy 1: Top Player
 *
 * Draft like the best players do.
 * Uses popularity data filtered to top players (top_players table).
 */

import { BaseStrategy } from '../BaseStrategy'
import type { StrategyContext } from '../BaseStrategy'
import type { RawCard } from '../../../utils/cardData'
import type { SetDraftStats } from '../../data/draftStats'
import type { MixinModifier } from '../mixins'

export class TopPlayerStrategy extends BaseStrategy {
  constructor(mixin: MixinModifier | null = null) {
    super('topPlayer', mixin)
  }

  getYRange(): [number, number] { return [2, 5] }
  getXRange(): [number, number] { return [5, 8] }

  rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[] {
    return this.rankLeadersByPopularity(leaders, context)
  }

  getLeaderPopularity(stats: SetDraftStats | null) {
    return stats?.segmentedLeaderStats?.topPlayers ?? stats?.leaderStats ?? null
  }

  getCardPopularity(stats: SetDraftStats | null) {
    return stats?.segmentedCardStats?.topPlayers ?? stats?.cardStats ?? null
  }
}
