import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cachedAggregate, queryCacheSize, STATS_AGGREGATE_TTL_MS } from './queryCache'

test('FIXED: expired keys are dropped from memory, not just ignored on read', async () => {
  let clock = 10_000_000
  const now = () => clock
  const before = queryCacheSize()
  for (let i = 0; i < 200; i++) await cachedAggregate(`k-${i}`, STATS_AGGREGATE_TTL_MS, async () => ({ i }), now)
  assert.equal(queryCacheSize() - before, 200)
  clock += STATS_AGGREGATE_TTL_MS + 60_001
  await cachedAggregate('fresh', STATS_AGGREGATE_TTL_MS, async () => 1, now)
  assert.equal(queryCacheSize(), 1)
})

test('unexpired values are still served from cache', async () => {
  let n = 0
  const now = () => 50_000_000
  await cachedAggregate('same', 1000, async () => ++n, now)
  assert.equal(await cachedAggregate('same', 1000, async () => ++n, now), 1)
})
