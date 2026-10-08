// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  NO_ASPECT_LABEL,
  ALL_ASPECTS,
  matchesAspectFilters,
  matchesPenaltyFilter,
  filterByAspects,
  filterByType,
  filterByRarity,
  filterLeaders,
  filterBases,
  filterMainDeckCards,
  filterByCostRange,
  filterByName,
  createDefaultAspectFilters,
} from './cardFiltering'

describe('cardFiltering', () => {
  describe('constants', () => {
    it('NO_ASPECT_LABEL is "No Aspect"', () => {
      assert.strictEqual(NO_ASPECT_LABEL, 'No Aspect')
    })

    it('ALL_ASPECTS contains all 6 aspects', () => {
      assert.strictEqual(ALL_ASPECTS.length, 6)
      assert.ok(ALL_ASPECTS.includes('Vigilance'))
      assert.ok(ALL_ASPECTS.includes('Command'))
      assert.ok(ALL_ASPECTS.includes('Aggression'))
      assert.ok(ALL_ASPECTS.includes('Cunning'))
      assert.ok(ALL_ASPECTS.includes('Villainy'))
      assert.ok(ALL_ASPECTS.includes('Heroism'))
    })
  })

  describe('matchesAspectFilters', () => {
    it('returns true when card aspect is enabled', () => {
      const card = { aspects: ['Vigilance'] }
      const filters = { Vigilance: true, Command: false }
      assert.strictEqual(matchesAspectFilters(card, filters), true)
    })

    it('returns false when card aspect is not enabled', () => {
      const card = { aspects: ['Vigilance'] }
      const filters = { Vigilance: false, Command: true }
      assert.strictEqual(matchesAspectFilters(card, filters), false)
    })

    it('returns true when any card aspect is enabled (dual aspect)', () => {
      const card = { aspects: ['Vigilance', 'Villainy'] }
      const filters = { Vigilance: false, Villainy: true }
      assert.strictEqual(matchesAspectFilters(card, filters), true)
    })

    it('returns false when no card aspects are enabled', () => {
      const card = { aspects: ['Vigilance', 'Villainy'] }
      const filters = { Vigilance: false, Villainy: false, Command: true }
      assert.strictEqual(matchesAspectFilters(card, filters), false)
    })

    it('returns true for neutral card when neutral filter enabled', () => {
      const card = { aspects: [] }
      const filters = { 'No Aspect': true }
      assert.strictEqual(matchesAspectFilters(card, filters), true)
    })

    it('returns false for neutral card when neutral filter disabled', () => {
      const card = { aspects: [] }
      const filters = { 'No Aspect': false, Vigilance: true }
      assert.strictEqual(matchesAspectFilters(card, filters), false)
    })

    it('handles undefined aspects as neutral', () => {
      const card = {}
      const filters = { 'No Aspect': true }
      assert.strictEqual(matchesAspectFilters(card, filters), true)
    })

    it('uses custom neutral label', () => {
      const card = { aspects: [] }
      const filters = { 'Neutral': true }
      assert.strictEqual(matchesAspectFilters(card, filters, 'Neutral'), true)
    })
  })

  describe('matchesPenaltyFilter', () => {
    it('returns true for in-aspect card when only in-aspect enabled', () => {
      assert.strictEqual(matchesPenaltyFilter(0, true, false), true)
    })

    it('returns false for out-of-aspect card when only in-aspect enabled', () => {
      assert.strictEqual(matchesPenaltyFilter(2, true, false), false)
    })

    it('returns false for in-aspect card when only out-of-aspect enabled', () => {
      assert.strictEqual(matchesPenaltyFilter(0, false, true), false)
    })

    it('returns true for out-of-aspect card when only out-of-aspect enabled', () => {
      assert.strictEqual(matchesPenaltyFilter(2, false, true), true)
    })

    it('returns true for both when both filters enabled', () => {
      assert.strictEqual(matchesPenaltyFilter(0, true, true), true)
      assert.strictEqual(matchesPenaltyFilter(2, true, true), true)
      assert.strictEqual(matchesPenaltyFilter(4, true, true), true)
    })

    it('returns false for both when neither filter enabled', () => {
      assert.strictEqual(matchesPenaltyFilter(0, false, false), false)
      assert.strictEqual(matchesPenaltyFilter(2, false, false), false)
    })

    it('treats penalty > 0 as out-of-aspect', () => {
      assert.strictEqual(matchesPenaltyFilter(4, true, false), false)
      assert.strictEqual(matchesPenaltyFilter(6, false, true), true)
    })
  })

  describe('filterByAspects', () => {
    const cards = [
      { name: 'Vigilance Card', aspects: ['Vigilance'] },
      { name: 'Command Card', aspects: ['Command'] },
      { name: 'Dual Card', aspects: ['Vigilance', 'Villainy'] },
      { name: 'Neutral Card', aspects: [] },
    ]

    it('filters to single aspect', () => {
      const filters = { Vigilance: true }
      const result = filterByAspects(cards, filters)
      assert.strictEqual(result.length, 2)
      assert.ok(result.some(c => c.name === 'Vigilance Card'))
      assert.ok(result.some(c => c.name === 'Dual Card'))
    })

    it('filters to multiple aspects', () => {
      const filters = { Vigilance: true, Command: true }
      const result = filterByAspects(cards, filters)
      assert.strictEqual(result.length, 3)
    })

    it('includes neutral cards when enabled', () => {
      const filters = { 'No Aspect': true }
      const result = filterByAspects(cards, filters)
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].name, 'Neutral Card')
    })
  })

  describe('filterByType', () => {
    const cards = [
      { name: 'Unit A', type: 'Unit' },
      { name: 'Ground Unit', type: 'Ground Unit' },
      { name: 'Event A', type: 'Event' },
      { name: 'Upgrade A', type: 'Upgrade' },
    ]

    it('filters to single type', () => {
      const result = filterByType(cards, 'Unit')
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].name, 'Unit A')
    })

    it('filters to multiple types', () => {
      const result = filterByType(cards, ['Unit', 'Ground Unit'])
      assert.strictEqual(result.length, 2)
    })
  })

  describe('filterByRarity', () => {
    const cards = [
      { name: 'Common Card', rarity: 'Common' },
      { name: 'Rare Card', rarity: 'Rare' },
      { name: 'Legendary Card', rarity: 'Legendary' },
    ]

    it('filters to single rarity', () => {
      const result = filterByRarity(cards, 'Rare')
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].name, 'Rare Card')
    })

    it('filters to multiple rarities', () => {
      const result = filterByRarity(cards, ['Rare', 'Legendary'])
      assert.strictEqual(result.length, 2)
    })
  })

  describe('filterLeaders', () => {
    const cards = [
      { name: 'Leader A', isLeader: true },
      { name: 'Leader B', type: 'Leader' },
      { name: 'Unit A', type: 'Unit' },
    ]

    it('returns only leaders', () => {
      const result = filterLeaders(cards)
      assert.strictEqual(result.length, 2)
      assert.ok(result.every(c => c.name.includes('Leader')))
    })
  })

  describe('filterBases', () => {
    const cards = [
      { name: 'Base A', isBase: true },
      { name: 'Base B', type: 'Base' },
      { name: 'Unit A', type: 'Unit' },
    ]

    it('returns only bases', () => {
      const result = filterBases(cards)
      assert.strictEqual(result.length, 2)
      assert.ok(result.every(c => c.name.includes('Base')))
    })
  })

  describe('filterMainDeckCards', () => {
    const cards = [
      { name: 'Unit A', type: 'Unit' },
      { name: 'Leader A', isLeader: true },
      { name: 'Leader B', type: 'Leader' },
      { name: 'Base A', isBase: true },
      { name: 'Base B', type: 'Base' },
      { name: 'Event A', type: 'Event' },
    ]

    it('excludes leaders and bases', () => {
      const result = filterMainDeckCards(cards)
      assert.strictEqual(result.length, 2)
      assert.ok(result.some(c => c.name === 'Unit A'))
      assert.ok(result.some(c => c.name === 'Event A'))
    })
  })

  describe('filterByCostRange', () => {
    const cards = [
      { name: 'Free', cost: 0 },
      { name: 'Cheap', cost: 1 },
      { name: 'Medium', cost: 3 },
      { name: 'Expensive', cost: 7 },
      { name: 'No Cost', cost: null },
    ]

    it('filters by min and max cost', () => {
      const result = filterByCostRange(cards, 1, 5)
      assert.strictEqual(result.length, 2)
      assert.ok(result.some(c => c.name === 'Cheap'))
      assert.ok(result.some(c => c.name === 'Medium'))
    })

    it('includes cards at exactly min cost', () => {
      const result = filterByCostRange(cards, 0, 1)
      assert.strictEqual(result.length, 2)
    })

    it('includes cards at exactly max cost', () => {
      const result = filterByCostRange(cards, 7, 10)
      assert.strictEqual(result.length, 1)
    })

    it('excludes cards with null cost', () => {
      const result = filterByCostRange(cards, 0, 100)
      assert.strictEqual(result.length, 4)
      assert.ok(!result.some(c => c.name === 'No Cost'))
    })
  })

  describe('filterByName', () => {
    const cards = [
      { name: 'Luke Skywalker' },
      { name: 'Leia Organa' },
      { name: 'Darth Vader' },
    ]

    it('filters by substring match', () => {
      const result = filterByName(cards, 'sky')
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].name, 'Luke Skywalker')
    })

    it('is case insensitive', () => {
      const result = filterByName(cards, 'LUKE')
      assert.strictEqual(result.length, 1)
    })

    it('returns all cards for empty search', () => {
      assert.strictEqual(filterByName(cards, '').length, 3)
      assert.strictEqual(filterByName(cards, '   ').length, 3)
      assert.strictEqual(filterByName(cards, null as any).length, 3)
    })

    it('handles cards without names', () => {
      const cardsWithMissing = [...cards, {}]
      const result = filterByName(cardsWithMissing, 'luke')
      assert.strictEqual(result.length, 1)
    })
  })

  describe('createDefaultAspectFilters', () => {
    it('creates filters with all aspects enabled by default', () => {
      const filters = createDefaultAspectFilters()
      assert.strictEqual(filters.Vigilance, true)
      assert.strictEqual(filters.Command, true)
      assert.strictEqual(filters.Aggression, true)
      assert.strictEqual(filters.Cunning, true)
      assert.strictEqual(filters.Villainy, true)
      assert.strictEqual(filters.Heroism, true)
      assert.strictEqual(filters['No Aspect'], true)
    })

    it('creates filters with all aspects disabled when specified', () => {
      const filters = createDefaultAspectFilters(false)
      assert.strictEqual(filters.Vigilance, false)
      assert.strictEqual(filters.Command, false)
      assert.strictEqual(filters['No Aspect'], false)
    })
  })
})
