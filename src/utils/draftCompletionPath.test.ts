import {test} from 'node:test'
import assert from 'node:assert/strict'
import {draftCompletionPath} from './draftCompletionPath'
test('Play draft returns to its selected set with the new pool', () => {
  const result = new URL(draftCompletionPath('?returnTo=' + encodeURIComponent('/play?format=draft&set=SHD'), 'new-pool'), 'https://ptp.invalid')
  assert.equal(result.pathname, '/play')
  assert.equal(result.searchParams.get('set'), 'SHD')
  assert.equal(result.searchParams.get('format'), 'draft')
  assert.equal(result.searchParams.get('draftedPool'), 'new-pool')
})
test('ordinary drafts and untrusted destinations keep the deck builder', () => {
  for (const returnTo of ['', '//example.com', 'https://example.com/play', '/history']) {
    assert.equal(draftCompletionPath('?returnTo=' + encodeURIComponent(returnTo), 'new-pool'), '/pools/new-pool')
  }
})
