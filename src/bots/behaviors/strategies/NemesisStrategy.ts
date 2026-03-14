// @ts-nocheck
/**
 * Strategy 4: Nemesis (Solo Mode Only)
 *
 * Counter-drafts the human player by predicting and blocking their picks.
 * Guesses what the human will want and denies them, while still building a valid deck.
 */

import { BaseStrategy, COLOR_ASPECTS } from '../BaseStrategy'
import type { StrategyContext } from '../BaseStrategy'
import type { RawCard } from '../../../utils/cardData'
import type { SetDraftStats } from '../../data/draftStats'
import type { MixinModifier } from '../mixins'

export class NemesisStrategy extends BaseStrategy {
  /** The human player's predicted leader (guessed from their history or popularity) */
  predictedHumanLeader: string | null
  /** The human player's predicted base color */
  predictedHumanBaseColor: string | null

  constructor(mixin: MixinModifier | null = null) {
    super('nemesis', mixin)
    this.predictedHumanLeader = null
    this.predictedHumanBaseColor = null
  }

  // Nemesis commits immediately
  getYRange(): [number, number] { return [1, 1] }
  getXRange(): [number, number] { return [1, 1] }

  rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[] {
    // Try to guess what the human would want and deny them
    const stats = context.draftStats || null

    // Check if we have per-user stats for the host
    if (stats?.segmentedLeaderStats?.specificUser) {
      const userLeaderStats = stats.segmentedLeaderStats.specificUser
      // Rank by what the human player picks most — deny their favorites
      return [...leaders].sort((a, b) => {
        const statA = userLeaderStats.get(a.name || '')
        const statB = userLeaderStats.get(b.name || '')
        const picksA = statA ? statA.timesPicked : -1
        const picksB = statB ? statB.timesPicked : -1
        return picksB - picksA
      })
    }

    // Fallback: rank by overall popularity (deny the most popular leaders)
    return this.rankLeadersByPopularity(leaders, context)
  }

  adjustCardScore(card: RawCard, baseScore: number, context: StrategyContext): number {
    const stats = context.draftStats || null
    let denialBonus = 0

    // Predict human's leader from their history or general popularity
    if (!this.predictedHumanLeader) {
      this._predictHumanChoices(stats)
    }

    if (!this.predictedHumanLeader) return 0

    // Check if this card would be good for the human's predicted deck
    const humanCardPop = this._getHumanCardPopularity(stats)
    if (humanCardPop) {
      const cardStat = humanCardPop.get(card.name || '')
      if (cardStat) {
        // Cards the human would pick early are higher-value denials
        denialBonus = Math.max(0, (14 - cardStat.avgPickPosition) * 2)
      }
    }

    // Check aspect match with human's predicted colors
    const cardAspects = card.aspects || []
    if (this.predictedHumanLeader) {
      // If card matches the human's predicted colors, it's a good denial
      // But only if it also fits our deck somewhat (win-win denial)
      const humanAspects = this._getPredictedHumanAspects()
      const matchesHuman = cardAspects.some(a => humanAspects.includes(a))

      if (matchesHuman) {
        // Good denial target
        const alseFitsUs = this.committedLeader
          ? this._countMatchingAspects(cardAspects, this._getLeaderColors(this.committedLeader)) > 0
          : true

        denialBonus += alseFitsUs ? 25 : 10  // Win-win denial is worth more
      }
    }

    return denialBonus
  }

  _predictHumanChoices(stats: SetDraftStats | null): void {
    // Use per-user stats if available
    if (stats?.segmentedLeaderStats?.specificUser) {
      const userStats = stats.segmentedLeaderStats.specificUser
      let bestLeader: string | null = null
      let bestPicks = 0
      for (const [name, stat] of userStats) {
        if (stat.timesPicked > bestPicks) {
          bestPicks = stat.timesPicked
          bestLeader = name
        }
      }
      this.predictedHumanLeader = bestLeader
    } else if (stats?.leaderStats) {
      // Fallback: most popular leader overall
      let bestLeader: string | null = null
      let bestPicks = 0
      for (const [name, stat] of stats.leaderStats) {
        if (stat.timesPicked > bestPicks) {
          bestPicks = stat.timesPicked
          bestLeader = name
        }
      }
      this.predictedHumanLeader = bestLeader
    }
  }

  _getHumanCardPopularity(stats: SetDraftStats | null): Map<string, { avgPickPosition: number }> | null {
    if (this.predictedHumanLeader && stats?.perLeaderCardStats?.byLeader) {
      return stats.perLeaderCardStats.byLeader.get(this.predictedHumanLeader) ?? null
    }
    return stats?.cardStats ?? null
  }

  _getPredictedHumanAspects(): string[] {
    // This is a rough guess — in reality we'd look at deck profiles
    // For now, return empty and rely on card popularity denial
    return []
  }

  reset(): void {
    super.reset()
    this.predictedHumanLeader = null
    this.predictedHumanBaseColor = null
  }
}
