// SPEC (plans/2026-10-13-style-guide-page-migration.md, B1): the alternate-format
// hub moves to /other-formats for alpha viewers. Alpha viewers on /formats/<sub>
// are redirected to /other-formats/<sub> with the query string kept; non-alpha
// viewers on /other-formats/<sub> are sent back to /formats/<sub>, query kept.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { otherFormatsHref, legacyFormatsHref, liveChaosDraftHref } from './otherFormats.ts'

describe('otherFormatsHref', () => {
  it('is the hub with no sub-route', () => {
    assert.strictEqual(otherFormatsHref(), '/other-formats')
    assert.strictEqual(otherFormatsHref(''), '/other-formats')
  })

  it('maps a sub-route, nested paths included', () => {
    assert.strictEqual(otherFormatsHref('rotisserie'), '/other-formats/rotisserie')
    assert.strictEqual(otherFormatsHref('rotisserie/abc123'), '/other-formats/rotisserie/abc123')
  })

  it('ignores stray slashes around the sub-route', () => {
    assert.strictEqual(otherFormatsHref('/chaos-sealed/'), '/other-formats/chaos-sealed')
  })

  it('keeps the query string from a Next searchParams record, repeated keys included', () => {
    assert.strictEqual(
      otherFormatsHref('chaos-draft', { sets: ['SOR', 'SHD'], flowId: 'f1', empty: undefined }),
      '/other-formats/chaos-draft?sets=SOR&sets=SHD&flowId=f1',
    )
  })

  it('keeps the query string from URLSearchParams', () => {
    assert.strictEqual(otherFormatsHref('pack-wars', new URLSearchParams('a=1&b=two words')), '/other-formats/pack-wars?a=1&b=two+words')
  })

  it('adds no "?" when there is no query', () => {
    assert.strictEqual(otherFormatsHref('pack-blitz', {}), '/other-formats/pack-blitz')
  })
})

describe('legacyFormatsHref', () => {
  it('is the mirror image under /formats', () => {
    assert.strictEqual(legacyFormatsHref(), '/formats')
    assert.strictEqual(legacyFormatsHref('rotisserie/abc123', { x: '1' }), '/formats/rotisserie/abc123?x=1')
  })
})

describe('liveChaosDraftHref', () => {
  it('lands /draft/chaos on the merged setup with With Other Players chosen', () => {
    assert.strictEqual(liveChaosDraftHref(), '/other-formats/chaos-draft?group=friends')
    assert.strictEqual(liveChaosDraftHref({ ref: 'x' }), '/other-formats/chaos-draft?ref=x&group=friends')
  })

  it('keeps an explicit group', () => {
    assert.strictEqual(liveChaosDraftHref({ group: 'solo' }), '/other-formats/chaos-draft?group=solo')
  })
})
