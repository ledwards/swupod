import { describe, it } from 'node:test'
import assert from 'node:assert'
import { parseCurrentPack, isPackPickComplete } from './draftAdvance'

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
})
