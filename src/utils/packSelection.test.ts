import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleMultiSelectSetClick } from './packSelection'

describe('handleMultiSelectSetClick', () => {
  it('adds set when not selected and under max', () => {
    const updated = handleMultiSelectSetClick(['SOR'], 'SHD', 3)
    assert.deepEqual(updated, ['SOR', 'SHD'])
  })

  it('does not add when max selections reached', () => {
    const original = ['SOR', 'SHD', 'JTL']
    const updated = handleMultiSelectSetClick(original, 'LOF', 3)
    assert.deepEqual(updated, original)
  })

  it('removes only one duplicate when selected set is clicked', () => {
    const updated = handleMultiSelectSetClick(['SOR', 'SOR', 'SHD'], 'SOR', 6)
    assert.deepEqual(updated, ['SOR', 'SHD'])
  })
})
