// @ts-nocheck
/**
 * Strategy 5: Diversity
 *
 * Maximize aspect diversity in leaders, then draft best available.
 * Stays flexible longer, picks broadly, then commits late to the best color pair.
 */

import { BaseStrategy, COLOR_ASPECTS, ALIGNMENT_ASPECTS } from '../BaseStrategy'
import type { StrategyContext } from '../BaseStrategy'
import type { RawCard } from '../../../utils/cardData'
import type { MixinModifier } from '../mixins'

export class DiversityStrategy extends BaseStrategy {
  constructor(mixin: MixinModifier | null = null) {
    super('diversity', mixin)
  }

  // Late commitment — stays flexible
  getYRange(): [number, number] { return [8, 12] }
  getXRange(): [number, number] { return [10, 14] }

  rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[] {
    const draftedLeaders = context.draftedLeaders || []
    const leaderRound = context.leaderRound || 1

    if (leaderRound === 1 || draftedLeaders.length === 0) {
      // Round 1: pick the most popular leader
      return this.rankLeadersByPopularity(leaders, context)
    }

    // Rounds 2-3: pick leaders that maximize aspect diversity
    const draftedAspects = new Set<string>()
    for (const leader of draftedLeaders) {
      for (const aspect of (leader.aspects || [])) {
        draftedAspects.add(aspect)
      }
    }

    return [...leaders].sort((a, b) => {
      const aNewAspects = (a.aspects || []).filter(asp => !draftedAspects.has(asp)).length
      const bNewAspects = (b.aspects || []).filter(asp => !draftedAspects.has(asp)).length

      // Prefer leaders that add the most new aspects
      if (aNewAspects !== bNewAspects) {
        return bNewAspects - aNewAspects
      }

      // Tiebreak: popularity
      const stats = context.draftStats || null
      const leaderPop = this.getLeaderPopularity(stats)
      if (leaderPop) {
        const picksA = leaderPop.get(a.name || '')?.timesPicked ?? 0
        const picksB = leaderPop.get(b.name || '')?.timesPicked ?? 0
        return picksB - picksA
      }

      return 0
    })
  }

  adjustCardScore(card: RawCard, baseScore: number, context: StrategyContext): number {
    // Before commitment, just draft the best cards by popularity regardless of color
    // This is handled by the base strategy's exploration phase weights being dominant
    // No additional adjustment needed — the late Y/X handles flexibility
    return 0
  }
}
