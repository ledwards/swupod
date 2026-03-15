// @ts-nocheck
/**
 * Base Strategy for Draft Bots
 *
 * Abstract base class that all draft strategies inherit from.
 * Provides shared scoring (quality/color/need/synergy), deck constraints,
 * LAW splash logic, and aspect penalty integration.
 *
 * Subclasses override:
 * - rankLeaders(leaders, context) — strategy-specific leader ranking
 * - getYRange() → [min, max] — turn range for mental leader pick
 * - getXRange() → [min, max] — turn range for mental base pick
 * - adjustCardScore(card, baseScore, context) — strategy-specific score adjustments
 * - getPopularityData(stats) — which segment's data to use
 */

import { POWERFUL_CARDS, POWERFUL_CARD_BONUS } from '../data/powerfulCards'
import { LEADER_RANKINGS } from '../data/leaderRankings'
import { calculateAspectPenalty, leaderIgnoresPenalty } from '../../services/cards/aspectPenalties'
import type { RawCard } from '../../utils/cardData'
import type { SetDraftStats, DeckProfile, SegmentedLeaderStats, PerLeaderCardStats } from '../data/draftStats'
import type { MixinModifier } from './mixins'

// Color aspects (non-alignment)
const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const ALIGNMENT_ASPECTS = ['Heroism', 'Villainy']

export interface StrategyContext {
  draftedLeaders?: RawCard[]
  draftedCards?: RawCard[]
  setCode?: string
  leaderRound?: number
  packNumber?: number
  pickInPack?: number
  draftStats?: SetDraftStats | null
  isSolo?: boolean
  hostUserId?: string
}

export interface CardScore {
  card: RawCard
  score: number
}

export abstract class BaseStrategy {
  name: string
  strategyName: string
  committedLeader: RawCard | null
  committedBaseColor: string | null
  mentalLeaderPickTurn: number  // Y — when bot decides which leader to play
  mentalBasePickTurn: number    // X — when bot decides base color
  mixin: MixinModifier | null
  pickCount: number

  constructor(strategyName: string, mixin: MixinModifier | null = null) {
    this.name = 'strategy'
    this.strategyName = strategyName
    this.committedLeader = null
    this.committedBaseColor = null
    this.mixin = mixin
    this.pickCount = 0

    // Determine Y and X turns (with mixin adjustments)
    const [yMin, yMax] = this.getYRange()
    const [xMin, xMax] = this.getXRange()

    let yOffset = 0
    let xOffset = 0
    if (mixin) {
      yOffset = mixin.commitmentOffset || 0
      xOffset = mixin.commitmentOffset || 0
    }

    this.mentalLeaderPickTurn = randomInRange(yMin + yOffset, yMax + yOffset)
    this.mentalBasePickTurn = randomInRange(xMin + xOffset, xMax + xOffset)

    // Clamp to valid ranges
    this.mentalLeaderPickTurn = Math.max(1, Math.min(this.mentalLeaderPickTurn, 42))
    this.mentalBasePickTurn = Math.max(this.mentalLeaderPickTurn + 1, Math.min(this.mentalBasePickTurn, 42))
  }

  // --- Abstract Methods (subclasses must implement) ---

  /** Strategy-specific leader ranking. Return sorted best-first. */
  abstract rankLeaders(leaders: RawCard[], context: StrategyContext): RawCard[]

  /** Turn range [min, max] for Y (mental leader pick) */
  abstract getYRange(): [number, number]

  /** Turn range [min, max] for X (mental base pick) */
  abstract getXRange(): [number, number]

  /** Strategy-specific card score adjustments. Return delta to add to base score. */
  adjustCardScore(card: RawCard, baseScore: number, context: StrategyContext): number {
    return 0
  }

  /** Which popularity segment to use from stats. Override per strategy. */
  getLeaderPopularity(stats: SetDraftStats | null): Map<string, { timesPicked: number }> | null {
    return stats?.leaderStats ?? null
  }

