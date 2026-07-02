import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseCurrentPack, isPackPickComplete, isPackRoundExhausted, isStagedPickResolved } from './draftAdvance'

describe('draftAdvance pack completion', () => {
  describe('parseCurrentPack', () => {
    it('parses array, JSON string, and nullable inputs', () => {
      const card = { id: 'c1', name: 'Card 1' }

      assert.deepStrictEqual(parseCurrentPack([card] as never), [card])
      assert.deepStrictEqual(parseCurrentPack(JSON.stringify([card])), [card])
      assert.deepStrictEqual(parseCurrentPack(null), [])
      assert.deepStrictEqual(parseCurrentPack(undefined), [])
    })

    it('returns empty array for invalid JSON input', () => {
      assert.deepStrictEqual(parseCurrentPack('{oops'), [])
    })
  })

  describe('isPackPickComplete', () => {
    it('treats empty picking packs as complete', () => {
      const complete = isPackPickComplete({
        pick_status: 'picking',
        current_pack: '[]'
      } as never)

      assert.strictEqual(complete, true)
    })

    it('keeps non-empty picking packs incomplete', () => {
      const complete = isPackPickComplete({
        pick_status: 'picking',
        current_pack: JSON.stringify([{ id: 'c1', name: 'Card 1' }])
      } as never)

      assert.strictEqual(complete, false)
    })
  })

  // Issue #19: a Carbonite pack carries one extra draftable card, so packs can
  // be unequal size. The round must stay alive until the largest pack is empty,
  // and an already-empty seat must not block the final pick — otherwise the
  // draft hangs on the last round.
  describe('isPackRoundExhausted (issue #19 — carbonite/uneven packs)', () => {
    const card = { id: 'c1', name: 'Card 1' }

    it('FIXED: round is NOT exhausted while a larger Carbonite pack still has a card', () => {
      const players = [
        { current_pack: [] },        // depleted standard pack
        { current_pack: '[]' },      // depleted standard pack (JSON form)
        { current_pack: [card] },    // Carbonite pack — extra card still to draft
      ]
      assert.strictEqual(
        isPackRoundExhausted(players as never), false,
        'SPEC: keep drafting until the Carbonite pack\'s extra card is taken'
      )
    })

    it('FIXED: round is exhausted only when EVERY pack is empty', () => {
      const players = [
        { current_pack: [] },
        { current_pack: '[]' },
        { current_pack: [] },
      ]
      assert.strictEqual(isPackRoundExhausted(players as never), true)
    })

    it('BUGGY-BEFORE: an empty seat 0 no longer ends the round on its own', () => {
      // Old code keyed off players[0]; seat 0 empty while another seat holds a
      // card would wrongly end/hang the round. Now it stays active.
      const players = [
        { current_pack: [] },
        { current_pack: [card] },
      ]
      assert.strictEqual(isPackRoundExhausted(players as never), false)
    })
  })

  describe('isStagedPickResolved (issue #19 — empty packs must not block)', () => {
    const card = { id: 'c1', name: 'Card 1' }

    it('FIXED: an empty-pack player is resolved without selecting', () => {
      assert.strictEqual(isStagedPickResolved({
        pick_status: 'picking', selected_card_id: null, current_pack: [],
      } as never), true)
    })

    it('a player who has selected a card is resolved', () => {
      assert.strictEqual(isStagedPickResolved({
        pick_status: 'selected', selected_card_id: 'c1', current_pack: [card],
      } as never), true)
    })

    it('a player who has confirmed a pick is resolved', () => {
      assert.strictEqual(isStagedPickResolved({
        pick_status: 'picked', selected_card_id: null, current_pack: [card],
      } as never), true)
    })

    it('a player with the legacy confirmed staged status is resolved', () => {
      assert.strictEqual(isStagedPickResolved({
        pick_status: 'confirmed', selected_card_id: 'c1', current_pack: [card],
      } as never), true)
    })

    it('a player still holding cards but not selected is NOT resolved', () => {
      assert.strictEqual(isStagedPickResolved({
        pick_status: 'picking', selected_card_id: null, current_pack: [card],
      } as never), false)
    })
  })
})
