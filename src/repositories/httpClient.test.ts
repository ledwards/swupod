// @ts-nocheck
import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert'

// Mock fetch for testing
let originalFetch: typeof globalThis.fetch | undefined
let mockFetchResponse: any

function mockFetch(response: any): void {
  mockFetchResponse = response
  ;(global as any).fetch = mock.fn(async () => mockFetchResponse)
}

describe('httpClient', () => {
  beforeEach(() => {
    originalFetch = (global as any).fetch
  })

  afterEach(() => {
    (global as any).fetch = originalFetch
  })

  describe('request basics', () => {
    it('makes GET request with credentials', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: { id: 1 } }),
      })

      // Dynamic import to get fresh module with mocked fetch
      const { httpClient } = await import('./httpClient.js')
      const result = await httpClient.get('/test')

      assert.deepStrictEqual(result, { id: 1 })
      assert.strictEqual((global as any).fetch.mock.calls.length, 1)

      const [url, options] = (global as any).fetch.mock.calls[0].arguments
      assert.strictEqual(url, '/api/test')
      assert.strictEqual(options.method, 'GET')
      assert.strictEqual(options.credentials, 'include')
    })

    it('makes POST request with JSON body', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: { success: true } }),
      })

      const { httpClient } = await import('./httpClient.js')
      const result = await httpClient.post('/test', { foo: 'bar' })

      assert.deepStrictEqual(result, { success: true })

      const [, options] = (global as any).fetch.mock.calls[0].arguments
      assert.strictEqual(options.method, 'POST')
      assert.strictEqual(options.headers['Content-Type'], 'application/json')
      assert.strictEqual(options.body, '{"foo":"bar"}')
    })

    it('makes PUT request', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: { updated: true } }),
      })

      const { httpClient } = await import('./httpClient.js')
      await httpClient.put('/test/1', { name: 'updated' })

      const [, options] = (global as any).fetch.mock.calls[0].arguments
      assert.strictEqual(options.method, 'PUT')
    })

    it('makes PATCH request', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: {} }),
      })

      const { httpClient } = await import('./httpClient.js')
      await httpClient.patch('/test/1', { field: 'value' })

      const [, options] = (global as any).fetch.mock.calls[0].arguments
      assert.strictEqual(options.method, 'PATCH')
    })

    it('makes DELETE request', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: { deleted: true } }),
      })

      const { httpClient } = await import('./httpClient.js')
      await httpClient.delete('/test/1')

      const [, options] = (global as any).fetch.mock.calls[0].arguments
      assert.strictEqual(options.method, 'DELETE')
    })
  })

  describe('response handling', () => {
    it('extracts data.data from response by default', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: { nested: 'value' }, other: 'ignored' }),
      })

      const { httpClient } = await import('./httpClient.js')
      const result = await httpClient.get('/test')

      assert.deepStrictEqual(result, { nested: 'value' })
    })

    it('returns full response when extractData is false', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: { nested: 'value' }, success: true }),
      })

      const { httpClient } = await import('./httpClient.js')
      const result = await httpClient.get('/test', { extractData: false })

      assert.deepStrictEqual(result, { data: { nested: 'value' }, success: true })
    })

    it('returns response as-is when no data property', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ message: 'ok' }),
      })

      const { httpClient } = await import('./httpClient.js')
      const result = await httpClient.get('/test')

      assert.deepStrictEqual(result, { message: 'ok' })
    })
  })

  describe('error handling', () => {
    it('throws HttpError on non-ok response with JSON error', async () => {
      mockFetch({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not found' }),
      })

      const { httpClient, HttpError } = await import('./httpClient.js')

      await assert.rejects(
        () => httpClient.get('/test'),
        (err: any) => {
          assert(err instanceof HttpError)
          assert.strictEqual(err.message, 'Not found')
          assert.strictEqual(err.status, 404)
          return true
        }
      )
    })

    it('throws HttpError with status text when response is not JSON', async () => {
      mockFetch({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('Not JSON') },
      })

      const { httpClient, HttpError } = await import('./httpClient.js')

      await assert.rejects(
        () => httpClient.get('/test'),
        (err: any) => {
          assert(err instanceof HttpError)
          assert.strictEqual(err.message, 'Internal Server Error')
          assert.strictEqual(err.status, 500)
          return true
        }
      )
    })

    it('includes error data in HttpError', async () => {
      mockFetch({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Validation failed', errors: ['field required'] }),
      })

      const { httpClient, HttpError } = await import('./httpClient.js')

      await assert.rejects(
        () => httpClient.post('/test', {}),
        (err: any) => {
          assert(err instanceof HttpError)
          assert.deepStrictEqual(err.data, { message: 'Validation failed', errors: ['field required'] })
          return true
        }
      )
    })

    // SPEC: the API emits TWO error shapes and both must surface their message.
    //   errorResponse('msg', 403)           -> { data: null,             message: 'msg' }
    //   jsonResponse({ error: 'msg' }, 403) -> { data: { error: 'msg' }, message: null }
    it('NEW CODE: surfaces { data: { error } } bodies (the Friends of the Pod 403)', async () => {
      mockFetch({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          data: { error: 'Friends of the Pod required to create Competitive Sealed' },
          message: null,
        }),
      })

      const { httpClient, HttpError } = await import('./httpClient.js')

      await assert.rejects(
        () => httpClient.post('/sealed', {}),
        (err: any) => {
          assert(err instanceof HttpError)
          assert.strictEqual(
            err.message,
            'Friends of the Pod required to create Competitive Sealed'
          )
          assert.strictEqual(err.status, 403)
          return true
        }
      )
    })
  })

  describe('extractApiErrorMessage', () => {
    it('reads the top-level message shape (errorResponse)', async () => {
      const { extractApiErrorMessage } = await import('./httpClient.js')
      assert.strictEqual(
        extractApiErrorMessage({ success: false, data: null, message: 'Nope' }, 'fallback'),
        'Nope'
      )
    })

    it('BUGGY: reading only .message swallowed { data: { error } } bodies', async () => {
      const { extractApiErrorMessage } = await import('./httpClient.js')
      assert.strictEqual(
        extractApiErrorMessage(
          { success: false, data: { error: 'Friends of the Pod required' }, message: null },
          'fallback'
        ),
        'Friends of the Pod required'
      )
    })

    it('falls back when the body carries no message at all', async () => {
      const { extractApiErrorMessage } = await import('./httpClient.js')
      assert.strictEqual(extractApiErrorMessage({}, 'fallback'), 'fallback')
      assert.strictEqual(extractApiErrorMessage(null, 'fallback'), 'fallback')
      assert.strictEqual(extractApiErrorMessage('oops', 'fallback'), 'fallback')
      assert.strictEqual(
        extractApiErrorMessage({ data: { error: '   ' }, message: null }, 'fallback'),
        'fallback'
      )
    })
  })

  describe('URL handling', () => {
    it('prefixes relative URLs with API_BASE', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: {} }),
      })

      const { httpClient } = await import('./httpClient.js')
      await httpClient.get('/draft/abc123')

      const [url] = (global as any).fetch.mock.calls[0].arguments
      assert.strictEqual(url, '/api/draft/abc123')
    })

    it('uses absolute URLs as-is', async () => {
      mockFetch({
        ok: true,
        json: async () => ({ data: {} }),
      })

      const { httpClient } = await import('./httpClient.js')
      await httpClient.get('https://external.api/endpoint')

      const [url] = (global as any).fetch.mock.calls[0].arguments
      assert.strictEqual(url, 'https://external.api/endpoint')
    })
  })
})
