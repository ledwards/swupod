// Tests for IC27 (Icons 2027 Edition) — a NON-CORE product, Chaos only.
//
// SPEC: Icons has no set number, rotates nothing, and opens in Chaos formats
// only (Chaos Sealed, Chaos Draft) — never draft, sealed, or any single-set
// format. Its packs are printed on the Block B press.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { IC27_CONFIG } from './IC27'
import { SET_CONFIGS, getAllSetCodes, getSetConfig, isChaosOnlySet, hasLeaderSlot, countLeaderDraftRounds } from './index'
import { getPremierLegalSets } from './latest'
import { getUnavailableSetReason } from '../setAvailability'
import { initializeCardCache } from '../cardCache'
import { generateBoosterPack, clearBeltCache } from '../boosterPack'

const admin = { is_admin: true, is_beta_tester: true }

describe('IC27_CONFIG', () => {
  it('SPEC: Icons is code IC27 and Chaos-only', () => {
    assert.strictEqual(IC27_CONFIG.setCode, 'IC27')
    assert.strictEqual(IC27_CONFIG.setName, 'Icons 2027 Edition')
    assert.strictEqual(IC27_CONFIG.chaosOnly, true)
    assert.strictEqual(isChaosOnlySet('IC27'), true)
    assert.strictEqual(isChaosOnlySet('HMW'), false)
  })

  it('SPEC: never in the core registry, so no picker, rotation or Play pool sees it', () => {
    assert.strictEqual(SET_CONFIGS.IC27, undefined)
    assert.ok(!getAllSetCodes().includes('IC27'))
    assert.ok(!getPremierLegalSets().has('IC27'))
  })

  it('SPEC: Icons has no leader slot, so it adds no leader-draft round', () => {
    assert.strictEqual(hasLeaderSlot('IC27'), false)
    assert.strictEqual(hasLeaderSlot('HMW'), true)
    assert.strictEqual(hasLeaderSlot('LAW-CB'), true)
    assert.strictEqual(countLeaderDraftRounds(['HMW', 'IC27', 'LAW']), 2)
    assert.strictEqual(countLeaderDraftRounds(['IC27', 'IC27', 'IC27']), 0)
  })

  it('SPEC: still resolvable for pack printing', () => {
    assert.strictEqual(getSetConfig('IC27'), IC27_CONFIG)
  })

  it('SPEC: rejected for draft / sealed even for admins, allowed for Chaos', () => {
    assert.match(getUnavailableSetReason('IC27', admin) ?? '', /only available in Chaos/)
    assert.match(getUnavailableSetReason('HMW,IC27', admin) ?? '', /only available in Chaos/)
    assert.strictEqual(getUnavailableSetReason('IC27', admin, { allowChaosOnly: true }), null)
    assert.strictEqual(getUnavailableSetReason('HMW', admin), null)
  })

  it('SPEC: prints 9-card packs in the Icons slot layout, from Icons cards only', async () => {
    await initializeCardCache()
    clearBeltCache()
    const N = 960
    let leaders = 0
    for (let i = 0; i < N; i++) {
      const pack = generateBoosterPack([], 'IC27')
      const c = pack.cards
      assert.strictEqual(c.length, 9, 'FFG pouch: 9-CARD BOOSTER PACK')
      assert.ok(c.every((x: { set: string }) => x.set === 'IC27'))
      assert.ok(!c.some((x: { isBase?: boolean; variantType: string }) => x.isBase && x.variantType === 'Normal'), 'no base slot')
      for (const k of [0, 1, 2]) assert.strictEqual(c[k].rarity, 'Common')
      if (c[3].isLeader) leaders++
      else assert.strictEqual(c[3].rarity, 'Common', 'slot 3 is a common when not a leader')
      assert.strictEqual(c[4].rarity, 'Common')
      assert.strictEqual(c[4].variantType, 'Hyperspace', 'slot 4 is the guaranteed HS common')
      assert.ok(['Rare', 'Legendary'].includes(c[7].rarity), 'slot 7 is the R/L')
      assert.strictEqual(c[8].variantType, 'Hyperspace Foil', 'slot 8 is the HS foil')
    }
    // SPEC: leader in 1 of 4 packs (Card Gamer: 25%). 960 packs: sd of the rate is ~0.014, so 0.045 is ~3σ.
    const rate = leaders / N
    assert.ok(Math.abs(rate - 0.25) < 0.045, `leader rate ${rate}`)
  })
})
