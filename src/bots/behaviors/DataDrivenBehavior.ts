// @ts-nocheck
/**
 * Data-Driven Draft Behavior
 *
 * Uses real human draft data to make smarter picks:
 * 1. Leader draft: Pick by DB popularity (first-pick rates)
 * 2. Exploration (card picks 1-5): Best available, mild color preference, pick leader to play
 * 3. Committed (card picks 6+): Locked into leader + base color, draft toward target deck profile
 *
 * Falls back to hardcoded rankings and rarity-based scoring when no DB data available.
 */

import { POWERFUL_CARDS, POWERFUL_CARD_BONUS } from '../data/powerfulCards'
import { LEADER_RANKINGS } from '../data/leaderRankings'
import type { RawCard } from '../../utils/cardData'
import type { SetDraftStats, DeckProfile } from '../data/draftStats'

interface DraftContext {
  draftedLeaders?: RawCard[]
  draftedCards?: RawCard[]
  setCode?: string
  leaderRound?: number
  packNumber?: number
  pickInPack?: number
  draftStats?: SetDraftStats | null
}

// Color aspects (non-alignment)
const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

export class DataDrivenBehavior {
  name: string
  committedLeader: RawCard | null
  committedBaseColor: string | null

  constructor() {
    this.name = 'dataDriven'
    this.committedLeader = null
    this.committedBaseColor = null
  }

  // --- Leader Selection ---

  selectLeader(leaders: RawCard[], context: DraftContext = {}): RawCard | null {
    if (!leaders || leaders.length === 0) return null

    const setCode = context.setCode || this._inferSetCode(leaders)
    const stats = context.draftStats

    // If we have DB stats, rank by overall popularity (times picked)
    if (stats && stats.leaderStats.size > 0) {
      const sorted = [...leaders].sort((a, b) => {
        const statA = stats.leaderStats.get(a.name || '')
        const statB = stats.leaderStats.get(b.name || '')
        const picksA = statA ? statA.timesPicked : -1
        const picksB = statB ? statB.timesPicked : -1
        return picksB - picksA  // More popular = better
      })
      return sorted[0] ?? null
    }

    // Fallback: hardcoded rankings
    const rankings = LEADER_RANKINGS[setCode] || []
    const sorted = [...leaders].sort((a, b) => {
      const rankA = rankings.indexOf(a.name || '')
      const rankB = rankings.indexOf(b.name || '')
      const posA = rankA >= 0 ? rankA : 999
      const posB = rankB >= 0 ? rankB : 999
      return posA - posB
    })

    return sorted[0] ?? null
  }

  // --- Card Selection ---

  selectCard(pack: RawCard[], context: DraftContext = {}): RawCard | null {
    if (!pack || pack.length === 0) return null

    const draftedCards = context.draftedCards || []
    const draftedLeaders = context.draftedLeaders || []
    const stats = context.draftStats || null
    const cardPickNumber = draftedCards.length + 1  // 1-indexed

    // Commitment decisions
    if (!this.committedLeader && cardPickNumber > 5 && draftedLeaders.length > 0) {
      this._commitToLeader(draftedLeaders, draftedCards, stats)
    }
    if (!this.committedBaseColor && cardPickNumber > 14 && this.committedLeader) {
      this._commitToBaseColor(draftedCards, this._getLeaderColors(this.committedLeader), stats)
    }

    // Score all cards
    const scored = pack.map(card => ({
      card,
      score: this._scoreCard(card, draftedLeaders, draftedCards, cardPickNumber, stats, context),
    }))

    scored.sort((a, b) => b.score - a.score)
    return scored[0]?.card ?? null
  }

  // --- Scoring ---

  _scoreCard(
    card: RawCard,
    draftedLeaders: RawCard[],
    draftedCards: RawCard[],
    cardPickNumber: number,
    stats: SetDraftStats | null,
    context: DraftContext
  ): number {
    const isCommitted = this.committedLeader !== null
    const isFullyCommitted = this.committedBaseColor !== null

    // Weights change based on phase
    let qualityWeight: number, colorWeight: number, needWeight: number
    if (!isCommitted) {
      // Exploration phase (picks 1-5)
      qualityWeight = 1.0
      colorWeight = 0.6
      needWeight = 0.0
    } else {
      // Committed phase (picks 6+)
      qualityWeight = 0.6
      colorWeight = 1.0
      // Need weight increases from 0.4 to 0.8 as draft progresses
      needWeight = 0.4 + 0.4 * (cardPickNumber / 42)
    }

    const qualityScore = this._calculateQualityScore(card, stats, context)
    const colorScore = this._calculateColorScore(card, draftedLeaders, isFullyCommitted)
    const needScore = isCommitted
      ? this._calculateNeedScore(card, draftedCards, stats)
      : 0

    return qualityScore * qualityWeight
         + colorScore * colorWeight
         + needScore * needWeight
  }