  /** Get card popularity data for scoring. Override per strategy for segment filtering. */
  getCardPopularity(stats: SetDraftStats | null): Map<string, { avgPickPosition: number; timesPicked: number }> | null {
    return stats?.cardStats ?? null
  }

  /** Get per-leader card stats for synergy scoring */
  getPerLeaderCardStats(stats: SetDraftStats | null): PerLeaderCardStats | null {
    return stats?.perLeaderCardStats ?? null
  }

  // --- Leader Selection ---

  selectLeader(leaders: RawCard[], context: StrategyContext = {}): RawCard | null {
    if (!leaders || leaders.length === 0) return null

    // Filter out leaders with opposing alignment to already-drafted leaders
    const draftedLeaders = context.draftedLeaders || []
    const draftedAlignment = this._getDraftedAlignment(draftedLeaders)
    const eligible = draftedAlignment
      ? leaders.filter(l => {
          const alignment = (l.aspects || []).find(a => ALIGNMENT_ASPECTS.includes(a))
          return !alignment || alignment === draftedAlignment
        })
      : leaders

    const ranked = this.rankLeaders(eligible.length > 0 ? eligible : leaders, context)
    return ranked[0] ?? null
  }

  /** Get the alignment (Heroism/Villainy) from already-drafted leaders, if consistent */
  _getDraftedAlignment(draftedLeaders: RawCard[]): string | null {
    for (const leader of draftedLeaders) {
      const alignment = (leader.aspects || []).find(a => ALIGNMENT_ASPECTS.includes(a))
      if (alignment) return alignment
    }
    return null
  }

  // --- Card Selection ---

