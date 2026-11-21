import { describe, it } from 'node:test'
import assert from 'node:assert'
import { statCachedDurable, type StatStore, type StoredStat } from './statCache'

function memoryStore(): StatStore & { rows: Map<string, StoredStat>; saves: number } {
  const rows = new Map<string, StoredStat>()
  const s = {
    rows,
    saves: 0,
    async load(key: string) { return rows.get(key) ?? null },
    async save(key: string, payload: unknown) { s.saves++; rows.set(key, { payload, computedAt: Date.now() }) },
  }
  return s
}

describe('statCachedDurable', () => {
  it('computes once when nothing is stored, then reads the stored result', async () => {
    const store = memoryStore()
    let runs = 0
    const compute = async () => { runs++; return { n: 1 } }
    assert.deepStrictEqual(await statCachedDurable('a', compute, { store }), { n: 1 })
    assert.deepStrictEqual(await statCachedDurable('a', compute, { store }), { n: 1 })
    assert.strictEqual(runs, 1)
    assert.strictEqual(store.saves, 1)
  })

  it('shares one computation between concurrent requests for a key', async () => {
    const store = memoryStore()
    let runs = 0
    let release: (v: number) => void = () => {}
    const compute = () => { runs++; return new Promise<number>(r => { release = r }) }
    const first = statCachedDurable('b', compute, { store })
    const second = statCachedDurable('b', compute, { store })
    const third = statCachedDurable('b', compute, { store })
    await new Promise(r => setImmediate(r))
    release(7)
    assert.deepStrictEqual(await Promise.all([first, second, third]), [7, 7, 7])
    assert.strictEqual(runs, 1)
  })

  it('serves a stale result at once and refreshes it in the background', async () => {
    const store = memoryStore()
    store.rows.set('c', { payload: 'old', computedAt: 0 })
    let done: () => void = () => {}
    const refreshed = new Promise<void>(r => { done = r })
    const compute = async () => { setImmediate(done); return 'new' }
    assert.strictEqual(await statCachedDurable('c', compute, { store, maxAgeMs: 1000, now: () => 5000 }), 'old')
    await refreshed
    await new Promise(r => setImmediate(r))
    assert.strictEqual(store.rows.get('c')?.payload, 'new')
  })

  it('does not recompute a result that is still fresh', async () => {
    const store = memoryStore()
    store.rows.set('d', { payload: 'kept', computedAt: 4500 })
    let runs = 0
    const got = await statCachedDurable('d', async () => { runs++; return 'x' }, { store, maxAgeMs: 1000, now: () => 5000 })
    assert.strictEqual(got, 'kept')
    assert.strictEqual(runs, 0)
  })

  it('stores nothing when the computation fails, so the next request retries', async () => {
    const store = memoryStore()
    await assert.rejects(statCachedDurable('e', async () => { throw new Error('boom') }, { store }))
    assert.strictEqual(store.rows.has('e'), false)
    assert.strictEqual(await statCachedDurable('e', async () => 'ok', { store }), 'ok')
  })
})
