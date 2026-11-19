// Tests for IC27 (Icons 2027 Edition) — a NON-CORE product, Chaos only.
//
// SPEC: Icons has no set number, rotates nothing, and opens in Chaos formats
// only (Chaos Sealed, Chaos Draft) — never draft, sealed, or any single-set
// format. Its packs are printed on the Block B press.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { IC27_CONFIG } from './IC27'
import { SET_CONFIGS, getAllSetCodes, getSetConfig, isChaosOnlySet } from './index'
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

  it('SPEC: still resolvable for pack printing', () => {
    assert.strictEqual(getSetConfig('IC27'), IC27_CONFIG)
  })

  it('SPEC: rejected for draft / sealed even for admins, allowed for Chaos', () => {
    assert.match(getUnavailableSetReason('IC27', admin) ?? '', /only available in Chaos/)
    assert.match(getUnavailableSetReason('HMW,IC27', admin) ?? '', /only available in Chaos/)
    assert.strictEqual(getUnavailableSetReason('IC27', admin, { allowChaosOnly: true }), null)
    assert.strictEqual(getUnavailableSetReason('HMW', admin), null)
  })

  it('SPEC: prints full 16-card Block B packs from Icons cards only', async () => {
    await initializeCardCache()
    clearBeltCache()
    for (let i = 0; i < 48; i++) {
      const pack = generateBoosterPack([], 'IC27')
      assert.strictEqual(pack.cards.length, 16)
      assert.ok(pack.cards.every((c: { set: string }) => c.set === 'IC27'))
      assert.ok(pack.cards[0].isLeader, 'slot 0 is the leader')
      assert.ok(pack.cards[1].isBase, 'slot 1 is the base (Icons bases are Special)')
      assert.strictEqual(pack.cards[11].variantType, 'Hyperspace Foil', 'slot 11 is the HS foil')
    }
  })
})
