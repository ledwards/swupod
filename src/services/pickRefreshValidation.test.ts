import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePickRefresh } from './pickRefreshValidation'
import { PICK_PREFERENCE_STATS } from '../data/pickPreferences'

test('fresh supported pick snapshots pass; regressions and invalid model strengths do not publish', () => {
  const previous = PICK_PREFERENCE_STATS.HMW!
  const candidate = { ...previous, generatedAt: new Date().toISOString() }
  assert.deepEqual(validatePickRefresh('HMW', candidate, previous), [])
  assert.ok(validatePickRefresh('ASH', candidate, previous).includes('wrong-set'))
  assert.ok(validatePickRefresh('HMW', {...candidate, humanSeats:0}, previous).includes('population-regressed'))
  assert.ok(validatePickRefresh('HMW', {...candidate, cards:candidate.cards.map(c=>({...c,bt:NaN}))}, previous).includes('invalid-card-values'))
  assert.ok(validatePickRefresh('HMW', {...candidate, cards:[]}, previous).includes('insufficient-card-support'))
  assert.ok(validatePickRefresh('HMW', {...candidate, generatedAt:'2020-01-01'}, previous).includes('stale-candidate'))
})
