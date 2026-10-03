import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { enqueueImport, claimImport, findImport, finishImport, runImportJob, publicJobResponse } from './importJobs'

it('durable import lifecycle: deduplication, restart fencing, owner isolation, and result recovery', async () => {
  // Temporary tables and rollback keep this independent of all application data.
  const db = new pg.Client({ connectionString: 'postgresql://localhost:5432/swupod_test' })
  await db.connect()
  try {
    await db.query('BEGIN')
    await db.query('CREATE TEMP TABLE users (id UUID PRIMARY KEY)')
    await db.query(readFileSync(new URL('../migrations/106_import_jobs.sql', import.meta.url), 'utf8').replace('CREATE TABLE IF NOT EXISTS import_jobs', 'CREATE TEMP TABLE import_jobs'))
    const owner = randomUUID(), other = randomUUID()
    await db.query('INSERT INTO users(id) VALUES ($1),($2)', [owner, other])
    const readRow = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] ?? null
    const write = async (sql: string, args: unknown[] = []) => await db.query(sql, args)
    const input = { photoKeys: [`import-uploads/${owner}/example.jpg`] }
    const first = await enqueueImport(owner, 'extract', input, readRow)
    const retry = await enqueueImport(owner, 'extract', input, readRow)
    assert.equal(first?.id, retry?.id, 'HTTP retry reuses the active job')
    assert.equal(await findImport(String(first?.id), other, readRow), null, 'other users cannot read a job')
    const abandoned = await claimImport(readRow)
    const recovered = await claimImport(readRow)
    assert.ok(abandoned && recovered)
    assert.equal(abandoned.id, recovered.id)
    assert.notEqual(abandoned.attempt_token, recovered.attempt_token)
    await finishImport(abandoned.id, abandoned.attempt_token, 200, { data: 'stale' }, write)
    assert.equal((await findImport(abandoned.id, owner, readRow))?.status, 'running')
    await runImportJob(recovered, {
      execute: async () => Response.json({ success: true, data: { rows: [{ name: 'Example card' }] } }),
      finish: (id, token, status, body) => finishImport(id, token, status, body, write),
    })
    const complete = await findImport(recovered.id, owner, readRow)
    assert.ok(complete)
    assert.equal(complete.status, 'succeeded')
    assert.equal(publicJobResponse(complete).status, 200)
    assert.deepEqual((await publicJobResponse(complete).json()).data.rows, [{ name: 'Example card' }])
    assert.equal(await claimImport(readRow), null)
  } finally { await db.query('ROLLBACK'); await db.end() }
})
