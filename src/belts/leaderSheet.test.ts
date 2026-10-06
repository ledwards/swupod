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
