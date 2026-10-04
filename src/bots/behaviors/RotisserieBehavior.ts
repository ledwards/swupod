// @ts-nocheck
/**
 * Rotisserie Draft Bot Behavior
 *
 * Strategy for rotisserie drafts where all cards are visible:
 * 1. First pick: Select top leader from LEADER_RANKINGS
 * 2. Choose a secondary color complementary to the leader
 * 3. Score cards based on:
 *    - In-color bonus (+50)
 *    - Secondary color bonus (+40)
 *    - Alignment match bonus (+20)
 *    - Neutral cards bonus (+15)
 *    - Rarity bonuses
 *    - Unit preference
 *    - Cost curve considerations
 */

import { LEADER_RANKINGS } from '../data/leaderRankings'
import { orderByPublishedLeaderRating } from '../data/activeRatingLookup'
import type { RawCard } from '../../utils/cardData'

interface RotisserieContext {
  myPicks?: RawCard[]
  allPicks?: { cardInstanceId: string; playerId: string }[]
  myPlayerId?: string
  setCodes?: string[]
}

// Color aspects (non-alignment)
const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

// Alignment aspects
const ALIGNMENT_ASPECTS = ['Heroism', 'Villainy']

export class RotisserieBehavior {
  name: string
  secondaryColor: string | null
  myAlignment: string | null

  constructor() {
    this.name = 'rotisserie'
    this.secondaryColor = null
    this.myAlignment = null
  }

  /**
   * Select the best card from the available pool
   * @param availableCards - All cards not yet picked
   * @param context - Draft context including myPicks
   * @returns Best card to pick
   */
  selectCard(availableCards: RawCard[], context: RotisserieContext = {}): RawCard | null {
    if (!availableCards || availableCards.length === 0) return null

    const myPicks = context.myPicks || []

    // Check if we have a leader yet
    const myLeader = myPicks.find(c => c.type === 'Leader' || c.isLeader)

    // First priority: pick a leader if we don't have one
    if (!myLeader) {
      const availableLeaders = availableCards.filter(c => c.type === 'Leader' || c.isLeader)
      if (availableLeaders.length > 0) {
        return this._selectBestLeader(availableLeaders, context)
      }
    }

    // Determine our colors from leader
    const myColors = myLeader ? this._getColorsFromCard(myLeader) : []

    // Choose secondary color if not set
    if (!this.secondaryColor && myColors.length > 0) {
      this._chooseSecondaryColor(myColors)
    }

    // Determine our alignment from leader
    if (!this.myAlignment && myLeader) {
      const aspects = myLeader.aspects || []
      if (aspects.includes('Heroism')) {
        this.myAlignment = 'Heroism'
      } else if (aspects.includes('Villainy')) {
        this.myAlignment = 'Villainy'
      }
    }

    // Check if we need a base
    const myBase = myPicks.find(c => c.type === 'Base' || c.isBase)
    if (!myBase) {
      const availableBases = availableCards.filter(c => c.type === 'Base' || c.isBase)
      if (availableBases.length > 0) {
        // Prefer bases that match our colors
        const scored = availableBases.map(card => ({
          card,
          score: this._scoreCard(card, myColors, context)
        }))
        scored.sort((a, b) => b.score - a.score)
        return scored[0]?.card ?? null
      }
    }

    // Score all remaining cards
    const scored = availableCards.map(card => ({
      card,
      score: this._scoreCard(card, myColors, context)
    }))

    scored.sort((a, b) => b.score - a.score)

    return scored[0]?.card ?? null
  }

