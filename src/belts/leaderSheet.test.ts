import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildLeaderSheetBoot, leaderIdentityKey } from './leaderSheet'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'

function seeded<T>(seed: number, run: () => T): T {
  const original = Math.random
  let state = seed >>> 0
  Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000)
  try { return run() } finally { Math.random = original }
}

async function leaders() {
  await initializeCardCache()
  const cards = getCachedCards('ASH').filter(c => c.isLeader && c.variantType === 'Normal')
  return {
    commonLeaders: cards.filter(c => c.rarity === 'Common'),
    rareLeaders: cards.filter(c => c.rarity === 'Rare'),
    wovenSheet: true,
  }
}

test('rare leader seam spacing holds in the loaded hopper order', async () => {
  const options = await leaders()
  for (const stride of [1, 6]) {
    seeded(0x5ea, () => {
      let history: ReturnType<typeof buildLeaderSheetBoot> = []
      for (let boot = 0; boot < 100; boot++) {
        const sheet = buildLeaderSheetBoot({ ...options, hopperStride: stride, priorCards: history })
        for (const card of sheet) {
          if (card.rarity === 'Rare') assert.ok(!history.slice(-23).some(c => leaderIdentityKey(c) === leaderIdentityKey(card)),
            `stride ${stride}, boot ${boot}: repeated ${card.name}`)
          history.push(card)
          history = history.slice(-24)
        }
      }
    })
  }
})

// Real ASH boxes 001-011: 41 rare of 219 normal leaders (1 in 5.3) and 11 rare
// of 40 hyperspace leaders — a 4:1 common:rare print ratio, not 6:1.
test('SPEC: ASH prints each common leader 4 times for each rare (set config)', async () => {
  const { getSetConfig } = await import('../utils/setConfigs/index')
  assert.deepEqual(getSetConfig('ASH')?.beltRatios.leaderPrints, { common: 4, rare: 1 })
  assert.equal(getSetConfig('SOR')?.beltRatios.leaderPrints, undefined, 'older sets keep the 6:1 default')
})

test('SPEC: a 4:1 woven sheet prints 40 leaders — each common 4 times as two close pairs, each rare once', async () => {
  const options = await leaders()
  seeded(0x4a1, () => {
    for (let boot = 0; boot < 50; boot++) {
      const sheet = buildLeaderSheetBoot({ ...options, commonPrintsPerLeader: 4, rarePrintsPerLeader: 1 })
      assert.equal(sheet.length, 40)
      const counts = new Map<string, number>()
      for (const c of sheet) counts.set(leaderIdentityKey(c), (counts.get(leaderIdentityKey(c)) || 0) + 1)
      for (const c of options.commonLeaders) assert.equal(counts.get(leaderIdentityKey(c)), 4, `${c.name}`)
      for (const c of options.rareLeaders) assert.equal(counts.get(leaderIdentityKey(c)), 1, `${c.name}`)
      // Pairs come from the measured close-gap table (1-9 packs).
      for (const c of options.commonLeaders) {
        const at = sheet.flatMap((s, i) => leaderIdentityKey(s) === leaderIdentityKey(c) ? [i] : [])
        const closest = Math.min(...at.slice(1).map((p, i) => p - at[i]!))
        assert.ok(closest >= 1 && closest <= 9, `${c.name} nearest copies ${closest} apart`)
      }
    }
  })
})

// A box opens a fresh leader belt and pulls 24 leaders — less than one sheet.
// With the rare holes parked at the end of every cell, the third cell's rares
// sat past that horizon: ASH came out 4/24 = 16.7% rare against a 20% strip
// (LAW 1 in 9 against 1 in 7). Placement must be random so any 24 pulls see
// the strip's ratio (.claude/rules/belt-system.md, "position must be random").
test('SPEC: the first 24 pulls of a fresh leader belt carry the strip ratio (ASH 1/5, LAW 1/7)', async () => {
  await initializeCardCache()
  const { LeaderBelt } = await import('./LeaderBelt')
  for (const [set, expected] of [['ASH', 1 / 5], ['LAW', 1 / 7]] as const) {
    const BOXES = 1500
    let rare = 0
    for (let b = 0; b < BOXES; b++) {
      const belt = new LeaderBelt(set)
      for (let i = 0; i < 24; i++) if (belt.next()?.rarity === 'Rare') rare++
    }
    const share = rare / (BOXES * 24)
    // A sheet is sub-binomial, so a binomial 4σ band is conservative.
    const band = 4 * Math.sqrt(expected * (1 - expected) / (BOXES * 24))
    assert.ok(Math.abs(share - expected) <= band, `${set}: ${share.toFixed(4)} rare in a box's 24 pulls vs strip ${expected.toFixed(4)} ± ${band.toFixed(4)}`)
  }
})
