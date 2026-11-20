// SPEC: a leader in a draft pack (Icons — no leader slot) is undervalued by
// bots that already have a leader, and valued normally by a bot with none.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { discountPackLeader, PACK_LEADER_VALUE } from './packLeaderValue'

const leader = { id: 'L', name: 'Icons Leader', set: 'IC27', isLeader: true } as never
const unit = { id: 'U', name: 'Icons Unit', set: 'IC27' } as never

describe('discountPackLeader', () => {
  it('SPEC: pack leader is worth half once the bot has a leader from the leader draft', () => {
    assert.strictEqual(PACK_LEADER_VALUE, 0.5)
    assert.strictEqual(discountPackLeader(leader, 80, [leader], []), 40)
  })

  it('SPEC: pack leader is worth half once the bot picked one from a pack', () => {
    assert.strictEqual(discountPackLeader(leader, 80, [], [leader]), 40)
  })

  it('SPEC: a bot with no leader values a pack leader fully', () => {
    assert.strictEqual(discountPackLeader(leader, 80, [], [unit]), 80)
  })

  it('SPEC: non-leaders are untouched; a negative score is not raised', () => {
    assert.strictEqual(discountPackLeader(unit, 80, [leader], []), 80)
    assert.strictEqual(discountPackLeader(leader, -20, [leader], []), -20)
  })
})
