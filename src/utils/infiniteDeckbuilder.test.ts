// @ts-nocheck
import { before, describe, it } from 'node:test'
import assert from 'node:assert'
import { getCachedCards, initializeCardCache } from './cardCache.ts'
import { buildInfiniteDeckbuilderPool } from './infiniteDeckbuilder.ts'
import { buildBaseCardMap, getBaseCardId } from './variantDowngrade.ts'

describe('buildInfiniteDeckbuilderPool', () => {
  before(async () => {
    await initializeCardCache()
  })

  it('includes all leaders, all rare bases, and one representative per gameplay identity', () => {
    const setCode = 'SOR'
    const allSetCards = getCachedCards(setCode)
    const baseCardMap = buildBaseCardMap(setCode)
    const pool = buildInfiniteDeckbuilderPool(setCode, allSetCards)

    const leaders = pool.filter(card => card.isLeader || card.type === 'Leader')
    const rareBases = pool.filter(card => (card.isBase || card.type === 'Base') && card.rarity === 'Rare')
    const commonBases = pool.filter(card => (card.isBase || card.type === 'Base') && card.rarity === 'Common')
    const gameplayCards = pool.filter(card => !card.isLeader && card.type !== 'Leader' && !card.isBase && card.type !== 'Base')

    const expectedLeaderCount = new Set(
      allSetCards
        .filter(card => (card.isLeader || card.type === 'Leader') && (!card.variantType || card.variantType === 'Normal'))
        .map(card => getBaseCardId(card, baseCardMap) || `${card.name}|${card.type}|${card.subtitle || ''}`)
    ).size

    const expectedRareBaseCount = new Set(
      allSetCards
        .filter(card => (card.isBase || card.type === 'Base') && card.rarity === 'Rare' && (!card.variantType || card.variantType === 'Normal'))
        .map(card => getBaseCardId(card, baseCardMap) || `${card.name}|${card.type}|${card.subtitle || ''}`)
    ).size

    const expectedGameplayCount = new Set(
      allSetCards
        .filter(card => !card.isLeader && card.type !== 'Leader' && !card.isBase && card.type !== 'Base' && (!card.variantType || card.variantType === 'Normal'))
        .map(card => getBaseCardId(card, baseCardMap) || `${card.name}|${card.type}|${card.subtitle || ''}`)
    ).size

    assert.strictEqual(leaders.length, expectedLeaderCount)
    assert.strictEqual(rareBases.length, expectedRareBaseCount)
    assert.strictEqual(gameplayCards.length, expectedGameplayCount)
    assert.strictEqual(commonBases.length, 0)
  })
})
