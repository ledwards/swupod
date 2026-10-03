import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { awaitImportResult } from './importPolling'
const id = 'ec7f793f-0b44-4e4f-9862-5f15a666eddd'
const pending = () => Response.json({ data: { jobId: id } }, { status: 202 })
describe('import polling', () => {
  it('supports old synchronous responses during a rolling deploy', async () => {
    const response = Response.json({ data: { rows: [] } })
    assert.equal(await awaitImportResult(response, new AbortController().signal), response)
  })
  it('polls pending work and returns the completed result without resubmitting photos', async () => {
    let calls = 0
    const fetcher: typeof fetch = async (url, options) => {
      assert.equal(url, `/api/import/jobs/${id}`)
      assert.equal(options?.credentials, 'include')
      return ++calls === 1 ? pending() : Response.json({ data: { rows: ['ready'] } })
    }
    const result = await awaitImportResult(pending(), new AbortController().signal, fetcher, async () => {})
    assert.deepEqual((await result.json()).data.rows, ['ready'])
    assert.equal(calls, 2)
  })
  it('retries transient transport failure but preserves a terminal extraction error', async () => {
    let calls = 0
    const result = await awaitImportResult(pending(), new AbortController().signal, async () => {
      if (++calls === 1) throw new Error('network interrupted')
      return Response.json({ data: { code: 'EXTRACTION_FAILED' } }, { status: 502 })
    }, async () => {})
    assert.equal(result.status, 502)
  })
  it('stops polling when the wizard is reset or unmounted', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(awaitImportResult(pending(), controller.signal, async () => { throw new Error('must not fetch') }, async () => {}), { name: 'AbortError' })
  })
})
