// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getBuildName,
  getBuildDeckBuilderState,
  shouldBuildFromSharedPool,
} from './deckBuilderSharing'

describe('deckBuilderSharing', () => {
  describe('shouldBuildFromSharedPool', () => {
    it('builds for a non-owner opening a shared sealed pool', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isOwner: false,
          shareId: 'pool-123',
          draftShareId: null,
        }),
        true
      )
    })

    it('does not build for the pool owner', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isOwner: true,
          shareId: 'pool-123',
          draftShareId: null,
        }),
        false
      )
    })

    it('does not build for pod flows that already have their own destination', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isOwner: false,
          shareId: 'pool-123',
          draftShareId: 'draft-456',
        }),
        false
      )
    })

    it('does not build in infinite mode', () => {
      assert.strictEqual(
        shouldBuildFromSharedPool({
          isInfiniteMode: true,
          isOwner: false,
          shareId: 'pool-123',
        }),
        false
      )
    })
  })

  describe('getBuildName', () => {
    it('appends builder name with em dash separator', () => {
      assert.strictEqual(getBuildName('SOR Sealed', 'Lee Edwards'), 'SOR Sealed – Lee Edwards\'s Build')
    })

    it('uses anonymous fallback when display name is null', () => {
      assert.strictEqual(getBuildName('SOR Sealed', null), 'SOR Sealed (Build)')
    })

    it('returns null when there is no parent name', () => {
      assert.strictEqual(getBuildName(null, 'Lee Edwards'), null)
    })
  })

  describe('getBuildDeckBuilderState', () => {
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

      assert.deepStrictEqual(getBuildDeckBuilderState(currentState, fallbackState), currentState)
    })

    it('falls back when there is no usable current state', () => {
      const fallbackState = { activeLeader: 'leader-1' }
      assert.deepStrictEqual(getBuildDeckBuilderState(null, fallbackState), fallbackState)
      assert.deepStrictEqual(getBuildDeckBuilderState({}, fallbackState), fallbackState)
    })
  })
})
