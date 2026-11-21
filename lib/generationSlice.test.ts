import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { withGenerationSlice } from './generationSlice'

// A stand-in for withTransaction that records the SQL it is handed.
function fakeRun(log: string[]) {
  return (async (fn: (db: unknown) => Promise<unknown>) => {
    log.push('BEGIN')
    const db = {
      query: async (sql: string, params: unknown[] = []) => {
        log.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40) + (params.length ? ` ${JSON.stringify(params)}` : ''))
        return { rows: [] }
      },
    }
    try { return await fn(db) } finally { log.push('END') }
  }) as never
}

describe('withGenerationSlice', () => {
  it('copies the rows once, with the caller\'s set and date, before running the queries', async () => {
    const log: string[] = []
    const out = await withGenerationSlice('HMW', '2026-07-11', async () => { log.push('queries'); return 7 }, fakeRun(log))
    assert.equal(out, 7)
    assert.equal(log.filter(l => l.startsWith('INSERT INTO gen_slice')).length, 1)
    assert.ok(log.find(l => l.startsWith('INSERT INTO gen_slice'))!.endsWith('["HMW","2026-07-11"]'))
    assert.ok(log.indexOf('queries') > log.findIndex(l => l.startsWith('ANALYZE gen_slice')))
  })

  it('runs one slice at a time', async () => {
    const log: string[] = []
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const first = withGenerationSlice('A', 's', async () => { await gate; return 'a' }, fakeRun(log))
    const second = withGenerationSlice('B', 's', async () => 'b', fakeRun(log))
    await new Promise(r => setTimeout(r, 10))
    assert.equal(log.filter(l => l === 'BEGIN').length, 1, 'second must not start while the first runs')
    release()
    assert.deepEqual(await Promise.all([first, second]), ['a', 'b'])
  })

  it('a failed slice does not block the next one', async () => {
    const log: string[] = []
    await assert.rejects(withGenerationSlice('A', 's', async () => { throw new Error('boom') }, fakeRun(log)), /boom/)
    assert.equal(await withGenerationSlice('B', 's', async () => 'ok', fakeRun(log)), 'ok')
  })
})
