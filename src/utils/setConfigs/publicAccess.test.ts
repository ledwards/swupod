// Tests for the public-access window — the gate that decides when a set stops
// being beta-only and opens to every user.
//
// SPEC: beta testers get BETA_EXCLUSIVITY_DAYS with a new set to themselves,
// counted from the day we turned it on for them (betaAccessDate), capped at
// FFG's pre-release. Sets with no betaAccessDate keep the original behavior:
// public at prereleaseDate.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  BETA_EXCLUSIVITY_DAYS,
  getPublicAccessDate,
  isBeta,
  SET_CONFIGS,
} from './index'

const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`)

describe('BETA_EXCLUSIVITY_DAYS', () => {
  it('SPEC: beta gets 8 days of exclusivity', () => {
    assert.strictEqual(BETA_EXCLUSIVITY_DAYS, 8)
  })
})

describe('getPublicAccessDate', () => {
  it('SPEC: betaAccessDate + 8 days', () => {
    assert.strictEqual(
      getPublicAccessDate({ betaAccessDate: '2026-09-16', prereleaseDate: '2026-10-02' }),
      '2026-09-24'
    )
  })

  it('SPEC: capped at prereleaseDate — a late beta launch shortens the window', () => {
    // Beta opens 4 days before FFG's pre-release: beta gets 4 days, not 10,
    // because the set is in players' hands from the pre-release onward.
    assert.strictEqual(
      getPublicAccessDate({ betaAccessDate: '2026-09-28', prereleaseDate: '2026-10-02' }),
      '2026-10-02'
    )
  })

  it('SPEC: no betaAccessDate falls back to prereleaseDate (pre-HMW behavior)', () => {
    assert.strictEqual(
      getPublicAccessDate({ prereleaseDate: '2026-07-10' }),
      '2026-07-10'
    )
  })

  it('handles month and year boundaries', () => {
    assert.strictEqual(getPublicAccessDate({ betaAccessDate: '2026-12-28' }), '2027-01-05')
    assert.strictEqual(getPublicAccessDate({ betaAccessDate: '2026-02-24' }), '2026-03-04')
  })

  it('returns null when the set has no dates at all', () => {
    assert.strictEqual(getPublicAccessDate({}), null)
  })

  it('REGRESSION: every existing set is unaffected by the new field', () => {
    // The field must not change any shipped set's public date. Only HMW and
    // later sets are expected to ever carry a betaAccessDate.
    for (const config of Object.values(SET_CONFIGS)) {
      if (config.betaAccessDate) continue
      assert.strictEqual(
        getPublicAccessDate(config),
        config.prereleaseDate ?? null,
        `${config.setCode} public access should still be its prereleaseDate`
      )
    }
  })
})

describe('isBeta with a betaAccessDate', () => {
  const set = {
    ...SET_CONFIGS.HMW,
    betaAccessDate: '2026-09-16',
  }

  it('SPEC: beta-only for the 8 days after beta opens', () => {
    assert.strictEqual(isBeta(set, at('2026-09-16')), true, 'day beta opens')
    assert.strictEqual(isBeta(set, at('2026-09-23')), true, 'day 7')
  })

  it('SPEC: open to everyone on day 8, well before FFG pre-release', () => {
    assert.strictEqual(isBeta(set, at('2026-09-24')), false)
    // The point of the change: public access no longer waits for 2026-10-02.
    assert.ok(getPublicAccessDate(set) < (set.prereleaseDate as string))
  })
})
