// @ts-nocheck
// Tests for src/utils/membership.ts
// Spec: Pricing constants are the single source of truth for on-site copy.
// formatMembershipPrice() adapts when annual ships. isSetUpcoming /
// getUpcomingSetForPeek / getUpcomingSetForPromo unify the three
// conversion surfaces on a single boundary helper.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  MEMBERSHIP_PRICE_MONTHLY_USD,
  MEMBERSHIP_PRICE_ANNUAL_USD,
  PATREON_URL,
  BETA_ENROLL_URL,
  PROMO_BANNER_WEEKS_BEFORE_PRERELEASE,
  formatMembershipPrice,
  isSetUpcoming,
  getUpcomingSetForPeek,
  getUpcomingSetForPromo,
} from './membership.ts'

describe('Pricing constants', () => {
  it('SPEC: monthly price is $9', () => {
    assert.strictEqual(MEMBERSHIP_PRICE_MONTHLY_USD, 9)
  })

  it('SPEC: annual price is null until Patreon eligibility unlocks it', () => {
    assert.strictEqual(MEMBERSHIP_PRICE_ANNUAL_USD, null)
  })

  it('SPEC: Patreon URL points to patreon.com/ProtectthePod', () => {
    assert.strictEqual(PATREON_URL, 'https://patreon.com/ProtectthePod')
  })

  it('SPEC: beta enroll URL is /beta (patron-no-beta CTA branch)', () => {
    assert.strictEqual(BETA_ENROLL_URL, '/beta')
  })

  it('SPEC: promo banner trigger window is 8 weeks before prerelease', () => {
    assert.strictEqual(PROMO_BANNER_WEEKS_BEFORE_PRERELEASE, 8)
  })
})

describe('formatMembershipPrice', () => {
  it('SPEC: returns "$9/month" when annual is null', () => {
    assert.strictEqual(formatMembershipPrice(), '$9/month')
  })

  // Note: the annual-set branch can't be unit-tested without mocking the
  // module export, but the function shape is verified by the constant
  // composition above. When annual ships, set MEMBERSHIP_PRICE_ANNUAL_USD
  // and re-run this suite — the output becomes "$9/month or $60/year".
})

// Note: isSetUpcoming, getUpcomingSetForPeek, and getUpcomingSetForPromo
// are all gated on hasRealCardsForSet(setCode). Today (0 real ASH cards)
// they return false/null for ASH; once a real ASH card lands, ASH lights
// up across all conversion surfaces. The tests below assert behavior
// conditionally on hasRealCardsForSet so they stay green through the
// spoiler-sync lifecycle.

import { hasRealCardsForSet } from './cardData.ts'

describe('isSetUpcoming', () => {
  it('SPEC: returns true for upcoming sets only after a real card is synced', () => {
    if (hasRealCardsForSet('ASH')) {
      assert.strictEqual(isSetUpcoming('ASH'), true, 'ASH should be upcoming once real card lands')
    } else {
      assert.strictEqual(isSetUpcoming('ASH'), false, 'ASH stays gated until first real card')
    }
  })

  it('SPEC: returns false for already-released sets', () => {
    // SOR released 2024-03-08.
    assert.strictEqual(isSetUpcoming('SOR'), false)
  })

  it('SPEC: treats Carbonite siblings the same as their base set', () => {
    // ASH-CB strips to ASH; gate applies the same way.
    assert.strictEqual(isSetUpcoming('ASH-CB'), hasRealCardsForSet('ASH'))
  })

  it('SPEC: returns false for unknown set codes', () => {
    assert.strictEqual(isSetUpcoming('XYZ'), false)
  })

  it('SPEC: returns false for null / undefined', () => {
    assert.strictEqual(isSetUpcoming(null), false)
    assert.strictEqual(isSetUpcoming(undefined), false)
  })
})

describe('getUpcomingSetForPeek', () => {
  it('SPEC: returns ASH only after the first real card lands', () => {
    const peek = getUpcomingSetForPeek(new Date('2026-05-26T00:00:00Z'))
    if (hasRealCardsForSet('ASH')) {
      assert.ok(peek, 'should find an upcoming set once spoilers exist')
      assert.strictEqual(peek.setCode, 'ASH')
    } else {
      assert.strictEqual(peek, null, 'peek stays null until first real card lands')
    }
  })

  it('SPEC: excludes Carbonite sibling codes when peek returns something', () => {
    const peek = getUpcomingSetForPeek(new Date('2026-05-26T00:00:00Z'))
    if (peek) {
      assert.ok(!peek.setCode.endsWith('-CB'), `peek returned ${peek.setCode}, should not be -CB`)
    }
  })

  it('SPEC: returns null when no unreleased sets remain', () => {
    // 2030-01-01 is far enough that all configured sets are released.
    const peek = getUpcomingSetForPeek(new Date('2030-01-01T00:00:00Z'))
    assert.strictEqual(peek, null)
  })

  it('SPEC: skips sets whose prereleaseDate is in the past', () => {
    const peek = getUpcomingSetForPeek(new Date('2026-07-15T00:00:00Z'))
    if (peek) {
      assert.ok(peek.setCode !== 'ASH', 'ASH prerelease is past on this date; peek should skip it')
    }
  })
})

describe('getUpcomingSetForPromo', () => {
  it('SPEC: surfaces ASH within 8 weeks of prerelease only after first real card lands', () => {
    // 2026-06-20 → ~3 weeks before ASH prerelease (2026-07-10), inside 8-week window.
    const promo = getUpcomingSetForPromo(new Date('2026-06-20T00:00:00Z'))
    if (hasRealCardsForSet('ASH')) {
      assert.ok(promo, 'should find a promo-eligible set once spoilers exist')
      assert.strictEqual(promo.setCode, 'ASH')
    } else {
      assert.strictEqual(promo, null, 'promo banner stays hidden until first real card lands')
    }
  })

  it('SPEC: returns null when no set is within the promo window', () => {
    // 2026-05-01 → ASH prerelease is ~10 weeks out (outside 8-week window).
    const promo = getUpcomingSetForPromo(new Date('2026-05-01T00:00:00Z'))
    assert.strictEqual(promo, null)
  })

  it('SPEC: disappears once releaseDate has passed', () => {
    const promo = getUpcomingSetForPromo(new Date('2026-07-18T00:00:00Z'))
    if (promo) {
      assert.ok(promo.setCode !== 'ASH', 'ASH is released, should not show')
    }
  })

  it('SPEC: excludes Carbonite siblings when promo returns something', () => {
    const promo = getUpcomingSetForPromo(new Date('2026-05-30T00:00:00Z'))
    if (promo) {
      assert.ok(!promo.setCode.endsWith('-CB'), `promo returned ${promo.setCode}, should not be -CB`)
    }
  })
})

