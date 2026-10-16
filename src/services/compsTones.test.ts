import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTone, zTone, TONE_WORDS } from './compsTones'

describe('comps tones', () => {
  it('grades the overall score: 90%+ matches, 50%+ close, below that off', () => {
    assert.equal(scoreTone(100), 'success')
    assert.equal(scoreTone(90), 'success')
    assert.equal(scoreTone(89), 'warning')
    assert.equal(scoreTone(50), 'warning')
    assert.equal(scoreTone(49), 'danger')
    assert.equal(scoreTone(0), 'danger')
  })

  it('grades a number by its distance from the boxes: within 1σ, within 2σ, further', () => {
    assert.equal(zTone(0), 'success')
    assert.equal(zTone(1), 'success')
    assert.equal(zTone(1.01), 'warning')
    assert.equal(zTone(2), 'warning')
    assert.equal(zTone(2.01), 'danger')
    assert.equal(zTone(7), 'danger')
  })

  it('treats an unknown distance as untoned, never as a match', () => {
    assert.equal(zTone(undefined), null)
    assert.equal(zTone(Number.NaN), null)
  })

  it('names every tone in words, so colour never travels alone', () => {
    assert.deepEqual(Object.keys(TONE_WORDS).sort(), ['danger', 'success', 'warning'])
    for (const word of Object.values(TONE_WORDS)) assert.ok(word.length > 0)
  })
})
