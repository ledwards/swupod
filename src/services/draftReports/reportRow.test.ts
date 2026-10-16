import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { reportAspects, reportMeta, type DraftReportEntry } from './reportRow'

const entry = (over: Partial<DraftReportEntry> = {}): DraftReportEntry => ({
  draftShareId: 'abc', name: 'Friday Night', setCode: 'LAW', setName: 'A Lawless Time', maxPlayers: 8,
  completedAt: '2026-10-10T20:00:00Z', startedAt: null, competitive: false, seatNumber: 1,
  leaderName: 'Boba Fett', leaderBackImageUrl: null, leaderAspects: null, baseName: 'Tarkintown', baseAspects: null, ...over,
})

// Spec (Draft Reports comp): the meta line reads "Oct 10, 2026 · A Lawless Time · 8 players".
describe('reportMeta', () => {
  it('date · set · players', () => {
    assert.equal(reportMeta(entry()), 'Oct 10, 2026 · A Lawless Time · 8 players')
  })
  it('an unfinished draft reads In progress', () => {
    assert.equal(reportMeta(entry({ completedAt: null })), 'In progress · A Lawless Time · 8 players')
  })
})

// Spec: the row shows the deck's aspects as icons, leader first, each aspect once.
describe('reportAspects', () => {
  it('leader aspects, then base aspects, without repeats', () => {
    assert.deepEqual(reportAspects(entry({ leaderAspects: ['Cunning', 'Villainy'], baseAspects: ['Cunning'] })), ['Cunning', 'Villainy'])
  })
  it('base only when the leader has none', () => {
    assert.deepEqual(reportAspects(entry({ baseAspects: ['Command'] })), ['Command'])
  })
  it('nothing known, nothing shown', () => {
    assert.deepEqual(reportAspects(entry()), [])
  })
})
