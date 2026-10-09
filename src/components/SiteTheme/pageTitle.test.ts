import {describe, it} from 'node:test'
import assert from 'node:assert'
import {backLinkFor} from './pageTitle'

describe('site header back link', () => {
  it('names the parent section for child routes', () => {
    assert.deepStrictEqual(backLinkFor('/draft/new', 'Select a Set'), {label: 'Draft', href: '/draft'})
    assert.deepStrictEqual(backLinkFor('/formats/pack-wars', 'Pack Wars'), {label: 'Formats', href: '/formats'})
    assert.deepStrictEqual(backLinkFor('/draft/reports', 'Draft Reports'), {label: 'Draft', href: '/draft'})
  })
  it('shows no back link on a section landing page', () => {
    assert.strictEqual(backLinkFor('/draft', 'Draft Pod'), null)
    assert.strictEqual(backLinkFor('/formats', 'Casual Formats'), null)
    assert.strictEqual(backLinkFor('/', ''), null)
    assert.strictEqual(backLinkFor(null, 'History'), null)
  })
  it('never repeats the title as its own back link', () => {
    assert.strictEqual(backLinkFor('/history/archive', 'History'), null)
  })
  it('ignores sections it does not know', () => {
    assert.strictEqual(backLinkFor('/creator/voice-pack/abc', 'Voice Pack'), null)
  })
})

describe('site header subtitle', () => {
 it('caps the subtitle at a short line', async () => {
  const {SUBTITLE_MAX_LENGTH} = await import('./pageTitle')
  assert.strictEqual(SUBTITLE_MAX_LENGTH, 72)
 })
})
