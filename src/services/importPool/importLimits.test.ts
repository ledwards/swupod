/**
 * Spend limits on the Import Pool pipeline (2026-11-19): the $18-a-sheet legacy
 * fallback is opt-in, and each user has a daily allowance. See importLimits.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import {
  IMPORT_DAILY_LIMIT_DEFAULTS,
  ImportLimitError,
  importDailyLimit,
  legacyFallbackEnabled,
} from './importLimits'
import { enqueueImport } from '../../../lib/importJobs'

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

test('the legacy fallback is off unless an operator turns it on', () => {
  assert.equal(legacyFallbackEnabled({}), false)
  assert.equal(legacyFallbackEnabled({ IMPORT_LEGACY_FALLBACK: '0' }), false)
  assert.equal(legacyFallbackEnabled({ IMPORT_LEGACY_FALLBACK: 'true' }), false)
  assert.equal(legacyFallbackEnabled({ IMPORT_LEGACY_FALLBACK: '1' }), true)
})

test('the extractor reaches the legacy loop only behind that switch', () => {
  // Structural: the legacy call must come after the switch is consulted, in
  // the same catch block. An unguarded call is an unbounded $18 per sheet.
  const src = read('lib/importExtraction.ts')
  const legacyCalls = [...src.matchAll(/extractPoolFromImages\(imagesIn/g)]
  assert.equal(legacyCalls.length, 1, 'exactly one legacy call site')
  const guard = src.indexOf('if (!legacyFallbackEnabled())')
  assert.ok(guard > -1, 'the switch is consulted')
  assert.ok(guard < legacyCalls[0].index!, 'and consulted before the legacy call')
  const between = src.slice(guard, legacyCalls[0].index!)
  assert.match(between, /throw wholeTableErr/, 'with the switch off the original failure is rethrown')
})

test('daily allowances have defaults and honour overrides', () => {
  assert.deepEqual(IMPORT_DAILY_LIMIT_DEFAULTS, { extract: 40, section: 200 })
  assert.equal(importDailyLimit('extract', {}), 40)
  assert.equal(importDailyLimit('section', {}), 200)
  assert.equal(importDailyLimit('extract', { IMPORT_EXTRACT_DAILY_LIMIT: '5' }), 5)
  assert.equal(importDailyLimit('section', { IMPORT_SECTION_DAILY_LIMIT: '0' }), 0)
})

test('a malformed override falls back to the default instead of lifting the limit', () => {
  for (const bad of ['unlimited', '-1', '2.5', ' ', 'Infinity']) {
    assert.equal(importDailyLimit('extract', { IMPORT_EXTRACT_DAILY_LIMIT: bad }), 40, bad)
  }
})

/** A fake `readRow` over an in-memory job list, shaped like the three queries enqueueImport runs. */
function fakeDb(existing: Array<{ status: string; hash?: string }>) {
  const inserted: unknown[][] = []
  const readRow = async (sql: string, args: unknown[] = []) => {
    if (/^\s*SELECT id, status/.test(sql)) {
      const hit = existing.find((j) => j.hash === args[2] && ['queued', 'running'].includes(j.status))
      return hit ? { id: 'active-job', status: hit.status } : null
    }
    if (/count\(\*\)/.test(sql)) return { n: existing.length }
    inserted.push(args)
    return { id: 'new-job', status: 'queued' }
  }
  return { readRow: readRow as never, inserted }
}

const jobs = (n: number) => Array.from({ length: n }, () => ({ status: 'succeeded' }))

test('a user under the allowance can start a job', async () => {
  const db = fakeDb(jobs(39))
  const job = await enqueueImport('user', 'extract', { photoKeys: ['a'] }, db.readRow)
  assert.equal(job?.id, 'new-job')
  assert.equal(db.inserted.length, 1)
})

test('a user at the allowance is refused before any job is created', async () => {
  const db = fakeDb(jobs(40))
  await assert.rejects(
    () => enqueueImport('user', 'extract', { photoKeys: ['a'] }, db.readRow),
    (error: unknown) => error instanceof ImportLimitError && error.limit === 40 && error.kind === 'extract',
  )
  assert.equal(db.inserted.length, 0, 'no job row, so no model call')
})

test('a retry of a job that is already running is reused even at the allowance', async () => {
  const { createHash } = await import('node:crypto')
  const input = { photoKeys: ['a'] }
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const db = fakeDb([...jobs(40), { status: 'running', hash }])
  const job = await enqueueImport('user', 'extract', input, db.readRow)
  assert.equal(job?.id, 'active-job')
  assert.equal(db.inserted.length, 0)
})

test('the route answers a refused import with 429, not a 500', () => {
  const src = read('lib/importJobRoute.ts')
  assert.match(src, /error instanceof ImportLimitError/)
  assert.match(src, /IMPORT_LIMIT_REACHED[\s\S]{0,80}429/)
})
