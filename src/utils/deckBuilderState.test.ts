// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseDeckBuilderState } from './deckBuilderState'

describe('parseDeckBuilderState', () => {
  it('returns an empty object for JSON null', () => {
    assert.deepStrictEqual(parseDeckBuilderState('null'), {})
  })

  it('returns an empty object for primitive JSON', () => {
    assert.deepStrictEqual(parseDeckBuilderState('42'), {})
    assert.deepStrictEqual(parseDeckBuilderState('"oops"'), {})
    assert.deepStrictEqual(parseDeckBuilderState('true'), {})
  })

  it('returns an empty object for arrays', () => {
    assert.deepStrictEqual(parseDeckBuilderState('[]'), {})
    assert.deepStrictEqual(parseDeckBuilderState([1, 2, 3]), {})
  })

  it('returns parsed objects unchanged', () => {
    const state = { poolName: 'Custom Limited Deck', cardPositions: { a: { section: 'deck' } } }
    assert.deepStrictEqual(parseDeckBuilderState(JSON.stringify(state)), state)
    assert.strictEqual(parseDeckBuilderState(state), state)
  })

  it('returns an empty object for invalid JSON', () => {
    assert.deepStrictEqual(parseDeckBuilderState('not-json'), {})
  })
})