  selectCard(pack: RawCard[], context: StrategyContext = {}): RawCard | null {
    if (!pack || pack.length === 0) return null

    const draftedCards = context.draftedCards || []
    const draftedLeaders = context.draftedLeaders || []
    const stats = context.draftStats || null
    this.pickCount = draftedCards.length + 1

    // Commitment decisions based on Y and X turns
    if (!this.committedLeader && this.pickCount >= this.mentalLeaderPickTurn && draftedLeaders.length > 0) {
      this._commitToLeader(draftedLeaders, draftedCards, stats)
    }
    if (!this.committedBaseColor && this.pickCount >= this.mentalBasePickTurn && this.committedLeader) {
      this._commitToBaseColor(draftedCards, this._getLeaderColors(this.committedLeader), stats)
    }

    // Score all cards
    const scored = pack.map(card => ({
      card,
      score: this._scoreCard(card, draftedLeaders, draftedCards, this.pickCount, stats, context),
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
    context: StrategyContext
  ): number {
    const isCommitted = this.committedLeader !== null
    const isFullyCommitted = this.committedBaseColor !== null

    // Base weights
    let qualityWeight = 1.0
    let colorWeight = 0.6
    let needWeight = 0.0
    let synergyWeight = 0.0

    if (!isCommitted) {
      qualityWeight = 1.0
      colorWeight = 0.6
      needWeight = 0.0
      synergyWeight = 0.0
    } else {
      qualityWeight = 0.6
      colorWeight = 1.0
      needWeight = 0.4 + 0.4 * (cardPickNumber / 42)
      synergyWeight = 0.4
    }

    // Apply mixin weight adjustments
    if (this.mixin) {
      if (!isCommitted) {
        colorWeight *= (1.0 + (this.mixin.preCommitColorMultiplier || 0))
        qualityWeight *= (1.0 + (this.mixin.preCommitQualityMultiplier || 0))
      } else {
        synergyWeight *= (1.0 + (this.mixin.postCommitSynergyMultiplier || 0))
        colorWeight *= (1.0 + (this.mixin.postCommitColorMultiplier || 0))
      }
      qualityWeight *= (1.0 + (this.mixin.qualityMultiplier || 0))
      needWeight *= (1.0 + (this.mixin.needMultiplier || 0))
    }

    const qualityScore = this._calculateQualityScore(card, stats, context)
    const colorScore = this._calculateColorScore(card, draftedLeaders, isFullyCommitted, context)
    const needScore = isCommitted ? this._calculateNeedScore(card, draftedCards, stats) : 0
    const synergyScore = isCommitted ? this._calculateSynergyScore(card, stats, context) : 0

    let totalScore = qualityScore * qualityWeight
      + colorScore * colorWeight
      + needScore * needWeight
      + synergyScore * synergyWeight

    // LAW splash rule: in LAW, allow a few off-aspect bombs
    totalScore += this._calculateLAWSplashBonus(card, draftedCards, context)

    // Rare bases are almost never worth picking — bots should stick to common bases
    if (card.isBase && card.rarity !== 'Common') {
      totalScore -= 500
    }

    // Strategy-specific adjustments
    totalScore += this.adjustCardScore(card, totalScore, context)

    return totalScore
  }

  /**
   * Quality score (0-100) based on popularity data or rarity fallback.
   * After Y, uses per-leader popularity. After X, uses per-leader+base.
   */
  _calculateQualityScore(card: RawCard, stats: SetDraftStats | null, context: StrategyContext): number {
    // After commitment, try leader-specific card popularity
    if (this.committedLeader && stats?.perLeaderCardStats) {
      const leaderName = this.committedLeader.name || ''
      const leaderCardStats = stats.perLeaderCardStats.byLeader?.get(leaderName)

      // After base commitment, try leader+base specific
      if (this.committedBaseColor && stats.perLeaderCardStats.byLeaderAndBase) {
        const key = `${leaderName}|${this.committedBaseColor}`
        const leaderBaseStats = stats.perLeaderCardStats.byLeaderAndBase.get(key)
        if (leaderBaseStats) {
          const cardStat = leaderBaseStats.get(card.name || '')
          if (cardStat) {
            return Math.max(0, 100 - (cardStat.avgPickPosition - 1) * (100 / 13))
          }
        }
      }

      // Fall back to leader-only popularity
      if (leaderCardStats) {
        const cardStat = leaderCardStats.get(card.name || '')
        if (cardStat) {
          return Math.max(0, 100 - (cardStat.avgPickPosition - 1) * (100 / 13))
        }
      }
    }

    // Use segment-specific card popularity
    const cardPopularity = this.getCardPopularity(stats)
    if (cardPopularity && cardPopularity.size > 0) {
      const cardStat = cardPopularity.get(card.name || '')
      if (cardStat) {
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

    // Powerful card bonus
    const setCode = context.setCode || card.set || 'SOR'
    const powerfulCardsForSet = POWERFUL_CARDS[setCode] || []
    if (powerfulCardsForSet.includes(card.name || '')) {
      score += POWERFUL_CARD_BONUS
    }

    return score
  }

  /**
   * Color score (-200 to +100) based on aspect match with committed leader/base.
   * Off-aspect cards get a harsh penalty (-200) to prevent inclusion in decks.
   * During drafting (pre-commitment), penalties are mild to keep options open.
   */
  _calculateColorScore(
    card: RawCard,
    draftedLeaders: RawCard[],
    isFullyCommitted: boolean,
    context: StrategyContext
  ): number {
    const cardAspects = card.aspects || []

    if (isFullyCommitted && this.committedLeader) {
      const leaderColors = this._getLeaderColors(this.committedLeader)

      // Wrong alignment is an absolute ban — Heroism cards never go in Villainy decks
      const leaderAlignment = this._getLeaderAlignment(this.committedLeader)
      if (leaderAlignment) {
        const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism' : 'Villainy'
        if (cardAspects.includes(opposingAlignment)) {
          return -10000
        }
      }

      // Only match on COLOR aspects — alignment matching doesn't reduce aspect penalties
      const leaderMatch = this._countMatchingAspects(cardAspects, leaderColors)

      if (leaderMatch > 0) {
        return 50 * leaderMatch
      }
      if (this.committedBaseColor && cardAspects.includes(this.committedBaseColor)) {
        return 40
      }
      if (cardAspects.length === 0) {
        return 15  // Neutral
      }
      // Harsh off-aspect penalty — these cards require paying extra resources
      // and should almost never make the deck cut.
      // Must be large enough that even the best quality score can't overcome it.
      return -500
    }

    // Exploration phase: prefer in-color, penalize off-color
    if (draftedLeaders.length === 0) {
      return cardAspects.length === 0 ? 15 : 10
    }

    const allLeaderColors = this._getColorsFromLeaders(draftedLeaders)

    // Even during exploration, NEVER draft opposing alignment cards
    const draftedAlignment = this._getDraftedAlignment(draftedLeaders)
    if (draftedAlignment) {
      const opposingAlignment = draftedAlignment === 'Villainy' ? 'Heroism' : 'Villainy'
      if (cardAspects.includes(opposingAlignment)) {
        return -10000
      }
    }

    const inColorCount = this._countMatchingAspects(cardAspects, allLeaderColors)

    if (inColorCount > 0) {
      return 40 * inColorCount
    }
    if (cardAspects.length === 0) {
      return 15  // Neutral
    }
    // Off-color penalty must be strong enough that quality scores can't overcome it.
    // Quality scores range 0-150, colorWeight is 0.6 in exploration.
    // -150 * 0.6 = -90, which beats most quality bonuses.
    return -150
  }

  /**
   * Need score (0-100) based on deck profile targets.
   */
  _calculateNeedScore(card: RawCard, draftedCards: RawCard[], stats: SetDraftStats | null): number {
    if (!this.committedLeader) return 0

    const profile = stats?.deckProfiles.get(this.committedLeader.name || '')
    if (!profile) {
      if (card.type === 'Unit') return 30
      if (card.type === 'Event') return 15
      if (card.type === 'Upgrade') return 10
      return 5
    }

    let need = 0
    const myCards = draftedCards.filter(c => !c.isLeader && !c.isBase)
    const myTotal = Math.max(myCards.length, 1)

    // Type need
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

    // Curve need
    const costBucket = Math.min(card.cost || 0, 7)
    const targetCostRatio = (profile.avgCostCurve[costBucket] || 0) / targetDeckSize
    const currentCostCount = myCards.filter(c => Math.min(c.cost || 0, 7) === costBucket).length
    const currentCostRatio = currentCostCount / myTotal
    const costDeficit = Math.max(0, targetCostRatio - currentCostRatio)
    need += costDeficit * 80

    // Archetype bonus
    const frequency = profile.cardFrequency.get(card.name || '') || 0
    if (frequency > 0.4) need += 20
    else if (frequency > 0.2) need += 10

    return Math.min(need, 100)
  }

  /**
   * Synergy score (0-50) — how well does this card synergize with committed leader?
   * Uses card synergy delta (overall popularity vs leader-specific popularity)
   * and leader trait affinity.
   */
  _calculateSynergyScore(card: RawCard, stats: SetDraftStats | null, context: StrategyContext): number {
    if (!this.committedLeader) return 0

    let synergy = 0

    // Card synergy delta: compare overall popularity vs popularity-with-this-leader
    if (stats?.perLeaderCardStats?.byLeader && stats?.cardStats) {
      const leaderName = this.committedLeader.name || ''
      const leaderCardStats = stats.perLeaderCardStats.byLeader.get(leaderName)
      if (leaderCardStats) {
        const overallStat = stats.cardStats.get(card.name || '')
        const leaderStat = leaderCardStats.get(card.name || '')
        if (overallStat && leaderStat) {
          // If card is picked earlier with this leader than overall, it's synergistic
          const delta = overallStat.avgPickPosition - leaderStat.avgPickPosition
          synergy += Math.max(0, delta * 3)  // +3 per position improvement
        }
      }
    }

    // Leader trait synergy: check if leader text mentions a trait this card has
    const leaderTraitBonus = this._checkLeaderTraitSynergy(card, this.committedLeader)
    synergy += leaderTraitBonus

    return Math.min(synergy, 50)
  }

  /**
   * Check if the leader has trait synergy with the card.
   * If leader's text mentions a trait that the card has, bonus.
   */
  _checkLeaderTraitSynergy(card: RawCard, leader: RawCard): number {
    const leaderText = (leader.text || '').toUpperCase()
    const cardTraits = card.traits || []

    for (const trait of cardTraits) {
      if (leaderText.includes(trait.toUpperCase())) {
        return 15  // Significant bonus for trait match
      }
    }
    return 0
  }

  /**
   * LAW splash bonus: in LAW, allow 3-5 off-aspect bombs
   * that are exactly ONE primary color out of aspect.
   */
  _calculateLAWSplashBonus(card: RawCard, draftedCards: RawCard[], context: StrategyContext): number {
    const setCode = context.setCode || card.set || 'SOR'
    if (setCode !== 'LAW') return 0
    if (!this.committedLeader) return 0

    const cardAspects = card.aspects || []
    if (cardAspects.length === 0) return 0  // Neutral, no splash needed

    const leaderColors = this._getLeaderColors(this.committedLeader)
    const allMyColors = this.committedBaseColor
      ? [...leaderColors, this.committedBaseColor]
      : leaderColors

    // Count how many of this card's aspects are out of our colors
    let outOfAspectCount = 0
    let wrongAlignment = false

    for (const aspect of cardAspects) {
      if (ALIGNMENT_ASPECTS.includes(aspect)) {
        // Check alignment match
        if (!allMyColors.includes(aspect)) {
          wrongAlignment = true
        }
      } else if (COLOR_ASPECTS.includes(aspect)) {
        if (!allMyColors.includes(aspect)) {
          outOfAspectCount++
        }
      }
    }

    // Only splash if exactly ONE primary color out, not wrong alignment
    if (wrongAlignment || outOfAspectCount !== 1) return 0

    // Count existing off-aspect cards in pool
    const currentOffAspect = draftedCards.filter(c => {
      const ca = c.aspects || []
      return ca.some(a => COLOR_ASPECTS.includes(a) && !allMyColors.includes(a))
    }).length

    if (currentOffAspect >= 5) return 0  // Already at max splash

    // Counteract the -500 off-aspect penalty for valid LAW splashes.
    // Common bases in LAW provide a third color, so off-by-one-primary cards
    // can be played with only +2 cost penalty — worth it for bombs.
    const splashBase = 480  // Mostly negates the -500, making them slightly negative baseline

    // Only splash high-quality cards
    const powerfulCardsForSet = POWERFUL_CARDS[setCode] || []
    if (powerfulCardsForSet.includes(card.name || '')) {
      return splashBase + 40  // Powerful cards splash easily
    }

    // Splash rares and legendaries
    if (card.rarity === 'Legendary' || card.rarity === 'Rare') {
      return splashBase + 20
    }

    // Uncommons can splash if they're decent
    if (card.rarity === 'Uncommon') {
      return splashBase
    }

    return 0  // Don't splash commons
  }

  // --- Commitment Decisions ---

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

      for (const card of draftedCards) {
        if (this._countMatchingAspects(card.aspects || [], leaderColors) > 0) {
          score++
        }
      }

      // Factor in popularity from this strategy's segment
      const leaderPop = this.getLeaderPopularity(stats)
      if (leaderPop) {
        const stat = leaderPop.get(leader.name || '')
        if (stat) {
          score += Math.min(stat.timesPicked / 10, 5)
        }
      }

      if (score > bestScore) {
        bestScore = score
        bestLeader = leader
      }
    }

    this.committedLeader = bestLeader || draftedLeaders[0]!
  }

  _commitToBaseColor(draftedCards: RawCard[], leaderColors: string[], stats: SetDraftStats | null): void {
    const colorWeights: Record<string, number> = {}

    for (const card of draftedCards) {
      for (const aspect of (card.aspects || [])) {
        if (COLOR_ASPECTS.includes(aspect) && !leaderColors.includes(aspect)) {
          const cardPop = this.getCardPopularity(stats)
          const quality = cardPop?.get(card.name || '')?.avgPickPosition || 7
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

    let bestAspect: string | null = null
    let bestWeight = -1
    for (const [aspect, weight] of Object.entries(colorWeights)) {
      if (weight > bestWeight) {
        bestWeight = weight
        bestAspect = aspect
      }
    }

    if (!bestAspect) {
      const missing = COLOR_ASPECTS.filter(c => !leaderColors.includes(c))
      bestAspect = missing.length > 0
        ? missing[Math.floor(Math.random() * missing.length)]!
        : null
    }

    this.committedBaseColor = bestAspect
  }

  // --- Default Leader Ranking (popularity-based) ---

  /** Default leader ranking by this strategy's popularity segment, with hardcoded fallback */
  rankLeadersByPopularity(leaders: RawCard[], context: StrategyContext): RawCard[] {
    const stats = context.draftStats || null
    const leaderPop = this.getLeaderPopularity(stats)

    if (leaderPop && leaderPop.size > 0) {
      return [...leaders].sort((a, b) => {
        const statA = leaderPop.get(a.name || '')
        const statB = leaderPop.get(b.name || '')
        const picksA = statA ? statA.timesPicked : -1
        const picksB = statB ? statB.timesPicked : -1
        return picksB - picksA
      })
    }

    // Fallback to hardcoded rankings
    const setCode = context.setCode || this._inferSetCode(leaders)
    const rankings = LEADER_RANKINGS[setCode] || []
    return [...leaders].sort((a, b) => {
      const rankA = rankings.indexOf(a.name || '')
      const rankB = rankings.indexOf(b.name || '')
      const posA = rankA >= 0 ? rankA : 999
      const posB = rankB >= 0 ? rankB : 999
      return posA - posB
    })
  }

  // --- Helpers ---

  _getLeaderColors(leader: RawCard): string[] {
    // Returns only COLOR aspects (Vigilance, Command, Aggression, Cunning)
    // NOT alignment aspects (Heroism, Villainy) — alignment is handled separately
    // by the opposing alignment ban in _calculateColorScore
    const colors: string[] = []
    for (const aspect of (leader.aspects || [])) {
      if (COLOR_ASPECTS.includes(aspect)) {
        colors.push(aspect)
      }
    }
    return colors
  }

  _getColorsFromLeaders(leaders: RawCard[]): string[] {
    // Only return COLOR aspects — alignment is handled separately
    const colors = new Set<string>()
    for (const leader of leaders) {
      for (const aspect of (leader.aspects || [])) {
        if (COLOR_ASPECTS.includes(aspect)) {
          colors.add(aspect)
        }
      }
    }
    return Array.from(colors)
  }

  _getLeaderPrimaryColor(leader: RawCard): string | null {
    for (const aspect of (leader.aspects || [])) {
      if (COLOR_ASPECTS.includes(aspect)) return aspect
    }
    return null
  }

  _getLeaderAlignment(leader: RawCard): string | null {
    for (const aspect of (leader.aspects || [])) {
      if (ALIGNMENT_ASPECTS.includes(aspect)) return aspect
    }
    return null
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
    this.pickCount = 0
    // Re-roll Y and X turns
    const [yMin, yMax] = this.getYRange()
    const [xMin, xMax] = this.getXRange()
    let yOffset = 0, xOffset = 0
    if (this.mixin) {
      yOffset = this.mixin.commitmentOffset || 0
      xOffset = this.mixin.commitmentOffset || 0
    }
    this.mentalLeaderPickTurn = randomInRange(yMin + yOffset, yMax + yOffset)
    this.mentalBasePickTurn = randomInRange(xMin + xOffset, xMax + xOffset)
    this.mentalLeaderPickTurn = Math.max(1, Math.min(this.mentalLeaderPickTurn, 42))
    this.mentalBasePickTurn = Math.max(this.mentalLeaderPickTurn + 1, Math.min(this.mentalBasePickTurn, 42))
  }
}

// --- Utility ---

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export { COLOR_ASPECTS, ALIGNMENT_ASPECTS }
