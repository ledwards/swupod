import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isLeaderMirrorMatch, normalizeMirrorLeaderName } from './mirrorMatch'

describe('mirror match helpers', () => {
  it('normalizes leader names for mirror comparison', () => {
    assert.equal(normalizeMirrorLeaderName('  Han   Solo  '), 'han solo')
    assert.equal(normalizeMirrorLeaderName(''), null)
    assert.equal(normalizeMirrorLeaderName(null), null)
  })

  it('detects mirrors only when both leader names are present and equal', () => {
    assert.equal(isLeaderMirrorMatch('Han Solo', ' han   solo '), true)
    assert.equal(isLeaderMirrorMatch('Han Solo', 'Boba Fett'), false)
    assert.equal(isLeaderMirrorMatch('Han Solo', null), false)
    assert.equal(isLeaderMirrorMatch(null, 'Han Solo'), false)
  })
})
