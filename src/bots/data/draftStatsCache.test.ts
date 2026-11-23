// Memory regression: /api/health reported "High memory usage" with heap growing
// with uptime. getDraftStats cached the WHOLE set-wide stats object once per
// (set, host user), and botLogic pinned one per pod, with no eviction.
// Spec: set-wide stats load once per set per hour regardless of how many hosts
// draft; only the small per-host leader map is per host, and it is pruned.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getDraftStats, clearStatsCache, statsCacheSizes } from './draftStats'
import type { DraftStatsLoaders, SetDraftStats, LeaderPickStats } from './draftStats'

const HOUR = 60 * 60 * 1000

function fakeLoaders() {
  const calls = { set: 0, user: 0 }
  const loaders: DraftStatsLoaders = {
    async fetchSetStats() {
      calls.set++
      return {
        cardStats: new Map(), leaderStats: new Map(), deckProfiles: new Map(),
        segmentedLeaderStats: {}, totalDrafts: 10, fetchedAt: clock,
      } as SetDraftStats
    },
    async fetchUserLeaderStats(_set, userId) {
      calls.user++
      return new Map<string, LeaderPickStats>([[`fav-of-${userId}`, { leaderName: 'x', timesPicked: 3, firstPickRate: 1 }]])
    },
  }
  return { calls, loaders }
}

let clock = 1_000_000
const now = () => clock
beforeEach(() => { clearStatsCache(); clock = 1_000_000 })

test('FIXED: 100 distinct hosts share ONE set-wide stats load (old code loaded and kept 100)', async () => {
  const { calls, loaders } = fakeLoaders()
  for (let i = 0; i < 100; i++) await getDraftStats('LAW', `user-${i}`, loaders, now)
  assert.equal(calls.set, 1)
  assert.equal(statsCacheSizes().sets, 1)
})

test('each host still gets its own Nemesis leader stats on top of the shared stats', async () => {
  const { loaders } = fakeLoaders()
  const a = await getDraftStats('LAW', 'alice', loaders, now)
  const b = await getDraftStats('LAW', 'bob', loaders, now)
  assert.ok(a!.segmentedLeaderStats!.specificUser!.has('fav-of-alice'))
  assert.ok(b!.segmentedLeaderStats!.specificUser!.has('fav-of-bob'))
  assert.equal(a!.cardStats, b!.cardStats, 'set-wide maps are shared, not copied')
  const anon = await getDraftStats('LAW', undefined, loaders, now)
  assert.equal(anon!.segmentedLeaderStats!.specificUser, undefined)
})

test('per-host entries expire after an hour and are dropped, not kept forever', async () => {
  const { loaders } = fakeLoaders()
  for (let i = 0; i < 50; i++) await getDraftStats('LAW', `user-${i}`, loaders, now)
  assert.equal(statsCacheSizes().userLeaderStats, 50)
  clock += HOUR + 1
  await getDraftStats('LAW', 'late-user', loaders, now)
  assert.equal(statsCacheSizes().userLeaderStats, 1)
})

test('per-host entries are capped at 500', async () => {
  const { loaders } = fakeLoaders()
  for (let i = 0; i < 700; i++) await getDraftStats('LAW', `user-${i}`, loaders, now)
  assert.ok(statsCacheSizes().userLeaderStats <= 500)
})

test('set-wide stats refresh after the 1-hour TTL and serve stale on error', async () => {
  const { calls, loaders } = fakeLoaders()
  await getDraftStats('LAW', undefined, loaders, now)
  clock += HOUR + 1
  await getDraftStats('LAW', undefined, loaders, now)
  assert.equal(calls.set, 2)
  clock += HOUR + 1
  const failing = { ...loaders, fetchSetStats: async () => { throw new Error('db down') } }
  const stale = await getDraftStats('LAW', undefined, failing, now)
  assert.equal(stale!.totalDrafts, 10)
})
