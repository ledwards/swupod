import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  activeEntryFor,
  attachPickAndActiveSignals,
  snapshotPerformanceSignals,
  wayfinderEraForSet,
  wayfinderStatsUrl,
  type ActiveRatingSet,
} from './cardDataContract'
import manifest from '../data/activeLimitedRatings.json'

describe('limited card-data contract', () => {
  it('does not rewrite ASH onto the prerelease era unless prerelease is requested', () => {
    assert.equal(wayfinderEraForSet('ASH'), 'ASH')
    assert.equal(wayfinderEraForSet('ASH', true), 'ASH-pre-release')
    assert.equal(wayfinderEraForSet('HMW'), 'HMW')
  })

  it('forwards explicit dates and keeps the selected environment', () => {
    const url = new URL(wayfinderStatsUrl({
      setCode: 'LAW',
      since: '2026-08-01',
      until: '2026-09-01',
      baseUrl: 'https://plugin.example.test',
    })!)
    assert.equal(url.searchParams.get('era'), 'LAW')
    assert.equal(url.searchParams.get('format'), 'limited')
    assert.equal(url.searchParams.get('from'), '2026-08-01')
    assert.equal(url.searchParams.get('to'), '2026-09-01')
  })

  it('keeps performance when pick grades replace the legacy grade', () => {
    const snapshotted = snapshotPerformanceSignals({
      cards: [{ cardName: 'Enoch', subtitle: 'Solemn Servant', grade: 'B', gradeBasis: 'GIH WR', gradeStatus: 'provisional' }],
    })
    const overwritten = {
      ...snapshotted,
      setCode: 'ASH',
      cards: snapshotted.cards!.map(card => ({ ...card, grade: 'A-', gradeBasis: 'Pick Preference', gradePolicy: 'pick-preference-bt', gradeStatus: 'graded' })),
    }
    const attached = attachPickAndActiveSignals(overwritten, null)
    assert.equal(attached.cards![0].performanceGrade.grade, 'B')
    assert.equal(attached.cards![0].pickGrade.grade, 'A-')
    assert.equal(attached.cards![0].grade, 'A-')
  })

  it('leaves pick unavailable when the set has no pick snapshot', () => {
    const attached = attachPickAndActiveSignals(snapshotPerformanceSignals({
      setCode: 'SOR',
      cards: [{ cardName: 'Darth Vader', subtitle: '', grade: 'C', gradeBasis: 'GP WR', gradePolicy: 'wayfinder', gradeStatus: 'graded' }],
    }), null)
    assert.equal(attached.cards![0].pickGrade.status, 'unavailable')
    assert.equal(attached.cards![0].performanceGrade.grade, 'C')
  })

  it('uses a published active rating only for the matching identity', () => {
    const manifest = {
      ASH: {
        set: 'ASH',
        status: 'published' as const,
        reason: 'held-out log loss improved',
        basis: 'blended',
        version: '2026-10-02',
        cards: { 'enoch|solemn servant': { score: 72, grade: 'A-', basis: 'blended', version: '2026-10-02' } },
        leaders: {},
      },
    }
    assert.equal(activeEntryFor(manifest, 'ASH', 'Enoch', 'Solemn Servant', 'card')?.score, 72)
    assert.equal(activeEntryFor(manifest, 'ASH', 'Enoch', 'Other', 'card'), null)
    assert.equal(activeEntryFor(manifest, 'SOR', 'Enoch', 'Solemn Servant', 'card'), null)
  })

  it('accounts for every registered set and publishes none of this refresh', () => {
    const ratings = manifest as Record<string, ActiveRatingSet>
    for (const setCode of ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC', 'LAW', 'ASH', 'HMW']) {
      const set = ratings[setCode]
      assert.ok(set, setCode)
      assert.notEqual(set.status, 'published')
      assert.equal(Object.keys(set.cards).length, 0)
      assert.equal(Object.keys(set.leaders).length, 0)
      assert.equal(activeEntryFor(ratings, setCode, 'Any', 'Card', 'card'), null)
    }
  })
})
