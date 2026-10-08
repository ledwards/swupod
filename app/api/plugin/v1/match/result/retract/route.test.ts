// app/api/plugin/v1/match/result/retract/route.test.ts
//
// SPEC: withdrawing a match result that never belonged to this pool.
//
// `POST /api/plugin/v1/match/result` is one-way. A requeue race in the Wayfinder
// Companion made some PREMIER games report themselves as Limited (fixed
// 2026-09-04), so they were forwarded here and counted against sealed pools they
// were never played in. Fixing Wayfinder does not take them back out.
//
// These are the auth + shape specs, which need no database. The reversal
// arithmetic and the competitive refusal are pinned DB-side in
// contract-pin.test.ts.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

const REAL_SERVICE_KEY = process.env['PTP_SERVICE_KEY'] || 'test-service-key-for-unit-tests'

before(() => {
  process.env['PTP_SERVICE_KEY'] = REAL_SERVICE_KEY
})

after(() => {
  if (REAL_SERVICE_KEY === 'test-service-key-for-unit-tests') {
    delete process.env['PTP_SERVICE_KEY']
  }
})

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import('./route.ts')
  return POST(new Request('http://localhost/api/plugin/v1/match/result/retract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))
}

describe('POST /api/plugin/v1/match/result/retract', () => {
  it('returns 401 without Authorization header', async () => {
    // Server-to-server only. A retraction moves someone's record.
    const res = await post({ poolShareId: 'p', matchId: 'm', reason: 'wrong_format' })
    assert.equal(res.status, 401)
  })

  it('requires poolShareId and matchId', async () => {
    const res = await post(
      { reason: 'wrong_format' },
      { Authorization: `Bearer ${REAL_SERVICE_KEY}` },
    )
    assert.equal(res.status, 400)
  })

  it('requires a REASON — an unexplained retraction is just a deletion', async () => {
    // The reason is stored on the row and is the entire audit trail for why a
    // game vanished from someone's history. Without it the soft delete is
    // indistinguishable from data loss.
    const res = await post(
      { poolShareId: 'p', matchId: 'm' },
      { Authorization: `Bearer ${REAL_SERVICE_KEY}` },
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.match(JSON.stringify(body), /reason/i)
  })
})

// SPEC: a result forwarded under `ing-<id>` must be withdrawable by a caller
// holding the bare id, and vice versa — the write path stores under the
// canonical (bare) id, so the retract path has to normalize identically or the
// forwarded row can never be found again.
describe('retract normalizes the match id the same way the write path does', () => {
  it('reuses canonicalMatchId rather than re-deriving it', async () => {
    const { canonicalMatchId } = await import('../route.ts')
    assert.equal(canonicalMatchId('ing-match_123'), 'match_123')
    assert.equal(canonicalMatchId('match_123'), 'match_123')

    // Structural: the retract route must IMPORT that helper. A second copy of
    // the rule is how the two halves drift apart, and a drifted retract silently
    // fails to find the row it is meant to withdraw.
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, 'route.ts'), 'utf8')
    assert.match(src, /import \{ canonicalMatchId \} from '\.\.\/route'/)
  })
})