  /**
   * Select the best leader based on rankings
   */
  _selectBestLeader(leaders: RawCard[], context: RotisserieContext): RawCard | null {
    if (!leaders || leaders.length === 0) return null

    const setCodes = context.setCodes || []
    const primarySet = setCodes[0]
    if (primarySet) {
      const published = orderByPublishedLeaderRating(primarySet, leaders)
      if (published) return published[0] ?? null
    }

    // Get rankings from all relevant sets, combine them
    const combinedRankings: string[] = []
    for (const setCode of setCodes) {
      const setRankings = LEADER_RANKINGS[setCode] || []
      for (const name of setRankings) {
        if (!combinedRankings.includes(name)) {
          combinedRankings.push(name)
        }
      }
    }

    // If no set codes, use all rankings combined
    if (combinedRankings.length === 0) {
      for (const setCode of Object.keys(LEADER_RANKINGS)) {
        const setRankings = LEADER_RANKINGS[setCode] || []
        for (const name of setRankings) {
          if (!combinedRankings.includes(name)) {
            combinedRankings.push(name)
          }
        }
      }
    }

    // Sort leaders by ranking
    const sorted = [...leaders].sort((a, b) => {
      const rankA = combinedRankings.indexOf(a.name || '')
      const rankB = combinedRankings.indexOf(b.name || '')

      const posA = rankA >= 0 ? rankA : 999
      const posB = rankB >= 0 ? rankB : 999

      return posA - posB
    })

    return sorted[0] ?? null
  }

  /**
   * Get color aspects from a card
   */
  _getColorsFromCard(card: RawCard): string[] {
    const aspects = card.aspects || []
    return aspects.filter(a => COLOR_ASPECTS.includes(a) || ALIGNMENT_ASPECTS.includes(a))
  }

  /**
   * Choose a secondary color not in our leader
   */
  _chooseSecondaryColor(leaderColors: string[]): void {
    const missingColors = COLOR_ASPECTS.filter(c => !leaderColors.includes(c))
    if (missingColors.length > 0) {
      this.secondaryColor = missingColors[Math.floor(Math.random() * missingColors.length)] ?? null
    }
  }

  /**
   * Score a card for rotisserie draft
   */
  _scoreCard(card: RawCard, myColors: string[], context: RotisserieContext): number {
    let score = 0
    const cardAspects = card.aspects || []

    // 1. RARITY BONUS
    const rarityScores: Record<string, number> = {
      'Legendary': 80,
      'Rare': 50,
      'Uncommon': 25,
      'Common': 10
    }
    score += rarityScores[card.rarity || ''] || 0

    // 2. IN-COLOR BONUS (+50 per matching color aspect)
    const colorAspects = cardAspects.filter(a => COLOR_ASPECTS.includes(a))
    const inColorCount = colorAspects.filter(a => myColors.includes(a)).length

    if (inColorCount > 0) {
      score += 50 * inColorCount
    } else if (this.secondaryColor && cardAspects.includes(this.secondaryColor)) {
      // 3. SECONDARY COLOR BONUS (+40)
      score += 40
    } else if (cardAspects.length === 0 || colorAspects.length === 0) {
      // 4. NEUTRAL BONUS (+15)
      score += 15
    } else {
      // Off-color penalty
      score -= 20
    }

    // 5. ALIGNMENT MATCH BONUS (+20)
    if (this.myAlignment) {
      if (cardAspects.includes(this.myAlignment)) {
        score += 20
      } else {
        // Check for opposite alignment - penalty
        const oppositeAlignment = this.myAlignment === 'Heroism' ? 'Villainy' : 'Heroism'
        if (cardAspects.includes(oppositeAlignment)) {
          score -= 30 // Can't play opposite alignment!
        }
      }
    }

    // 6. UNIT PREFERENCE
    if (card.type === 'Unit') {
      score += 35
    } else if (card.type === 'Upgrade') {
      score += 15
    } else if (card.type === 'Event') {
      score += 10
    }

    // 7. COST CURVE - prefer 2-4 cost cards
    const cost = card.cost || 0
    if (cost >= 2 && cost <= 4) {
      score += 10
    } else if (cost >= 5 && cost <= 6) {
      score += 5
    }

    // 8. STATS EFFICIENCY for units
    if (card.type === 'Unit' && card.power && card.hp) {
      const statTotal = card.power + card.hp
      const efficiency = statTotal / Math.max(cost, 1)
      score += Math.min(efficiency * 3, 15)
    }

    return score
  }

  /**
   * Reset for new draft
   */
  reset(): void {
    this.secondaryColor = null
    this.myAlignment = null
  }
}

export default RotisserieBehavior
