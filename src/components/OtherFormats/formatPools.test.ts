// SPEC (plan B1): "Your Format Pools" rows on /other-formats offer Resume or
// Build deck plus delete. Rooms for the alternate formats open under
// /other-formats; chaos sealed pools go straight to the deck builder; chaos
// draft pools reopen their draft.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { formatPoolAction, formatPoolName, formatPoolSetCode } from './formatPools.ts'

describe('formatPoolAction', () => {
  it('sends chaos sealed pools to the deck builder', () => {
    assert.deepStrictEqual(formatPoolAction('chaos_sealed', 'abc'), { label: 'Build deck', href: '/pool/abc/deck' })
  })
  it('resumes rooms under /other-formats', () => {
    assert.deepStrictEqual(formatPoolAction('rotisserie', 'r1'), { label: 'Resume', href: '/other-formats/rotisserie/r1' })
    assert.deepStrictEqual(formatPoolAction('pack_wars', 'w1'), { label: 'Resume', href: '/other-formats/pack-wars/w1' })
    assert.deepStrictEqual(formatPoolAction('pack_blitz', 'b1'), { label: 'Resume', href: '/other-formats/pack-blitz/b1' })
  })
  it('resumes chaos drafts on the draft page', () => {
    assert.deepStrictEqual(formatPoolAction('chaos_draft', 'd1'), { label: 'Resume', href: '/draft/d1' })
  })
  it('opens anything else as a pool', () => {
    assert.deepStrictEqual(formatPoolAction('mystery', 'm1'), { label: 'Open', href: '/pool/m1' })
  })
  it('encodes the share id', () => {
    assert.strictEqual(formatPoolAction('rotisserie', 'a/b').href, '/other-formats/rotisserie/a%2Fb')
  })
})

describe('formatPoolName', () => {
  it('names the five formats', () => {
    assert.deepStrictEqual(
      ['chaos_sealed', 'chaos_draft', 'rotisserie', 'pack_wars', 'pack_blitz'].map(formatPoolName),
      ['Chaos Sealed', 'Chaos Draft', 'Rotisserie', 'Pack Wars', 'Pack Blitz'],
    )
  })
  it('falls back to the raw type', () => {
    assert.strictEqual(formatPoolName('mystery'), 'mystery')
  })
})

describe('formatPoolSetCode', () => {
  it('takes the first set of a multi-set pool for its key art', () => {
    assert.strictEqual(formatPoolSetCode('SHD,TWI'), 'SHD')
    assert.strictEqual(formatPoolSetCode(' LOF '), 'LOF')
    assert.strictEqual(formatPoolSetCode(''), '')
    assert.strictEqual(formatPoolSetCode(null), '')
  })
})
