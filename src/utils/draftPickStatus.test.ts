import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isPickLockedIn } from './draftPickStatus'

// SPEC: picking is two steps — staging a card is tentative, confirming commits
// it. The round advances only when every player is committed, so the UI must
// not call a staged-but-unconfirmed player "done".
describe('isPickLockedIn (two-step pick)', () => {
  it('BUGGY-BEFORE: a staged but unconfirmed selection is NOT locked in', () => {
    assert.strictEqual(isPickLockedIn({ pickStatus: 'selected', selectionConfirmed: false }), false)
  })

  it('BUGGY-BEFORE: a missing confirmation flag is not a confirmation', () => {
    assert.strictEqual(isPickLockedIn({ pickStatus: 'selected' }), false)
  })

  it('FIXED: a confirmed selection is locked in', () => {
    assert.strictEqual(isPickLockedIn({ pickStatus: 'selected', selectionConfirmed: true }), true)
  })

  it('an already-processed pick is locked in regardless of the flag', () => {
    assert.strictEqual(isPickLockedIn({ pickStatus: 'picked' }), true)
  })

  it('a player still choosing is not locked in', () => {
    assert.strictEqual(isPickLockedIn({ pickStatus: 'picking' }), false)
    assert.strictEqual(isPickLockedIn(null), false)
    assert.strictEqual(isPickLockedIn(undefined), false)
  })
})
