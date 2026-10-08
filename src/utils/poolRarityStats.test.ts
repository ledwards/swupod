import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computePoolRarityStats } from './poolRarityStats'

describe('computePoolRarityStats', () => {
  it('counts legendaries and rares case-insensitively', () => {
    const stats = computePoolRarityStats([
      { rarity: 'Legendary', cardId: 'a' },
      { rarity: 'legendary', cardId: 'b' },
      { rarity: 'Rare', cardId: 'c' },
      { rarity: 'Common', cardId: 'd' },
      { rarity: 'Uncommon', cardId: 'e' },
    ])
    assert.equal(stats.legendaries, 2)
    assert.equal(stats.rares, 1)
    assert.equal(stats.total, 5)
  })

  it('counts duplicate copies (total - distinct), keyed by cardId', () => {
    const stats = computePoolRarityStats([
      { rarity: 'Common', cardId: 'x' },
      { rarity: 'Common', cardId: 'x' }, // 1 dup
      { rarity: 'Common', cardId: 'x' }, // 2 dups
      { rarity: 'Rare', cardId: 'y' },
      { rarity: 'Rare', cardId: 'y' },   // 1 dup
      { rarity: 'Common', cardId: 'z' },
    ])
    // x:3 (2 extra) + y:2 (1 extra) + z:1 (0) = 3 duplicate copies
    assert.equal(stats.duplicates, 3)
    assert.equal(stats.rares, 2)
    assert.equal(stats.total, 6)
  })

  it('falls back to name when cardId is absent, and ignores empty keys', () => {
    const stats = computePoolRarityStats([
      { rarity: 'Common', name: 'Vanguard' },
      { rarity: 'Common', name: 'Vanguard' },
      { rarity: 'Common' }, // no key → not counted toward duplicates
    ])
    assert.equal(stats.duplicates, 1)
    assert.equal(stats.total, 3)
  })

  it('handles an empty pool', () => {
    const stats = computePoolRarityStats([])
    assert.deepEqual(stats, { total: 0, legendaries: 0, rares: 0, duplicates: 0 })
  })
})
