// app/api/plugin/v1/play/[format]/[shareId]/route.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getLatestReleasedSetCode } from '../../../../../../../src/utils/setConfigs/latest.js'
import { SET_CONFIGS } from '../../../../../../../src/utils/setConfigs/index.js'

describe('getLatestReleasedSetCode', () => {
  it('returns a set code string', () => {
    const code = getLatestReleasedSetCode()
    assert.ok(typeof code === 'string')
    assert.ok(code.length > 0)
  })

  it('is one of the known set codes', () => {
    const code = getLatestReleasedSetCode()
    assert.ok(Object.keys(SET_CONFIGS).includes(code),
      `Expected ${code} to be in SET_CONFIGS`)
  })
})