  /**
   * Quality score (0-100) based on DB avg pick position, or rarity fallback
   */
  _calculateQualityScore(card: RawCard, stats: SetDraftStats | null, context: DraftContext): number {
    // Try DB stats first
    if (stats && stats.cardStats.size > 0) {
      const cardStat = stats.cardStats.get(card.name || '')
      if (cardStat) {
        // Position 1 -> 100, Position 14 -> ~0
        return Math.max(0, 100 - (cardStat.avgPickPosition - 1) * (100 / 13))
      }
    }

    // Fallback: rarity-based scoring
    const rarityScores: Record<string, number> = {
      'Legendary': 80,
      'Rare': 55,
      'Uncommon': 30,
      'Common': 15,
    }
    let score = rarityScores[card.rarity || ''] || 10

    // Powerful card bonus (if in-color or neutral — checked loosely here)
    const setCode = context.setCode || card.set || 'SOR'
    const powerfulCardsForSet = POWERFUL_CARDS[setCode] || []
    if (powerfulCardsForSet.includes(card.name || '')) {
      score += POWERFUL_CARD_BONUS
    }

    return score
  }

  /**
   * Color score (-40 to +100) based on aspect match with drafted leaders
   */
  _calculateColorScore(card: RawCard, draftedLeaders: RawCard[], isFullyCommitted: boolean): number {
    const cardAspects = card.aspects || []

    if (isFullyCommitted && this.committedLeader) {
      // Fully committed: strong preference for committed colors
      const leaderColors = this._getLeaderColors(this.committedLeader)
      const leaderMatch = this._countMatchingAspects(cardAspects, leaderColors)

      if (leaderMatch > 0) {
        return 50 * leaderMatch  // +50 per matching leader aspect
      }
      if (this.committedBaseColor && cardAspects.includes(this.committedBaseColor)) {
        return 40  // Base color match
      }
      if (cardAspects.length === 0) {
        return 15  // Neutral
      }
      return -40  // Off-color penalty
    }

    // Exploration phase: mild color preference across all drafted leaders
    if (draftedLeaders.length === 0) {
      return cardAspects.length === 0 ? 15 : 10  // No leaders yet, slight neutral bonus
    }

    const allLeaderColors = this._getColorsFromLeaders(draftedLeaders)
    const inColorCount = this._countMatchingAspects(cardAspects, allLeaderColors)

    if (inColorCount > 0) {
      return 40 * inColorCount  // +40 per matching aspect
    }
    if (cardAspects.length === 0) {
      return 15  // Neutral
    }
    return 5  // Off-color but stay open
  }

  /**
   * Need score (0-100) based on deck profile targets.
   * Only applies after leader commitment.
   */
  _calculateNeedScore(card: RawCard, draftedCards: RawCard[], stats: SetDraftStats | null): number {
    if (!this.committedLeader) return 0

    const profile = stats?.deckProfiles.get(this.committedLeader.name || '')
    if (!profile) {
      // No profile: basic type preference (units > events > upgrades)
      if (card.type === 'Unit') return 30
      if (card.type === 'Event') return 15
      if (card.type === 'Upgrade') return 10
      return 5
    }

    let need = 0
    const myCards = draftedCards.filter(c => !c.isLeader && !c.isBase)
    const myTotal = Math.max(myCards.length, 1)

    // Type need: if pool is below target ratio for this card type
    const targetDeckSize = 30
    const typeTargets: Record<string, number> = {
      'Unit': profile.avgUnits / targetDeckSize,
      'Upgrade': profile.avgUpgrades / targetDeckSize,
      'Event': profile.avgEvents / targetDeckSize,
    }
    const targetRatio = typeTargets[card.type || ''] || 0
    const currentTypeCount = myCards.filter(c => c.type === card.type).length
    const currentRatio = currentTypeCount / myTotal
    const typeDeficit = Math.max(0, targetRatio - currentRatio)
    need += typeDeficit * 80

    // Curve need: if pool is below target at this card's cost
    const costBucket = Math.min(card.cost || 0, 7)
    const targetCostRatio = (profile.avgCostCurve[costBucket] || 0) / targetDeckSize
    const currentCostCount = myCards.filter(c => Math.min(c.cost || 0, 7) === costBucket).length
    const currentCostRatio = currentCostCount / myTotal
    const costDeficit = Math.max(0, targetCostRatio - currentCostRatio)
    need += costDeficit * 80

    // Archetype bonus: if this card appears frequently in decks with this leader
    const frequency = profile.cardFrequency.get(card.name || '') || 0
    if (frequency > 0.4) need += 20
    else if (frequency > 0.2) need += 10

    return Math.min(need, 100)
  }

