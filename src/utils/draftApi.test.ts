import { describe, it } from 'node:test'
import { strictEqual } from 'node:assert'
import { HttpError } from '../repositories/httpClient'
import { isStaleSelectionError } from './draftApi'

// BUG: a leader/pack select could be rejected with a 400 "Leader not available"
// when the player's on-screen cards were stale relative to the server's current
// deal. That surfaced as a dead red error banner with no way forward. It should
// be treated like a 409 state-change: refresh the draft and let the player
// re-pick from the server's current cards. isStaleSelectionError is the classifier
// that decides "stale view -> refresh" vs "real error -> surface".
describe('isStaleSelectionError', () => {
  it('FIXED: a 400 "Leader not available" is a stale-view signal (was a dead banner)', () => {
    strictEqual(isStaleSelectionError(new HttpError('Leader not available', 400)), true)
  })

  it('FIXED: a 400 "Card not available" is a stale-view signal', () => {
    strictEqual(isStaleSelectionError(new HttpError('Card not available', 400)), true)
  })

  it('treats an explicit 409 state-change as stale (existing refresh path)', () => {
    strictEqual(isStaleSelectionError(new HttpError('State changed', 409)), true)
  })

  it('does NOT treat an unrelated 400 as stale — must not silently refresh-and-loop', () => {
    strictEqual(isStaleSelectionError(new HttpError('Invalid request', 400)), false)
  })

  it('does NOT treat other statuses (403, 500) as stale', () => {
    strictEqual(isStaleSelectionError(new HttpError('Forbidden', 403)), false)
    strictEqual(isStaleSelectionError(new HttpError('Server error', 500)), false)
  })

  it('does NOT treat a plain Error (no HTTP status) as stale', () => {
    strictEqual(isStaleSelectionError(new Error('Leader not available')), false)
    strictEqual(isStaleSelectionError(null), false)
    strictEqual(isStaleSelectionError(undefined), false)
  })
})
