// @ts-nocheck
/**
 * Strategy 2: Tournament Player
 *
 * Draft like tournament competitors.
 * Uses popularity data filtered to tournament player IDs.
 */

import { BaseStrategy } from '../BaseStrategy'
import type { StrategyContext } from '../BaseStrategy'
import type { RawCard } from '../../../utils/cardData'
import type { SetDraftStats } from '../../data/draftStats'
import type { MixinModifier } from '../mixins'

export class TournamentPlayerStrategy extends BaseStrategy {
  constructor(mixin: MixinModifier | null = null) {
    super('tournamentPlayer', mixin)
  }

  getYRange(): [number, number] { return [3, 8] }
  getXRange(): [number, number] { return [8, 13] }

  rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[] {
    return this.rankLeadersByPopularity(leaders, context)
  }

  getLeaderPopularity(stats: SetDraftStats | null) {
    return stats?.segmentedLeaderStats?.tournamentPlayers ?? stats?.leaderStats ?? null
  }

  getCardPopularity(stats: SetDraftStats | null) {
    return stats?.segmentedCardStats?.tournamentPlayers ?? stats?.cardStats ?? null
  }
}
