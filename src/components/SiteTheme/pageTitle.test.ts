import {describe, it} from 'node:test'
import assert from 'node:assert'
import {trailFor} from './pageTitle'

describe('site header trail', () => {
  it('names the parent section for child routes', () => {
    assert.deepStrictEqual(trailFor('/draft/new', 'Select a Set'), {label: 'Draft', href: '/draft'})
    assert.deepStrictEqual(trailFor('/formats/pack-wars', 'Pack Wars'), {label: 'Formats', href: '/formats'})
    assert.deepStrictEqual(trailFor('/draft/reports', 'Draft Reports'), {label: 'Draft', href: '/draft'})
  })
  it('shows no crumb on a section landing page', () => {
    assert.strictEqual(trailFor('/draft', 'Draft Pod'), null)
    assert.strictEqual(trailFor('/formats', 'Casual Formats'), null)
    assert.strictEqual(trailFor('/', ''), null)
    assert.strictEqual(trailFor(null, 'History'), null)
  })
  it('never repeats the title as its own crumb', () => {
    assert.strictEqual(trailFor('/history/archive', 'History'), null)
  })
  it('ignores sections it does not know', () => {
    assert.strictEqual(trailFor('/creator/voice-pack/abc', 'Voice Pack'), null)
  })
})
