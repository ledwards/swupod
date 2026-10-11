import {describe, it} from 'node:test'
import assert from 'node:assert'

describe('site header subtitle', () => {
 it('caps the subtitle at a short line', async () => {
  const {SUBTITLE_MAX_LENGTH} = await import('./pageTitle')
  assert.strictEqual(SUBTITLE_MAX_LENGTH, 72)
 })
})
