import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateImportInput, publicJobResponse, runImportJob } from './importJobs'

const owner = 'a71ab70a-1fa2-4360-8e37-a1f860c79c2e'
describe('asynchronous imports', () => {
  it('rejects another user’s photos and traversal before queuing paid work', () => {
    for (const key of ['import-uploads/other/photo.jpg', `import-uploads/${owner}/../photo.jpg`, '/etc/passwd']) {
      assert.throws(() => validateImportInput('extract', { photoKeys: [key] }, owner))
    }
  })
  it('accepts owned photos and validates legacy inline image payloads', () => {
    assert.deepEqual(validateImportInput('extract', { photoKeys: [`import-uploads/${owner}/photo.jpg`] }, owner), { photoKeys: [`import-uploads/${owner}/photo.jpg`] })
    assert.throws(() => validateImportInput('extract', { images: [{ data: 'abc', mediaType: 'text/html' }] }, owner))
    assert.throws(() => validateImportInput('extract', { photoKeys: [] }, owner))
  })
  it('never exposes job inputs, photos, or results before completion', async () => {
    const response = publicJobResponse({ id: 'job', status: 'running', input: { images: ['secret'] } })
    assert.equal(response.status, 202)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual((await response.json()).data, { jobId: 'job', status: 'running' })
  })
  it('preserves the extractor’s successful response and error status', async () => {
    const payload = { success: false, data: { code: 'SET_DETECTION_FAILED' } }
    const response = publicJobResponse({ id: 'job', status: 'failed', result: payload, http_status: 422 })
    assert.equal(response.status, 422)
    assert.deepEqual(await response.json(), payload)
  })
  it('finishes background work only after the extractor resolves', async () => {
    const writes: unknown[] = []
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const pending = runImportJob({ id: 'job', user_id: owner, kind: 'extract', input: {}, attempt_token: 'fence' }, {
      execute: async () => { await gate; return new Response(JSON.stringify({ success: true, data: { rows: [] } })) },
      finish: async (...args) => { writes.push(args) },
    })
    assert.equal(writes.length, 0)
    release(); await pending
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0], ['job', 'fence', 200, { success: true, data: { rows: [] } }])
  })
  it('records a generic failure without leaking an upstream secret', async () => {
    let result: unknown
    await runImportJob({ id: 'job', user_id: owner, kind: 'extract', input: {}, attempt_token: 'fence' }, {
      execute: async () => { throw new Error('secret-key') },
      finish: async (_id, _token, _status, body) => { result = body },
    })
    assert.ok(JSON.stringify(result).includes('EXTRACTION_FAILED'))
    assert.ok(!JSON.stringify(result).includes('secret-key'))
  })
})
