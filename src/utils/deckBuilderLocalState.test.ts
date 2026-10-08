// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildDeckBuilderUiStorageState } from './deckBuilderLocalState'

describe('buildDeckBuilderUiStorageState', () => {
  it('keeps lightweight restore fields and drops heavy card layout payloads', () => {
    const fullState = {
      cardPositions: { a: { section: 'deck', card: { id: 'x', name: 'Big Card Payload' } } },
      sectionLabels: [{ text: 'Pool', y: 100 }],
      sectionBounds: { deck: { minY: 0, maxY: 1, minX: 0, maxX: 1 } },
      canvasHeight: 9000,
      deckCardIds: ['a'],
      sideboardCardIds: ['b'],
      activeLeader: 'leader-1',
      activeBase: 'base-1',
      playShareId: 'share-1',
      viewMode: 'arena',
      poolCardDensity: 'large',
      deckCardDensity: 'small',
      showAspectPenalties: true,
      arenaFilters: { Command: true },
      arenaSearchQuery: 'thrawn',
      poolName: 'Custom Limited Deck',
      sessionId: 'session-1',
    }

    const uiState = buildDeckBuilderUiStorageState(fullState)

    assert.deepStrictEqual(uiState.deckCardIds, ['a'])
    assert.deepStrictEqual(uiState.sideboardCardIds, ['b'])
    assert.strictEqual(uiState.activeLeader, 'leader-1')
    assert.strictEqual(uiState.activeBase, 'base-1')
    assert.strictEqual(uiState.playShareId, 'share-1')
    assert.strictEqual(uiState.poolCardDensity, 'large')
    assert.strictEqual(uiState.deckCardDensity, 'small')
    assert.strictEqual(uiState.poolName, 'Custom Limited Deck')
    assert.strictEqual(uiState.sessionId, 'session-1')
    assert.ok(!('cardPositions' in uiState))
    assert.ok(!('sectionLabels' in uiState))
    assert.ok(!('sectionBounds' in uiState))
    assert.ok(!('canvasHeight' in uiState))
  })
})
