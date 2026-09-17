// Tests for HMW (Homeworlds, Set 9) set configuration.
//
// These are SPEC tests against FFG's published facts and the Block B rules,
// not against whatever the config happens to contain. The scaffolding lands
// months before any card data exists, so the config is the only thing
// asserting HMW behaves like a Block B set at all.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { HMW_CONFIG } from './HMW'
import { ASH_CONFIG } from './ASH'
import { SET_CONFIGS, getSetConfig, getPublicAccessDate, isBeta, isPrerelease, isReleased } from './index'
import { getKarabastCardPool, getPremierLegalSets } from './latest'
import { getBlockForSet } from '../../belts/data/commonBeltAssignments'

const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`)

describe('HMW_CONFIG', () => {
  describe('identity', () => {
    it('SPEC: Homeworlds is set 9, code HMW', () => {
      assert.strictEqual(HMW_CONFIG.setCode, 'HMW')
      assert.strictEqual(HMW_CONFIG.setName, 'Homeworlds')
      assert.strictEqual(HMW_CONFIG.setNumber, 9)
    })

    it('SPEC: street date is 2026-10-09, prerelease one week earlier', () => {
      // Release is announced. Prerelease is derived from LAW and ASH (both
      // exactly release - 7d) and must be corrected when FFG publishes it —
      // this date is what opens the set to non-beta users.
      assert.strictEqual(HMW_CONFIG.releaseDate, '2026-10-09')
      assert.strictEqual(HMW_CONFIG.prereleaseDate, '2026-10-02')
      const gapDays =
        (new Date(HMW_CONFIG.releaseDate).getTime() -
          new Date(HMW_CONFIG.prereleaseDate).getTime()) /
        86_400_000
      assert.strictEqual(gapDays, 7)
    })

    it('is registered in SET_CONFIGS and resolvable by code', () => {
      assert.strictEqual(SET_CONFIGS.HMW, HMW_CONFIG)
      assert.strictEqual(getSetConfig('HMW'), HMW_CONFIG)
    })

    it('has a hex color distinct from every other set', () => {
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(HMW_CONFIG.color), 'color should be hex')
      const others = Object.values(SET_CONFIGS)
        .filter(c => c.setCode !== 'HMW')
        .map(c => c.color.toUpperCase())
      assert.ok(!others.includes(HMW_CONFIG.color.toUpperCase()), 'color should be unique')
    })
  })

  describe('Block B pack rules', () => {
    it('SPEC: is a Block B set for belt assignment', () => {
      assert.strictEqual(getBlockForSet('HMW'), 'B')
    })

    it('SPEC: no regular foils — the foil slot is always Hyperspace Foil', () => {
      assert.strictEqual(HMW_CONFIG.packRules.foilSlotIsHyperspaceFoil, true)
      assert.strictEqual(HMW_CONFIG.upgradeProbabilities.foilToHyperfoil, 0)
    })

    it('SPEC: every pack has a guaranteed Hyperspace common in slot 5', () => {
      assert.strictEqual(HMW_CONFIG.packRules.guaranteedHyperspaceCommon, true)
      assert.strictEqual(HMW_CONFIG.packRules.hyperspaceCommonSlot, 5)
    })

    it('SPEC: prestige cards appear in standard boosters at the Block B rate', () => {
      assert.strictEqual(HMW_CONFIG.packRules.prestigeInStandardPacks, true)
      // ~1.1 tier-1 prestige per 24-pack box.
      assert.strictEqual(HMW_CONFIG.upgradeProbabilities.uc3ToPrestige, 1 / 22)
      assert.strictEqual(HMW_CONFIG.upgradeProbabilities.rareToPrestige, 0)
    })

    it('SPEC: the rare slot never upgrades to Hyperspace', () => {
      assert.strictEqual(HMW_CONFIG.upgradeProbabilities.commonToHyperspace, 0)
    })

    it('inherits ASH pack rules wholesale — any divergence must be deliberate', () => {
      assert.deepStrictEqual(HMW_CONFIG.packRules, ASH_CONFIG.packRules)
      assert.deepStrictEqual(HMW_CONFIG.beltRatios, ASH_CONFIG.beltRatios)
      assert.deepStrictEqual(HMW_CONFIG.dedupWindows, ASH_CONFIG.dedupWindows)
    })
  })

  describe('card counts', () => {
    it('SPEC: four Common bases per primary aspect (Tatooine/Naboo/Endor/Kashyyyk)', () => {
      // The one count sourced from the first look rather than copied from ASH.
      // 4 primary aspects x 4 base traits = 16, and it is a floor: the article
      // does not rule out Neutral bases on top.
      assert.ok(
        HMW_CONFIG.cardCounts.bases.common >= 16,
        `expected at least 16 common bases, got ${HMW_CONFIG.cardCounts.bases.common}`
      )
    })

    it('has a full set of positive bucket counts', () => {
      const { cardCounts } = HMW_CONFIG
      for (const key of ['commons', 'uncommons', 'rares', 'legendaries', 'specials']) {
        assert.ok(cardCounts[key] > 0, `${key} should be a positive placeholder`)
      }
      assert.ok(cardCounts.leaders.total > 0)
      assert.ok(cardCounts.bases.total > 0)
    })
  })

  describe('release gating', () => {
    it('SPEC: beta-only for ten days from betaAccessDate, then open to everyone', () => {
      // HMW opened to beta the day FFG published the full checklist.
      assert.strictEqual(HMW_CONFIG.betaAccessDate, '2026-09-17')
      assert.strictEqual(getPublicAccessDate(HMW_CONFIG), '2026-09-27')
      assert.strictEqual(isBeta(HMW_CONFIG, at('2026-09-26')), true, 'day 9 — still beta')
      assert.strictEqual(isBeta(HMW_CONFIG, at('2026-09-27')), false, 'day 10 — public')
    })

    it('SPEC: public access precedes FFG pre-release, which still begins 2026-10-02', () => {
      // The point of the 10-day window: everyone is in well before the
      // real-world pre-release, which is unchanged and still drives
      // isPrerelease and the displayed pre-release date.
      assert.strictEqual(isBeta(HMW_CONFIG, at('2026-10-01')), false)
      assert.strictEqual(isPrerelease(HMW_CONFIG, at('2026-10-02')), true)
    })

    it('SPEC: not released until the street date', () => {
      assert.strictEqual(isReleased(HMW_CONFIG, at('2026-10-08')), false)
      assert.strictEqual(isReleased(HMW_CONFIG, at('2026-10-09')), true)
    })

    it('SPEC: Karabast pool is Next Set until release, Current after', () => {
      assert.strictEqual(getKarabastCardPool('HMW', at('2026-10-08')), 'Next Set')
      assert.strictEqual(getKarabastCardPool('HMW', at('2026-10-09')), 'Current')
    })
  })

  describe('rotation', () => {
    it('SPEC: HMW rotates NOTHING — sets 7/8/9 are one batch', () => {
      // Icons is not set 10 and does not rotate anything either; only a
      // numbered core set does. JTL/LOF/SEC survive HMW's release.
      const dayBefore = [...getPremierLegalSets(at('2026-10-08'))].sort()
      const releaseDay = [...getPremierLegalSets(at('2026-10-09'))].sort()
      assert.deepStrictEqual(dayBefore, ['ASH', 'JTL', 'LAW', 'LOF', 'SEC'])
      assert.deepStrictEqual(releaseDay, ['ASH', 'HMW', 'JTL', 'LAW', 'LOF', 'SEC'])
    })

    it('SPEC: HMW release fills the six-set maximum exactly', () => {
      assert.strictEqual(getPremierLegalSets(at('2026-10-09')).size, 6)
    })
  })
})
