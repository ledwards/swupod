// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'

import { loadPoolWithRetry } from './poolApi.ts'

describe('loadPoolWithRetry', () => {
  it('retries once when pool is temporarily not found', async () => {
    let attempts = 0

    const result = await loadPoolWithRetry('share-123', {
      maxRetries: 2,
      initialDelayMs: 1,
      loadFn: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error('Pool not found')
        }
        return { shareId: 'share-123', setCode: 'SOR', cards: [] }
      },
      sleepFn: async () => {},
    })

    assert.strictEqual(attempts, 2)
    assert.strictEqual(result.shareId, 'share-123')
  })

  it('does not retry for non-not-found errors', async () => {
    let attempts = 0

    await assert.rejects(
      () => loadPoolWithRetry('share-123', {
        maxRetries: 2,
        initialDelayMs: 1,
        loadFn: async () => {
          attempts += 1
          throw new Error('Unauthorized')
        },
        sleepFn: async () => {},
      }),
      /Unauthorized/
    )

    assert.strictEqual(attempts, 1)
  })
})
