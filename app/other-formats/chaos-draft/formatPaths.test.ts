// SPEC (routing contract, Workstream B1/B2): alpha viewers on /formats/<sub> go to
// /other-formats/<sub> with the query preserved; everyone else on /other-formats/<sub> goes
// back to /formats/<sub>. /draft/chaos (the old live page) lands alpha viewers on the merged
// Chaos Draft setup with "With Other Players" chosen.
import { describe, test } from 'node:test'
import assert from 'node:assert'
import { legacyFormatsPath, liveChaosDraftPath, otherFormatsPath, withQuery } from './formatPaths.ts'

describe('Chaos format redirect paths', () => {
  test('alpha: /formats/<sub> → /other-formats/<sub>', () => {
    assert.strictEqual(otherFormatsPath('chaos-draft'), '/other-formats/chaos-draft')
    assert.strictEqual(otherFormatsPath('chaos-sealed', {}), '/other-formats/chaos-sealed')
  })

  test('non-alpha: /other-formats/<sub> → /formats/<sub>', () => {
    assert.strictEqual(legacyFormatsPath('chaos-sealed'), '/formats/chaos-sealed')
  })

  test('keeps the query, including repeated keys', () => {
    assert.strictEqual(
      otherFormatsPath('chaos-sealed', { ref: 'gift', tag: ['a', 'b'], gone: undefined }),
      '/other-formats/chaos-sealed?ref=gift&tag=a&tag=b',
    )
    assert.strictEqual(legacyFormatsPath('chaos-draft', { group: 'friends' }), '/formats/chaos-draft?group=friends')
  })

  test('encodes values', () => {
    assert.strictEqual(withQuery('/x', { q: 'a b&c' }), '/x?q=a+b%26c')
  })

  test('/draft/chaos → the merged setup on With Other Players', () => {
    assert.strictEqual(liveChaosDraftPath(), '/other-formats/chaos-draft?group=friends')
    assert.strictEqual(liveChaosDraftPath({ ref: 'x' }), '/other-formats/chaos-draft?ref=x&group=friends')
    assert.strictEqual(liveChaosDraftPath({ group: 'solo' }), '/other-formats/chaos-draft?group=solo')
  })
})
