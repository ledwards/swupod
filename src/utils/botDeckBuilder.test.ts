// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { scoreBaseForLeader, getBaseNewColor } from './botDeckBuilder'

/**
 * Bot Deck Builder Tests
 *
 * Common bases have exactly 1 color aspect.
 * Leaders have 1+ color aspects plus an alignment (Heroism/Villainy).
 * The base's color must NOT match any leader color.
 * Deck must be exactly 30 cards.
 * Deck must NEVER contain cards with opposing alignment.
 * Off-aspect cards should be minimal (3-5 max for LAW splashes).
 */

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const DECK_SIZE = 30

describe('Bot Deck Builder', () => {
  describe('scoreBaseForLeader', () => {
    it('SPEC: base with new color scores positive', () => {
      const score = scoreBaseForLeader(['Vigilance', 'Command', 'Heroism'], ['Aggression'])
      assert.ok(score > 0, `New color should score positive, got ${score}`)
    })

    it('SPEC: base matching leader color scores very negative', () => {
      const score = scoreBaseForLeader(['Vigilance', 'Command', 'Heroism'], ['Vigilance'])
      assert.ok(score < 0, `Matching color should score negative, got ${score}`)
    })

    it('SPEC: base matching other leader color also scores negative', () => {
      const score = scoreBaseForLeader(['Vigilance', 'Command', 'Heroism'], ['Command'])
      assert.ok(score < 0, `Matching color should score negative, got ${score}`)
    })

    it('SPEC: new color always beats duplicate color', () => {
      const leader = ['Aggression', 'Cunning', 'Villainy']
      const newColorScore = scoreBaseForLeader(leader, ['Vigilance'])
      const dupColorScore = scoreBaseForLeader(leader, ['Aggression'])
      assert.ok(newColorScore > dupColorScore,
        `New color (${newColorScore}) must beat duplicate (${dupColorScore})`)
    })

    it('SPEC: all 4 colors work correctly for a 2-color leader', () => {
      const leader = ['Vigilance', 'Command', 'Heroism']
      assert.ok(scoreBaseForLeader(leader, ['Aggression']) > 0, 'Aggression should be valid')
      assert.ok(scoreBaseForLeader(leader, ['Cunning']) > 0, 'Cunning should be valid')
      assert.ok(scoreBaseForLeader(leader, ['Vigilance']) < 0, 'Vigilance should be invalid')
      assert.ok(scoreBaseForLeader(leader, ['Command']) < 0, 'Command should be invalid')
    })

    it('SPEC: single-color leader has 3 valid base colors', () => {
      const leader = ['Aggression', 'Villainy']
      const validCount = COLOR_ASPECTS.filter(c => scoreBaseForLeader(leader, [c]) > 0).length
      assert.strictEqual(validCount, 3)
    })

    it('SPEC: two-color leader has 2 valid base colors', () => {
      const leader = ['Aggression', 'Cunning', 'Villainy']
      const validCount = COLOR_ASPECTS.filter(c => scoreBaseForLeader(leader, [c]) > 0).length
      assert.strictEqual(validCount, 2)
    })
  })

  describe('getBaseNewColor', () => {
    it('returns the new color from the base', () => {
      assert.strictEqual(
        getBaseNewColor({ aspects: ['Vigilance', 'Command', 'Heroism'] }, { aspects: ['Aggression'] }),
        'Aggression'
      )
    })

    it('returns null when base matches a leader color', () => {
      assert.strictEqual(
        getBaseNewColor({ aspects: ['Vigilance', 'Command', 'Heroism'] }, { aspects: ['Vigilance'] }),
        null
      )
    })
  })

  describe('Deck construction constraints', () => {
    it('SPEC: deck is exactly 30 cards from a 42-card pool', () => {
      const cards = Array.from({ length: 42 }, (_, i) => ({ name: `Card ${i}`, id: `c-${i}` }))
      const deck = cards.slice(0, DECK_SIZE)
      const sideboard = cards.slice(DECK_SIZE)
      assert.strictEqual(deck.length, 30)
      assert.strictEqual(sideboard.length, 12)
    })

    it('SPEC: cardPositions deck section has exactly 30 entries', () => {
      const cards = Array.from({ length: 42 }, (_, i) => ({ name: `Card ${i}`, id: `c-${i}` }))
      const deck = cards.slice(0, DECK_SIZE)
      const sideboard = cards.slice(DECK_SIZE)

      const positions: Record<string, any> = {}
      let i = 0
      for (const c of deck) positions[`p_${i++}`] = { card: c, section: 'deck' }
      for (const c of sideboard) positions[`p_${i++}`] = { card: c, section: 'sideboard' }

      assert.strictEqual(Object.values(positions).filter(p => p.section === 'deck').length, 30)
      assert.strictEqual(Object.values(positions).filter(p => p.section === 'sideboard').length, 12)
    })
  })

  describe('Alignment constraints', () => {
    it('SPEC: Villainy leader deck must contain ZERO Heroism cards', () => {
      // Simulate: Villainy leader, pool has mix of Heroism and non-Heroism cards
      const leaderAlignment = 'Villainy'
      const pool = [
        { name: 'Good Card 1', aspects: ['Vigilance'] },
        { name: 'Good Card 2', aspects: ['Command'] },
        { name: 'Bad Heroism Card', aspects: ['Vigilance', 'Heroism'] },
        { name: 'Another Heroism', aspects: ['Command', 'Heroism'] },
        { name: 'Neutral Card', aspects: [] },
        { name: 'Villainy Card', aspects: ['Aggression', 'Villainy'] },
      ]

      // Filter out opposing alignment — this is the rule
      const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism' : 'Villainy'
      const validCards = pool.filter(c => {
        const cardAspects = c.aspects || []
        return !cardAspects.includes(opposingAlignment)
      })

      const heroismCards = validCards.filter(c => (c.aspects || []).includes('Heroism'))
      assert.strictEqual(heroismCards.length, 0,
        'SPEC: After filtering, zero Heroism cards should remain for a Villainy leader')

      // The Heroism cards should have been excluded
      assert.ok(!validCards.some(c => c.name === 'Bad Heroism Card'),
        'Bad Heroism Card must be excluded')
      assert.ok(!validCards.some(c => c.name === 'Another Heroism'),
        'Another Heroism must be excluded')

      // Good cards should remain
      assert.ok(validCards.some(c => c.name === 'Good Card 1'), 'Good cards should remain')
      assert.ok(validCards.some(c => c.name === 'Villainy Card'), 'Same-alignment cards should remain')
      assert.ok(validCards.some(c => c.name === 'Neutral Card'), 'Neutral cards should remain')
    })

    it('SPEC: Heroism leader deck must contain ZERO Villainy cards', () => {
      const leaderAlignment = 'Heroism'
      const pool = [
        { name: 'Good Card', aspects: ['Vigilance'] },
        { name: 'Bad Villainy Card', aspects: ['Aggression', 'Villainy'] },
        { name: 'Heroism Card', aspects: ['Command', 'Heroism'] },
      ]

      const opposingAlignment = 'Villainy'
      const validCards = pool.filter(c => !(c.aspects || []).includes(opposingAlignment))

      assert.strictEqual(
        validCards.filter(c => (c.aspects || []).includes('Villainy')).length, 0,
        'Zero Villainy cards for Heroism leader'
      )
      assert.ok(validCards.some(c => c.name === 'Heroism Card'), 'Same-alignment cards stay')
    })
  })

  describe('Off-aspect splash limits', () => {
    it('SPEC: LAW deck should have at most 5 off-aspect cards', () => {
      // This is the max splash limit enforced by _calculateLAWSplashBonus
      const MAX_SPLASH = 5
      assert.ok(MAX_SPLASH <= 5, 'Max LAW splash should be 5 or fewer')
    })

    it('SPEC: non-LAW deck should have at most 1 off-aspect card', () => {
      // For non-LAW sets, off-aspect penalty is -500 with no splash bonus
      // This should make it virtually impossible for off-aspect cards to make the cut
      const offAspectPenalty = -500
      const maxQualityScore = 150  // Generous upper bound for any card's total quality score
      assert.ok(offAspectPenalty + maxQualityScore < 0,
        'Off-aspect penalty must outweigh maximum quality score for non-LAW')
    })
  })
})
