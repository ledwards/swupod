// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getClonePoolName,
  getClonedDeckBuilderState,
  shouldCloneSharedPoolForPlay,
} from './deckBuilderSharing'

describe('deckBuilderSharing', () => {
  describe('shouldCloneSharedPoolForPlay', () => {
    it('clones for a non-owner opening a shared sealed pool', () => {
      assert.strictEqual(
        shouldCloneSharedPoolForPlay({
          isOwner: false,
          shareId: 'pool-123',
          draftShareId: null,
        }),
        true
      )
    })

    it('does not clone for the pool owner', () => {
      assert.strictEqual(
        shouldCloneSharedPoolForPlay({
          isOwner: true,
          shareId: 'pool-123',
          draftShareId: null,
        }),
        false
      )
    })

    it('does not clone for pod flows that already have their own destination', () => {
      assert.strictEqual(
        shouldCloneSharedPoolForPlay({
          isOwner: false,
          shareId: 'pool-123',
          draftShareId: 'draft-456',
        }),
        false
      )
    })

    it('does not clone in infinite mode', () => {
      assert.strictEqual(
        shouldCloneSharedPoolForPlay({
          isInfiniteMode: true,
          isOwner: false,
          shareId: 'pool-123',
        }),
        false
      )
    })
  })

  describe('getClonePoolName', () => {
    it('appends copy suffix when a name exists', () => {
      assert.strictEqual(getClonePoolName('SOR Sealed'), 'SOR Sealed (Copy)')
    })

    it('returns null when there is no name', () => {
      assert.strictEqual(getClonePoolName(null), null)
    })
  })

  describe('getClonedDeckBuilderState', () => {
    it('prefers the current in-memory deck state over stale saved state', () => {
      const currentState = {
        activeLeader: 'leader-2',
        activeBase: 'base-2',
        cardPositions: {
          'pool-1': { section: 'deck' },
        },
      }
      const fallbackState = {
        activeLeader: 'leader-1',
        activeBase: 'base-1',
        cardPositions: {
          'pool-1': { section: 'sideboard' },
        },
      }

      assert.deepStrictEqual(getClonedDeckBuilderState(currentState, fallbackState), currentState)
    })

    it('falls back when there is no usable current state', () => {
      const fallbackState = { activeLeader: 'leader-1' }
      assert.deepStrictEqual(getClonedDeckBuilderState(null, fallbackState), fallbackState)
      assert.deepStrictEqual(getClonedDeckBuilderState({}, fallbackState), fallbackState)
    })
  })
})
