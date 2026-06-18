// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getCurrentEra } from './statsEras'

describe('getCurrentEra', () => {
  // eras come newest-first, and may include an UPCOMING set (e.g. ASH) whose
  // window is in the future. The current era must be the most recent era that
  // has already begun — NEVER the future one, or /me defaults to an empty
  // future date window and shows "no captured games / 0 packs".
  const eras = [
    { setCode: 'ASH', label: 'ASH', start: '2026-07-10', end: '2026-07-10' }, // future
    { setCode: 'LAW', label: 'LAW', start: '2026-03-13', end: '2026-06-16' },
    { setCode: 'SEC', label: 'SEC', start: '2026-01-01', end: '2026-03-13' },
  ]
  const today = '2026-06-16'

  it('returns the most recent STARTED era, not the future one', () => {
    // BUG: returned ASH (future) → empty /me. FIXED: LAW (latest started).
    assert.equal(getCurrentEra(eras, today)?.setCode, 'LAW')
  })

  it('returns the era whose window contains today when one does', () => {
    const containing = [
      { setCode: 'LAW', label: 'LAW', start: '2026-03-13', end: '2026-12-31' },
      { setCode: 'SEC', label: 'SEC', start: '2026-01-01', end: '2026-03-13' },
    ]
    assert.equal(getCurrentEra(containing, today)?.setCode, 'LAW')
  })

  it('never returns a purely-future era even if it is the only newest option', () => {
    const future = [
      { setCode: 'ASH', label: 'ASH', start: '2026-07-10', end: '2026-07-10' },
      { setCode: 'LAW', label: 'LAW', start: '2026-03-13', end: '2026-06-16' },
    ]
    assert.notEqual(getCurrentEra(future, today)?.setCode, 'ASH')
  })

  it('returns null for no eras', () => {
    assert.equal(getCurrentEra([], today), null)
  })
})
