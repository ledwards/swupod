import { describe, it } from 'node:test'
import assert from 'node:assert'
import { areAllPackPicksResolved } from './draftAdvance'

describe('areAllPackPicksResolved', () => {
  it('treats empty packs as resolved even if pick_status is still picking', () => {
    const players = [
      { pick_status: 'picked', current_pack: [] },
      { pick_status: 'picking', current_pack: [] },
      { pick_status: 'picking', current_pack: '[]' },
      { pick_status: 'picked', current_pack: '[]' },
    ]

    assert.strictEqual(
      areAllPackPicksResolved(players as any),
      true,
      'empty packs should not block draft advancement'
    )
  })

  it('requires unresolved players to pick when they still have cards', () => {
    const players = [
      { pick_status: 'picked', current_pack: [] },
      { pick_status: 'picking', current_pack: [{ id: 'card-1' }] },
    ]

    assert.strictEqual(
      areAllPackPicksResolved(players as any),
      false,
      'players with cards remaining must still pick'
    )
  })
})
