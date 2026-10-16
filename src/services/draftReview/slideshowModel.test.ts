import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { followTailIndex, pickLabel, toggleAllSeats, toggleSeat } from './slideshowModel'

// Spec (Draft Review / Observer comps): the slide label reads "Pack 2 · Pick 6"; leader rounds read "Leaders · Pick 1".
describe('pickLabel', () => {
  it('names the pack and pick', () => {
    assert.equal(pickLabel({ packNumber: 2, pickInPack: 6 }), 'Pack 2 · Pick 6')
  })
  it('pack 0 is the leader round', () => {
    assert.equal(pickLabel({ packNumber: 0, pickInPack: 1 }), 'Leaders · Pick 1')
  })
  it('no pick, no label', () => {
    assert.equal(pickLabel(undefined), '')
  })
})

// Spec: a seat tab toggles that seat; the selection is never emptied by a seat tab.
describe('toggleSeat', () => {
  it('adds an unselected seat', () => {
    assert.deepEqual([...toggleSeat(new Set([1]), 2)].sort(), [1, 2])
  })
  it('removes a selected seat', () => {
    assert.deepEqual([...toggleSeat(new Set([1, 2]), 2)], [1])
  })
  it('keeps the last seat selected', () => {
    assert.deepEqual([...toggleSeat(new Set([3]), 3)], [3])
  })
})

// Spec: "All Players" selects every open seat; pressed again (everything on) it clears to none. Locked seats never join.
describe('toggleAllSeats', () => {
  it('selects every open seat', () => {
    assert.deepEqual([...toggleAllSeats(new Set([1]), [1, 2, 4])].sort(), [1, 2, 4])
  })
  it('clears when every open seat is already on', () => {
    assert.deepEqual([...toggleAllSeats(new Set([1, 2, 4]), [1, 2, 4])], [])
  })
})

// Spec: following the latest pick, new picks move the view to the newest slide only if the viewer was on the previous last slide.
describe('followTailIndex', () => {
  it('advances from the old last slide to the new last slide', () => {
    assert.equal(followTailIndex({ current: 4, previousCount: 5, nextCount: 7 }), 6)
  })
  it('stays put when the viewer scrubbed back', () => {
    assert.equal(followTailIndex({ current: 1, previousCount: 5, nextCount: 7 }), null)
  })
  it('does nothing on the first load or when no slides were added', () => {
    assert.equal(followTailIndex({ current: 0, previousCount: 0, nextCount: 7 }), null)
    assert.equal(followTailIndex({ current: 4, previousCount: 5, nextCount: 5 }), null)
  })
})