  // --- Commitment Decisions ---

  /**
   * Choose which drafted leader to build around (called at pick 5+)
   */
  _commitToLeader(draftedLeaders: RawCard[], draftedCards: RawCard[], stats: SetDraftStats | null): void {
    if (draftedLeaders.length === 0) return
    if (draftedLeaders.length === 1) {
      this.committedLeader = draftedLeaders[0]!
      return
    }

    let bestLeader: RawCard | null = null
    let bestScore = -1

    for (const leader of draftedLeaders) {
      const leaderColors = this._getLeaderColors(leader)
      let score = 0

      // Count in-color drafted cards
      for (const card of draftedCards) {
        if (this._countMatchingAspects(card.aspects || [], leaderColors) > 0) {
          score++
        }
      }

      // Factor in leader popularity from DB stats (overall pick count)
      const leaderStat = stats?.leaderStats.get(leader.name || '')
      if (leaderStat) {
        score += Math.min(leaderStat.timesPicked / 10, 5)
      }

      if (score > bestScore) {
        bestScore = score
        bestLeader = leader
      }
    }

    this.committedLeader = bestLeader || draftedLeaders[0]!
  }

  /**
   * Choose the base color (called after pack 1, pick 14+)
   */
  _commitToBaseColor(draftedCards: RawCard[], leaderColors: string[], stats: SetDraftStats | null): void {
    const colorWeights: Record<string, number> = {}

    for (const card of draftedCards) {
      for (const aspect of (card.aspects || [])) {
        if (COLOR_ASPECTS.includes(aspect) && !leaderColors.includes(aspect)) {
          // Higher weight for cards with better pick position
          const quality = stats?.cardStats.get(card.name || '')?.avgPickPosition || 7
          colorWeights[aspect] = (colorWeights[aspect] || 0) + (15 - quality)
        }
      }
    }

    // Bonus from deck profile data
    const profile = stats?.deckProfiles.get(this.committedLeader?.name || '')
    if (profile?.baseAspects) {
      for (const [aspect, count] of Object.entries(profile.baseAspects)) {
        if (aspect in colorWeights) {
          colorWeights[aspect] = (colorWeights[aspect] || 0) + count * 2
        }
      }
    }

    // Pick the aspect with the highest weight
    let bestAspect: string | null = null
    let bestWeight = -1
    for (const [aspect, weight] of Object.entries(colorWeights)) {
      if (weight > bestWeight) {
        bestWeight = weight
        bestAspect = aspect
      }
    }

    // Fallback: pick a random non-leader color
    if (!bestAspect) {
      const missing = COLOR_ASPECTS.filter(c => !leaderColors.includes(c))
      bestAspect = missing.length > 0
        ? missing[Math.floor(Math.random() * missing.length)]!
        : null
    }

    this.committedBaseColor = bestAspect
  }

  // --- Helpers ---

  _getLeaderColors(leader: RawCard): string[] {
    const colors: string[] = []
    for (const aspect of (leader.aspects || [])) {
      if (COLOR_ASPECTS.includes(aspect) || aspect === 'Heroism' || aspect === 'Villainy') {
        colors.push(aspect)
      }
    }
    return colors
  }

  _getColorsFromLeaders(leaders: RawCard[]): string[] {
    const colors = new Set<string>()
    for (const leader of leaders) {
      for (const aspect of (leader.aspects || [])) {
        if (COLOR_ASPECTS.includes(aspect) || aspect === 'Heroism' || aspect === 'Villainy') {
          colors.add(aspect)
        }
      }
    }
    return Array.from(colors)
  }

  _countMatchingAspects(cardAspects: string[], targetColors: string[]): number {
    return cardAspects.filter(a => targetColors.includes(a)).length
  }

  _inferSetCode(cards: RawCard[]): string {
    if (!cards || cards.length === 0) return 'SOR'
    const firstCard = cards[0]
    if (!firstCard) return 'SOR'
    if (firstCard.set) return firstCard.set
    if (firstCard.id) {
      const match = firstCard.id.match(/^([A-Z]+)-/)
      if (match) return match[1] ?? 'SOR'
    }
    return 'SOR'
  }

  reset(): void {
    this.committedLeader = null
    this.committedBaseColor = null
  }
}
