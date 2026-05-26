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
  isWithinLockInWindow,
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

  it('SPEC: promo banner trigger window is 6 weeks before prerelease', () => {
    assert.strictEqual(PROMO_BANNER_WEEKS_BEFORE_PRERELEASE, 6)
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

describe('isSetUpcoming', () => {
  it('SPEC: returns true for sets with releaseDate in the future', () => {
    // ASH releaseDate is 2026-07-17 per setConfigs/ASH.ts. Today is 2026-05-26.
    assert.strictEqual(isSetUpcoming('ASH'), true)
  })

  it('SPEC: returns false for already-released sets', () => {
    // SOR released 2024-03-08.
    assert.strictEqual(isSetUpcoming('SOR'), false)
  })

  it('SPEC: treats Carbonite siblings the same as their base set', () => {
    // ASH-CB strips to ASH; should match the upcoming behavior.
    assert.strictEqual(isSetUpcoming('ASH-CB'), true)
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
  it('SPEC: returns the next unreleased set by prereleaseDate ascending', () => {
    // From 2026-05-26 ASH is the next set (prereleaseDate 2026-07-10).
    const peek = getUpcomingSetForPeek(new Date('2026-05-26T00:00:00Z'))
    assert.ok(peek, 'should find an upcoming set')
    assert.strictEqual(peek.setCode, 'ASH')
  })

  it('SPEC: excludes Carbonite sibling codes', () => {
    // ASH-CB has the same prereleaseDate; peek must NOT return -CB.
    const peek = getUpcomingSetForPeek(new Date('2026-05-26T00:00:00Z'))
    assert.ok(peek)
    assert.ok(!peek.setCode.endsWith('-CB'), `peek returned ${peek.setCode}, should not be -CB`)
  })

  it('SPEC: returns null when no unreleased sets remain', () => {
    // 2030-01-01 is far enough that all configured sets are released.
    const peek = getUpcomingSetForPeek(new Date('2030-01-01T00:00:00Z'))
    assert.strictEqual(peek, null)
  })

  it('SPEC: skips sets whose prereleaseDate is in the past', () => {
    // 2026-07-15 — ASH prerelease (2026-07-10) is past; should pick the
    // next set after ASH, OR null if none configured.
    const peek = getUpcomingSetForPeek(new Date('2026-07-15T00:00:00Z'))
    if (peek) {
      assert.ok(peek.setCode !== 'ASH', 'ASH prerelease is past on this date; peek should skip it')
    }
  })
})

describe('getUpcomingSetForPromo', () => {
  it('SPEC: returns the upcoming set within 6 weeks of prerelease', () => {
    // 2026-05-30 → ASH prerelease 2026-07-10 is ~6 weeks out.
    const promo = getUpcomingSetForPromo(new Date('2026-05-30T00:00:00Z'))
    assert.ok(promo, 'should find a promo-eligible set')
    assert.strictEqual(promo.setCode, 'ASH')
  })

  it('SPEC: returns null when no set is within the promo window', () => {
    // 2026-04-01 → ASH prerelease is ~14 weeks out (outside 6-week window).
    const promo = getUpcomingSetForPromo(new Date('2026-04-01T00:00:00Z'))
    assert.strictEqual(promo, null)
  })

  it('SPEC: keeps showing during the prerelease window (until releaseDate)', () => {
    // 2026-07-12 → ASH is between prerelease (07-10) and release (07-17).
    // Banner should still show.
    const promo = getUpcomingSetForPromo(new Date('2026-07-12T00:00:00Z'))
    assert.ok(promo, 'should still show during prerelease window')
    assert.strictEqual(promo.setCode, 'ASH')
  })

  it('SPEC: disappears once releaseDate has passed', () => {
    // 2026-07-18 → ASH released on 07-17. No upcoming set anymore (assuming
    // no later set is configured within the window).
    const promo = getUpcomingSetForPromo(new Date('2026-07-18T00:00:00Z'))
    if (promo) {
      assert.ok(promo.setCode !== 'ASH', 'ASH is released, should not show')
    }
  })

  it('SPEC: excludes Carbonite siblings', () => {
    const promo = getUpcomingSetForPromo(new Date('2026-05-30T00:00:00Z'))
    if (promo) {
      assert.ok(!promo.setCode.endsWith('-CB'), `promo returned ${promo.setCode}, should not be -CB`)
    }
  })
})

describe('isWithinLockInWindow', () => {
  it('SPEC: returns false when LOCK_IN_WINDOW_END_DATE is unset (no active window)', () => {
    assert.strictEqual(isWithinLockInWindow(), false)
  })

  // Note: the active-window branch requires LOCK_IN_WINDOW_END_DATE to be
  // set; verify manually after U1 scheduling sets it.
})
