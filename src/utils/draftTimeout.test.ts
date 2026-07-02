import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isTimeoutResolvedPlayer,
  shouldProcessStagedPicksOnTimeout,
} from './draftTimeout'

const card = { id: 'c1', name: 'Card 1' }
type DraftTimeoutPlayer = Parameters<typeof isTimeoutResolvedPlayer>[0]

function player(overrides: Record<string, unknown>): DraftTimeoutPlayer {
  return {
    id: 'p1',
    pod_id: 'pod1',
    pick_status: 'picking',
    selected_card_id: null,
    leaders: [],
    drafted_leaders: [],
    drafted_cards: [],
    current_pack: [card],
    ...overrides,
  } as DraftTimeoutPlayer
}

describe('draft timeout staged pick handling', () => {
  it('treats a soft-selected player as resolved for timeout processing', () => {
    assert.strictEqual(isTimeoutResolvedPlayer(player({
      pick_status: 'selected',
      selected_card_id: 'c1',
    }), 'pack_draft'), true)
  })

  it('does not treat an unselected player with cards as resolved', () => {
    assert.strictEqual(isTimeoutResolvedPlayer(player({}), 'pack_draft'), false)
  })

  it('processes staged picks when everyone selected before the timer expires', () => {
    const players = [
      player({ id: 'p1', pick_status: 'selected', selected_card_id: 'c1' }),
      player({ id: 'p2', pick_status: 'selected', selected_card_id: 'c2', current_pack: [{ id: 'c2' }] }),
    ]

    assert.strictEqual(shouldProcessStagedPicksOnTimeout(players, 'pack_draft'), true)
  })

  it('does not process staged picks while someone still needs to select', () => {
    const players = [
      player({ id: 'p1', pick_status: 'selected', selected_card_id: 'c1' }),
      player({ id: 'p2', pick_status: 'picking', selected_card_id: null, current_pack: [{ id: 'c2' }] }),
    ]

    assert.strictEqual(shouldProcessStagedPicksOnTimeout(players, 'pack_draft'), false)
  })
})
