import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import {
  buildLimitedServerProperties,
  captureServerEvent,
  isPostHogServerEnabled,
} from './posthog.ts'

const originalFetch = globalThis.fetch
const originalEnv = { ...process.env }
const originalWarn = console.warn

beforeEach(() => {
  process.env = { ...originalEnv }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  console.warn = originalWarn
  process.env = { ...originalEnv }
})

describe('server PostHog capture', () => {
  it('does nothing when no PostHog key is configured', async () => {
    delete process.env.POSTHOG_KEY
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      return new Response('{}', { status: 200 })
    }

    assert.strictEqual(isPostHogServerEnabled(), false)
    const captured = await captureServerEvent('limited_pod_created', 'user-1', { format: 'draft' })

    assert.strictEqual(captured, false)
    assert.strictEqual(calls, 0)
  })

  it('posts capture payloads to the configured host', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key'
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://example.posthog.test/'

    let capturedUrl = ''
    let capturedBody: any = null
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url)
      capturedBody = JSON.parse(String(init?.body))
      return new Response('{}', { status: 200 })
    }

    const captured = await captureServerEvent('limited_pod_created', 'user-1', { format: 'draft' })

    assert.strictEqual(captured, true)
    assert.strictEqual(capturedUrl, 'https://example.posthog.test/capture/')
    assert.strictEqual(capturedBody.api_key, 'phc_test_key')
    assert.strictEqual(capturedBody.event, 'limited_pod_created')
    assert.strictEqual(capturedBody.distinct_id, 'user-1')
    // swupod tags every server event with surface:'swupod' so it segments within
    // the shared Wayfinder PostHog project (see captureServerEvent).
    assert.deepStrictEqual(capturedBody.properties, { format: 'draft', surface: 'swupod' })
  })

  it('swallows transport failures and reports false', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test_key'
    console.warn = () => {}
    globalThis.fetch = async () => {
      throw new Error('network down')
    }

    const captured = await captureServerEvent('limited_pod_created', 'user-1', {})

    assert.strictEqual(captured, false)
  })

  it('builds limited properties without exposing raw share IDs', () => {
    const properties = buildLimitedServerProperties({
      format: 'sealed',
      mode: 'group',
      setCode: 'JTL',
      shareId: 'pool-share-123',
      podShareId: 'pod-share-123',
      currentUrl: '/pool/pool-share-123/deck/play',
    })

    assert.strictEqual(properties.format, 'sealed')
    assert.strictEqual(properties.mode, 'group')
    assert.strictEqual(properties.set_code, 'JTL')
    assert.strictEqual(properties.route_template, '/pool/[shareId]/deck/play')
    assert.notStrictEqual(properties.pool_id_hash, 'pool-share-123')
    assert.notStrictEqual(properties.pod_id_hash, 'pod-share-123')
    assert.strictEqual('shareId' in properties, false)
    assert.strictEqual('podShareId' in properties, false)
    assert.strictEqual('currentUrl' in properties, false)
  })
})
