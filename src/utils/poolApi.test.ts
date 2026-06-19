import { describe, it } from 'node:test'
import assert from 'node:assert'
import { loadPoolWithRetry } from './poolApi.ts'

// Issue #37: a freshly-created pool is saved fire-and-forget on pools/new, so
// the deck page can mount before the row commits. loadPoolWithRetry retries a
// transient miss instead of immediately bouncing the user back to /sealed.
describe('loadPoolWithRetry (issue #37 — pool save race)', () => {
  const pool = { shareId: 'abc', shareUrl: '/pool/abc', setCode: 'LAW', cards: [] }
  const noSleep = async () => {}

  it('returns immediately on first success (no retry on the happy path)', async () => {
    let calls = 0
    const loader = async () => { calls += 1; return pool }
    const result = await loadPoolWithRetry('abc', { loader, sleep: noSleep })
    assert.deepStrictEqual(result, pool)
    assert.strictEqual(calls, 1)
  })

  it('FIXED: retries a transient failure and succeeds once the pool commits', async () => {
    let calls = 0
    const loader = async () => {
      calls += 1
      if (calls < 3) throw new Error('404 not found') // pool still saving
      return pool
    }
    const result = await loadPoolWithRetry('abc', { loader, sleep: noSleep, attempts: 5 })
    assert.deepStrictEqual(result, pool)
    assert.strictEqual(calls, 3, 'SPEC: retry until the just-saved pool is available')
  })

  it('gives up after the configured attempts and rethrows the last error', async () => {
    let calls = 0
    const loader = async () => { calls += 1; throw new Error('gone') }
    await assert.rejects(
      loadPoolWithRetry('abc', { loader, sleep: noSleep, attempts: 4 }),
      /gone/,
    )
    assert.strictEqual(calls, 4, 'SPEC: a genuinely missing pool fails after exactly `attempts` tries')
  })
})
