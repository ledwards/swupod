import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isBaseCard, isLeaderCard } from './cardFrame'

describe('card frame helpers', () => {
  it('treats explicit leader/base flags as horizontal cards', () => {
    assert.equal(isLeaderCard({ isLeader: true }), true)
    assert.equal(isBaseCard({ isBase: true }), true)
  })

  it('falls back to card type when legacy pack data lacks flags', () => {
    assert.equal(isLeaderCard({ type: 'Leader' }), true)
    assert.equal(isBaseCard({ type: 'Base' }), true)
  })

  it('does not treat regular playable cards as horizontal cards', () => {
    assert.equal(isLeaderCard({ type: 'Unit' }), false)
    assert.equal(isBaseCard({ type: 'Event' }), false)
  })
})
