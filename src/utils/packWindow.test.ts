/**
 * Tests for pickRandomWindow — the sealed "Randomize Packs" window dealer.
 *
 * SPEC (plans/ASH_COLLATION_FINDINGS.md, 2026-07-12): randomizing a sealed
 * pool must deal a CONSECUTIVE window of packs from the box, never a scatter
 * of arbitrary indices. Real sealed pools are consecutive cuts of a physical
 * box; scattered picks cross collation windows and produced measurably
 * clumpier pools (9.95 dup-pairs/pool vs 6.4 for consecutive cuts).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { pickRandomWindow } from './packWindow'

describe('pickRandomWindow', () => {
  it('FIXED: returns consecutive ascending indices (a physical box cut)', () => {
    for (let trial = 0; trial < 200; trial++) {
      const win = pickRandomWindow(6, 24)
      assert.strictEqual(win.length, 6)
      for (let i = 1; i < win.length; i++) {
        assert.strictEqual(win[i], win[i - 1] + 1,
          `SPEC: window must be consecutive, got ${JSON.stringify(win)}`)
      }
      assert.ok(win[0] >= 0 && win[win.length - 1] < 24, 'window stays inside the box')
    }
  })

  it('covers every valid window start over many deals', () => {
    const seen = new Set<number>()
    for (let trial = 0; trial < 2000; trial++) {
      seen.add(pickRandomWindow(6, 24)[0])
    }
    // starts 0..18 all reachable
    assert.strictEqual(seen.size, 19, `expected 19 possible starts, saw ${seen.size}`)
  })

  it('avoids the excluded start when another window exists', () => {
    for (let trial = 0; trial < 200; trial++) {
      const win = pickRandomWindow(6, 24, 0)
      assert.notStrictEqual(win[0], 0, 'excluded start must not repeat when avoidable')
    }
  })

  it('returns the only window (and ignores exclusion) when count === boxSize', () => {
    const win = pickRandomWindow(6, 6, 0)
    assert.deepStrictEqual(win, [0, 1, 2, 3, 4, 5])
  })

  it('throws when the box is smaller than the requested window', () => {
    assert.throws(() => pickRandomWindow(7, 6))
  })
})
